import { wait } from "../helpers/helpers";
import { setOptions } from "../helpers/setoptions";
import { loadModel } from "../helpers/models";

import { Point } from "../interfaces";

import { getHexCenter } from "../helpers/helpers";
import { CurvePath, Object3D, Vector3, LineCurve3 } from "three";
import { Land, UnitActions } from "../enums";
import { EventEmitter } from "../EventEmitter";

//----------------------------------------------------------------------------------
//Emits "start_move" when a moveTo() animation begins and "end_move" when the unit
//reaches its destination - consumers subscribe via unit.on("start_move", ...) /
//unit.on("end_move", ...), or GameEngine relays them to its own emitter.
//
//`type` is a model folder path (model.glb + info.json) - the same folder +
//info.json convention as Forest.ts/TerrainMesh's city models (see
//helpers/models.ts), and just as self-sufficient (no hidden prefix joined onto
//it): info.json holds both the model's own offset/rotation/scale fine-tuning
//*and* this unit's gameplay stats (movement/health/actions/etc.), merged into
//`options` in one go. glTF/.glb only - three.js's own docs recommend it over
//FBX, and Blender's exporter handles it well, so there's no reason to carry a
//second loader/format for units specifically.
//----------------------------------------------------------------------------------
export class Unit extends EventEmitter {

    private needAnimate = false;
    private _unit:Object3D;
    private _action:UnitActions;
    private pathFraction:number = 0;
    private pointsPath:CurvePath<Vector3>;
    //Path currently being animated + the cell the model is nearest to right
    //now. moveTo() sets options.x/y to the *destination* immediately (so game
    //logic like "which tile holds this unit" is stable), which means position
    //is wrong as a fog-of-war viewpoint for the whole duration of the
    //animation - viewPosition below tracks the actual animated location
    //instead, and "cell_enter" fires as it crosses into each new cell.
    private movePath:Point[] | null = null;
    private _viewCell:Point | null = null;

    private options = {
        animateFrameRate: 50,        //Framerate: how much per second run animate function
        animateSpeed: 1,             //Animate speed: how much seconds spend to move from 1 cell to second cell
        size: 40,                    //Map size to calculate unit position on map
        type: "Assets/units/viking_boat", //Model folder path (model.glb + info.json), same convention as city.model/treeModel
        x: 0,
        y: 0,
        actions: new Array<UnitActions>(),
        id: "new id",
        viewRange: 0, //Hex tiles seen around this unit (see FogOfWar.ts) - overridden by the model's own info.json
        //Terrain the unit may enter, overridden by the model's own info.json
        //(e.g. the viking boat sets coastal only) - default deny, so a unit
        //whose info.json omits a terrain type never routes across it.
        sea: false,
        coastal: false,
        land: false,
        sand: false,
        tundra: false,
        snow: false,
        mountain: false
    };

    constructor(options:object = {}) {
        super();
        //Merge options with default options
        setOptions(this, options);
    }

    public async setUnit():Promise<void> {
        const { scene, info, fixup } = await loadModel(this.options.type);
        //Merge gameplay stats (movement/health/actions/...) from info.json with current options
        setOptions(this, info);

        //Model's own offset/rotation/scale fine-tuning (info.json) applies to a
        //child, not this._unit itself - moveTo()/animation() drive this._unit's
        //position/quaternion directly for path movement, so it must stay a plain
        //placement transform (hex position only), not also carry the asset fixup.
        const model = scene.clone(true);
        model.applyMatrix4(fixup);

        this._unit = new Object3D();
        this._unit.add(model);

        //Get center of hexagon
        let position:Point = getHexCenter(this.options.x, this.options.y, this.options.size);
        //Set 3D model center to current hexagon
        this._unit.position.set(position.x, 0, position.y);
    }
    //----------------------------------------------------------------------------------------------------------
    //RETURN CURRENT 3D Object
    //----------------------------------------------------------------------------------------------------------
    public get unit() {
        return this._unit;
    }

    public get actions() {
        return this.options.actions;
    }

    public get position():Point {
        return { x: this.options.x, y: this.options.y }
    }

    public get id():string {
        return this.options.id;
    }

    public get viewRange():number {
        return this.options.viewRange;
    }

