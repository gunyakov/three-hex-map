import { HexMap, HexMapOptions } from "./HexMap";
import { setOptions } from "./helpers/setoptions";
import { Unit } from "./objects/Unit";

import { Point, MapInfo, UnitInfo, TileInfo } from "./interfaces";
import { Land } from "./enums";

import { PathFinder } from "./helpers/pathfinder";
import { EventEmitter } from "./EventEmitter";

export interface GameEngineOptions extends HexMapOptions {
    preventCellClick?: boolean;
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

    private options = {
        preventCellClick: true
    };

    constructor(options:GameEngineOptions) {
        super();
        setOptions(this, options);
        this._map = new HexMap(options);
        this._map.on("click", (payload:{x:number,y:number,tile:TileInfo}) => this.cellClick(payload));
        this._map.on("hover", (payload:{x:number,y:number,tile:TileInfo}) => this.cellHover(payload));
    }

    public async init(mapData:MapInfo, unitsData:UnitInfo[] = []):Promise<void> {
        this._mapData = mapData;
        await this._map.load(mapData);

        for (const unitInfo of unitsData) {
            const unit = new Unit(unitInfo);
            await unit.setUnit();
            unit.on("start_move", payload => this.emit("start_move", payload));
            unit.on("end_move", payload => this.emit("end_move", payload));
            this._map.add(unit.unit);
            this._unitsList[unit.id] = unit;
            this._mapData.data[unit.position.x][unit.position.y].unit = unit.id;
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

    public findPath(start:Point, stop:Point):Point[] {
        const restrictions:{ [key in Land]:boolean } = {
            sea: true,
            shore: true,
            land: false,
            sand: true,
            tundra: false,
            snow: false
        };

        const pathFinder = new PathFinder(this._mapData, restrictions);
        return pathFinder.find(start.x, start.y, stop.x, stop.y);
    }
}
