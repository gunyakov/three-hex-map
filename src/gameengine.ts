
import { HexMap } from "./map";
import { setOptions } from "./helpers/setoptions";
import { Unit } from "./objects/Unit"

import { Point, MapInfo, UnitInfo, myCallbackType} from "./interfaces";
import { MapCallbackType, Land } from "./enums";

import { PathFinder } from "./helpers/pathfinder";

import axios from "axios";

export class GameEngine {

    private Callback:{ [key: string]: myCallbackType } = {};
    private _map:HexMap
    private _mapData:MapInfo;
    private _unitsList:{ [key:string]:Unit } = {};
    private _currentUnit:Unit;

    private options = {
        element: "",
        map: {},
        preventCellClick: true
    }

    constructor(options:object = {}) {
        //Merge options with default options
        setOptions(this, options);
        //Init map container
        this._map = new HexMap({ element: this.options.element});
        //---------------------------------------------------------------------------------------------
        //REGISTER CALLBACK FOR CLICK
        //---------------------------------------------------------------------------------------------
        this._map.on(MapCallbackType.cellClick, this.cellClick.bind(this));
        this._map.on(MapCallbackType.cellMove, this.cellMove.bind(this));

        this.Callback[MapCallbackType.unitClick] = function() {};
        this.Callback[MapCallbackType.cellClick] = function() {};
    }

    public async init() {
        
        //Get map data 
        let responseMap  = await axios.get<MapInfo>("gameInfo/map.json");
        //Get units data
        let responseUnits = await axios.get<UnitInfo[]>("gameInfo/units.json");
        //If both request without errors
        if(responseMap.statusText == "OK" && responseUnits.statusText == "OK") {
            //Save map data
            this._mapData = responseMap.data;
            //Draw only map
            await this._map.init(this._mapData);
            //Reg callabck, to know when user click on hex cell
            this._map.on(MapCallbackType.cellClick, this.cellClick.bind(this));
            //Create unit list puted on the map
            for(let i = 0; i < responseUnits.data.length; i++) {
                console.log(responseUnits.data[i]);
                let unit = new Unit(responseUnits.data[i]);
                await unit.setUnit();
                this._map.add(unit.unit);
                this._unitsList[unit.id] = unit;
                this._mapData['data'][unit.position.x][unit.position.y]['unit'] = unit.id;
            }
        }
        else {
            console.log("Error during loading map or units data. Abort.");
        }
    }

    private cellMove(cellCoords:Point) {
        //Clean route path
        this._map.cleanRoutePath();
        //If previosly was selected unit
        if(typeof this._currentUnit !== "undefined") {
            //Try to find path to current cell from unit coords
            //console.log(this._currentUnit.position);
            let path = this.findPath(this._currentUnit.position, cellCoords);
            //If path finded
            if(path.length > 0) {
                //Draw path on map
                this._map.drawRoutePath(path);
            }
        }
    }

    private cellClick(cellCoords:Point) {
        //Get Unit ID from cell
        let unitID = this._mapData['data'][cellCoords.x][cellCoords.y]['unit'];
        console.log(unitID);
        //If unit exist in cell
        if(typeof unitID !== "undefined") {
            //If no need prevent rise cellclick when rise unit click event
            if(!this.options.preventCellClick) {
                //Fire callback, that game cell click
                this.Callback[MapCallbackType.cellClick](cellCoords);
            }
            //Save current unit object 
            this._currentUnit = this._unitsList[unitID];
            console.log(this._currentUnit);
            //Fire callback, that game unit click
            this.Callback[MapCallbackType.unitClick](cellCoords);
        }
        //If unit isnt exits in cell
        else {
            //If we select unit before
            if(this._currentUnit) {
                //Try to find path to current cell from unit coords
                let path = this.findPath(this._currentUnit.position, cellCoords);
                if(path.length > 0) {
                    //Detete unit from current cell
                    this._mapData['data'][this._currentUnit.position.x][this._currentUnit.position.y]['unit'] = undefined;
                    //Start move animation for unit
                    this._currentUnit.moveTo(path);
                    //Change data of map that unit move from cell to cell
                    this._mapData['data'][cellCoords.x][cellCoords.y]['unit'] = this._currentUnit.id;
                } 
            }
            //Clear all units from memory
            this._currentUnit = undefined;
            //Fire callback, that game cell click
            this.Callback[MapCallbackType.cellClick](cellCoords);
        }
        console.log("point", cellCoords);
    }

    private unitClick(cellCoords:Point) {

    }

    public get currentUnit():Unit {
        return this._currentUnit;
    }

    public get map():HexMap {
        return this._map;
    }

    public findPath(start:Point, stop:Point):Point[] {

        //this.routeGroupe = new THREE.Group();

        let restrictions:{ [key in Land]:boolean} = {
            sea: true,
            shore: true,
            land: false,
            sand: true,
            tundra: false,
            snow: false
        }

        let pathFinder = new PathFinder(this._mapData, restrictions);

        let path:Point[] = pathFinder.find(start.x, start.y, stop.x, stop.y);

        if(path.length > 0) {
            return path;
        }
        else {
            return new Array<Point>;
        }
    }

    //----------------------------------------------------------------------------------------------------
    // CALLBACKS REGISTRATION
    //----------------------------------------------------------------------------------------------------
    public on(index:string, callback:myCallbackType):void {
        this.Callback[index] = callback;
    }
}