    //Which Land types this unit may enter (its info.json terrain flags) -
    //feeds PathFinder so a route never crosses a tile the unit can't reach.
    public get terrain():{ [key in Land]:boolean } {
        return {
            [Land.sea]: this.options.sea,
            [Land.coastal]: this.options.coastal,
            [Land.land]: this.options.land,
            [Land.sand]: this.options.sand,
            [Land.tundra]: this.options.tundra,
            [Land.snow]: this.options.snow,
            [Land.mountain]: this.options.mountain
        };
    }

    //Where the unit actually is *right now* - the cell nearest the animated
    //model while a moveTo() is in flight, its resting position otherwise. Use
    //this (not position, which jumps to the destination the moment moveTo()
    //is called) as the fog-of-war viewpoint, so tiles reveal as the unit
    //passes them instead of the whole route lighting up at once.
    public get viewPosition():Point {
        return this._viewCell ?? this.position;
    }
    public set position(position:Point) {
        this.options.y = position.y;
        this.options.x = position.x;
    }

    public activate(action:UnitActions):void {
        if (this.options.actions.includes(action)) {
            this._action = action;
        }
        else {
            console.log(`${action} isnt inside enum UnitActions, skip.`);
        }
    }

    public moveTo(path:Point[]) {

        //Get last poin and save like current unit position
        this.options.x = path[path.length - 1]['x'];
        this.options.y = path[path.length - 1]['y'];

        const pointsPath = new CurvePath<Vector3>();

        let prevPoint3:Vector3 = new Vector3(0, 0, 0);

        for(let i = 0; i < path.length; i++) {

            let position:Point = getHexCenter(path[i]['x'], path[i]['y'], this.options.size);

            let point3ForRoute = new Vector3( position.x, 0, position.y );

            if(i > 0) {

                const Line = new LineCurve3(

                    prevPoint3,
                    point3ForRoute,

                );

                pointsPath.add( Line );
            }

            prevPoint3 = point3ForRoute;

        }

        this.pointsPath = pointsPath;
        this.movePath = path;
        this._viewCell = path[0];
        this.needAnimate = true;
        this.emit("start_move", { id: this.id, from: path[0], to: this.position, path });
        this.animation(path.length);
    }

    private async animation(cellCount:number):Promise<void> {
        //If need animate unit
        if(this.needAnimate) {
            //Calculate animation fraction
            let pathFraction = 1 / (cellCount * this.options.animateSpeed * this.options.animateFrameRate);
            //Run until reach final destination
            while(this.needAnimate) {
                //Calcalate next poin of move
                this.pathFraction += pathFraction;
                //If unit reach final point
                if ( this.pathFraction > 1 ) {
                    this.pathFraction = 0;
                    this.needAnimate = false;
                }
                //If unit dont reach final point
                else {
                    //Get coords from path
                    let newPosition = this.pointsPath.getPoint( this.pathFraction );
                    //Get angle to rotate unit
                    let tangent = this.pointsPath.getTangent( this.pathFraction );
                    const up = new Vector3( 0, 0, 1 );
                    let axis = new Vector3();
                    axis.crossVectors( up, tangent ).normalize( );
                    let radians = Math.acos( up.dot( tangent ) );
                    //Move unit to position
                    this.unit.position.copy( newPosition );
                    //Rotate unit to needed angle
                    this.unit.quaternion.setFromAxisAngle( axis, radians );

                    //Emit "cell_enter" whenever the model crosses into the
                    //next cell of the path (nearest waypoint to the current
                    //animation fraction) - consumers (GameEngine's fog of
                    //war) reveal the map from viewPosition per cell, instead
                    //of the whole route at once when the move started.
                    if (this.movePath && this._viewCell) {
                        const cellIndex = Math.round(this.pathFraction * (this.movePath.length - 1));
                        const cell = this.movePath[cellIndex];
                        if (cell && (cell.x !== this._viewCell.x || cell.y !== this._viewCell.y)) {
                            this._viewCell = cell;
                            this.emit("cell_enter", { id: this.id, cell });
                        }
                    }
                }
                //Wait to move unit animateFrameRate times per second
                await wait(Math.floor(1000 / this.options.animateFrameRate));
            }
            this.movePath = null;
            this._viewCell = null;
            this.emit("end_move", { id: this.id, position: this.position });
        }
    }
}
