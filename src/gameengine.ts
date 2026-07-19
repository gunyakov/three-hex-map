import { HexMap, HexMapOptions } from "./HexMap";
import { setOptions } from "./helpers/setoptions";
import { Unit } from "./objects/Unit";
import { FogOfWar, FogState } from "./objects/FogOfWar";

import { Point, MapInfo, UnitPlacement, TileInfo } from "./interfaces";
import { Land } from "./enums";

import { PathFinder } from "./helpers/pathfinder";
import { EventEmitter } from "./EventEmitter";

export interface GameEngineOptions extends HexMapOptions {
    preventCellClick?: boolean;

    //Fog of war (see objects/FogOfWar.ts), default true: every unit reveals
    //tiles within its own viewRange (from its Assets/units/.../info.json);
    //tiles outside every unit's current range fall back to darkened
    //("Explored") if seen before, or the war-fog texture ("Unseen") if not.
    //Set to false to leave every tile permanently Visible, the old behavior.
    fogOfWar?: boolean;
}

//----------------------------------------------------------------------------------
//Optional convenience layer on top of HexMap: wires unit selection, click-to-move
//pathfinding and hover route preview. Unlike the old GameEngine, this one does not
//fetch map/unit data itself (no axios dependency) - the caller loads its own JSON
//(see public/index.html) and passes it to init(). This keeps HTTP fetching out of the
//library, while still giving consumers a batteries-included game loop if they want
//it (as opposed to using bare HexMap + Unit + PathFinder directly).
//----------------------------------------------------------------------------------
export class GameEngine extends EventEmitter {

    private _map:HexMap;
    private _mapData:MapInfo;
    private _unitsList:{ [key:string]:Unit } = {};
    private _currentUnit:Unit | undefined;
    private _fog:FogOfWar | undefined;

    private options = {
        preventCellClick: true,
        fogOfWar: true
    };

    constructor(options:GameEngineOptions) {
        super();
        setOptions(this, options);
        this._map = new HexMap(options);
        this._map.on("click", (payload:{x:number,y:number,tile:TileInfo}) => this.cellClick(payload));
        this._map.on("hover", (payload:{x:number,y:number,tile:TileInfo}) => this.cellHover(payload));
    }

    public async init(mapData:MapInfo, unitsData:UnitPlacement[] = []):Promise<void> {
        this._mapData = mapData;
        await this._map.load(mapData);

        for (const unitInfo of unitsData) {
            const unit = new Unit({ ...unitInfo, size: this._map.size });
            await unit.setUnit();
            unit.on("start_move", payload => this.emit("start_move", payload));
            unit.on("end_move", payload => this.emit("end_move", payload));
            //Fog recomputes per cell the unit actually passes through (see
            //Unit's "cell_enter"/viewPosition), NOT on start_move - position
            //jumps to the destination the moment a move starts, so a
            //start_move recompute would reveal the whole route instantly
            //instead of progressively as the unit travels it.
            unit.on("cell_enter", payload => {
                this.emit("cell_enter", payload);
                this.recomputeFog();
            });
            unit.on("end_move", () => this.recomputeFog());
            this._map.add(unit.unit);
            this._unitsList[unit.id] = unit;
            this._mapData.data[unit.position.x][unit.position.y].unit = unit.id;
        }

        if (this.options.fogOfWar) {
            this._fog = new FogOfWar(mapData);
            // FogOfWar itself starts all-Unseen, but HexMap defaults every
            // tile to Visible until told otherwise (see setTileFog()) - push
            // the Unseen state through once so the two actually agree before
            // recomputeFog() reveals whatever's within a unit's view range.
            for (const tile of this._fog.allTiles()) this._map.setTileFog(tile.x, tile.y, tile.state);
            this.recomputeFog();
        }
    }

    //Recomputes which tiles are currently visible from every unit's own
    //{x, y, viewRange} (see FogOfWar.recompute()), pushes only the tiles whose
    //state actually changed into HexMap.setTileFog(), and hides/shows each
    //unit's own model - a unit always sees its own tile, so this never hides
    //a unit standing still, only ones that have moved out of view (there's no
    //ownership/faction concept yet, so every unit in _unitsList reveals fog
    //the same way "friendly" units would). Uses viewPosition, not position:
    //during a moveTo() animation position is already the destination, while
    //viewPosition tracks the cell the model is actually passing through.
    private recomputeFog():void {
        if (!this._fog) return;

        const units = Object.values(this._unitsList);
        const changes = this._fog.recompute(units.map(u => ({ ...u.viewPosition, viewRange: u.viewRange })));
        for (const change of changes) this._map.setTileFog(change.x, change.y, change.state);

        for (const unit of units) {
            unit.unit.visible = this._fog.getState(unit.viewPosition.x, unit.viewPosition.y) === FogState.Visible;
        }
    }

    private cellHover(payload:{x:number,y:number,tile:TileInfo}):void {
        this._map.cleanRoutePath();
        if (this._currentUnit) {
            const path = this.findPath(this._currentUnit.position, payload);
            if (path.length > 0) this._map.drawRoutePath(path);
        }
        this.emit("hover", payload);
    }

    private cellClick({ x, y }:{x:number,y:number}):void {
        const cellCoords:Point = { x, y };
        const unitID = this._mapData.data[x][y].unit;

        if (unitID) {
            if (!this.options.preventCellClick) {
                this.emit("click", cellCoords);
            }
            this._currentUnit = this._unitsList[unitID];
            this.emit("unitClick", cellCoords);
        } else {
            if (this._currentUnit) {
                const path = this.findPath(this._currentUnit.position, cellCoords);
                if (path.length > 0) {
                    delete this._mapData.data[this._currentUnit.position.x][this._currentUnit.position.y].unit;
                    this._currentUnit.moveTo(path);
                    this._mapData.data[x][y].unit = this._currentUnit.id;
                }
            }
            this._currentUnit = undefined;
            this.emit("click", cellCoords);
        }
    }

    public get currentUnit():Unit | undefined {
        return this._currentUnit;
    }

    public get map():HexMap {
        return this._map;
    }

    public get fogOfWar():FogOfWar | undefined {
        return this._fog;
    }

    //Terrain restrictions come from the unit's own info.json flags (see
    //Unit.terrain - e.g. the viking boat is coastal-only), not a global table,
    //so each unit type routes over exactly the tiles it may enter. Defaults to
    //the currently selected unit; without any unit every terrain is allowed.
    public findPath(start:Point, stop:Point, unit:Unit | undefined = this._currentUnit):Point[] {
        const restrictions:{ [key in Land]:boolean } = unit ? unit.terrain : {
            sea: true,
            coastal: true,
            land: true,
            sand: true,
            tundra: true,
            snow: true,
            mountain: true
        };

        //Tiles still under war fog (Unseen - never viewed by any unit) are
        //off-limits for routing: the player doesn't know what's there, so the
        //pathfinder must not "know" either. Explored tiles (seen before, now
        //dimmed) stay routable. With fogOfWar disabled there's no fog tracker
        //and no veto - the old behavior.
        const fog = this._fog;
        const pathFinder = new PathFinder(this._mapData, restrictions,
            fog ? (x, y) => fog.getState(x, y) !== FogState.Unseen : undefined);
        return pathFinder.find(start.x, start.y, stop.x, stop.y);
    }
}
