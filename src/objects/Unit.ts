import { wait } from "../helpers/helpers";
import { setOptions } from "../helpers/setoptions";

import { Point, UnitInfo } from "../interfaces";

import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'

import { getHexCenter } from '../helpers/helpers';
import { CurvePath, Object3D, Vector3, LineCurve3 } from "three";
import axios from "axios";
import { UnitActions } from "../enums";

export class Unit {

    private needAnimate = false;
    private _unit:Object3D;
    private _action:UnitActions;
    private pathFraction:number = 0;
    private pointsPath:THREE.CurvePath<THREE.Vector>;

    private options = {
        animateFrameRate: 50,        //Framerate: how much per second run animate function
        animateSpeed: 1,             //Animate speed: how much seconds spend to move from 1 cell to second cell
        size: 40,                    //Map size to calculate unit position on map
        type: "viking_boat",         //File name to load
        format: "fbx",               //File format to load    
        x: 0,
        y: 0,
        scale: 0.15,
        positionY: 4,
        actions: new Array<UnitActions>(),
        id: "new id"          
    };

    constructor(options:object = {}) {
        //Merge options with default options
        setOptions(this, options);
    }

    public async setUnit():Promise<void> {
        //Get asset info about unit
        let response = await axios.get<UnitInfo>(`Assets/units/${this.options.type}.json`);
        if(response.status == 200) {
            //Merge options from json file and current options
            setOptions(this, response.data);
            //Switch file format
            switch(this.options.format) {
                case "fbx":
                    //Get fbx file
                    this._unit = await this.fbxLoader();
                    break;
                default: 
                    console.log("Cant load unit file. Unsupported file format");
            }
            //If 3D model was loaded
            if(this._unit) {
                //Set Y axis offset
                this._unit.position.setY(this.options.positionY);
                //Set scale for model
                this._unit.scale.set(this.options.scale, this.options.scale, this.options.scale);
                //Get center of hexagon
                let position:Point = getHexCenter(this.options.x, this.options.y, this.options.size);
                //Set 3D model center to current hexagon
                this._unit.position.setX(position.x);
                this._unit.position.setZ(position.y); 
            }
        }
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

        const pointsPath = new CurvePath();
        
        let prevPoint3:THREE.Vector3 = new Vector3(0, 0, 0);

        for(let i = 0; i < path.length; i++) {

            let position:Point = getHexCenter(path[i]['x'], path[i]['y'], this.options.size);

            let point3ForRoute = new Vector3( position.x, 4, position.y );

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
        this.needAnimate = true;
        this.animation(path.length);
    }

    private async fbxLoader():Promise<Object3D> {
        let fileToLoad = `Assets/models/${this.options.type}.${this.options.format}`;
        return new Promise((resolve, reject) => {
            const fbxLoader = new FBXLoader();
            fbxLoader.load(fileToLoad,
            (object) => {
                resolve(object);
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
            },
            (error) => {
                reject
                console.log(error)
            }
            )
        });
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
                    let axis = new Vector3( );
                    //@ts-ignore
                    axis.crossVectors( up, tangent ).normalize( );	
                    //@ts-ignore
                    let radians = Math.acos( up.dot( tangent ) );
                    //Move unit to position
                    //@ts-ignore
                    this.unit.position.copy( newPosition );
                    //Rotate unit to needed angle
                    this.unit.quaternion.setFromAxisAngle( axis, radians );
                }
                //Wait to move unit animateFrameRate times per second
                await wait(Math.floor(1000 / this.options.animateFrameRate));
            }  
        } 
    }
}