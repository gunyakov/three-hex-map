import * as THREE from 'three';

import { Grid } from "./Grid";
import { MapCallbackType, myCallbackType, Point, TileInfo, MapInfo } from './interfaces';
import { Object3D } from 'three';
import { HEX } from './Hex';
import { getHexCenter } from './helpers';

let { setOptions } = require( "./setoptions.js");

export class HexMap {

    private selector:THREE.Object3D;
    private pointer:THREE.Object3D;
    private Callback:{ [key: string]: myCallbackType } = {};
    private grid:Grid = new Grid();
    private map:MapInfo;

    private options = {
        gridVisible: true,
        gridColor: 0x42322b,
        pointerVisible: true,
        pointerColor: 0xeeeeee,
        selectorVisible: true,
        selectorColor: 0xffff00,
        width: 30,
        height: 30,
        size: 40
    };

    constructor(options:object = {}) {
        setOptions(this, options);
        this.Callback[MapCallbackType.geometryAdd] = function() {};
    }

    private makeMap():THREE.Group {
        let mapHex = new THREE.Group();
        //@ts-ignore
        this.options.width = this.map.w;
        //@ts-ignore
        this.options.height = this.map.h;
        //@ts-ignore
        for(let x = 0; x < this.map.w; x++) {
            
            //@ts-ignore
            for(let y = 0; y < this.map.h; y++) {
                let tileInfo:TileInfo = this.map[x][y];
                let hex = HEX(tileInfo, this.options.size, x, y);
                let position:Point = getHexCenter(x, y, this.options.size);
                hex.position.setX(position.x);
                hex.position.setZ(position.y);
                mapHex.add(hex);
            }
        } 
        // Hexes for map

        this.Callback[MapCallbackType.geometryAdd](mapHex);
        return mapHex;
    }

    private makeGrid():Grid {
        this.grid = new Grid(this.options.width, this.options.height, this.options.size, this.options.gridColor);
        this.grid.visible = this.options.gridVisible;
        this.Callback[MapCallbackType.geometryAdd](this.grid.getGrid());
        return this.grid;
    }

    public get gridVisible():boolean {
        return this.options.gridVisible;
    }

    public set gridVisible(newValue:boolean) {
        this.options.gridVisible = newValue;
        this.grid.visible = newValue;
    }

    private makeSelector():Object3D {

        const geometry = new THREE.RingGeometry(0.97 * this.options.size, this.options.size, 6, 2);
        const material = new THREE.MeshBasicMaterial({
            color: this.options.selectorColor
        });

        let selector:Object3D = new THREE.Mesh(geometry, material);
        selector.rotateX(-90 * (Math.PI/180));
        selector.position.setY(this.options.size / 10 + 1.1);
        selector.visible = false;
        this.selector = selector;
        this.Callback[MapCallbackType.geometryAdd](selector);
        return selector;
    }

    public moveSelector(userData:Point):void {
        let position:Point = getHexCenter(userData.x, userData.y, this.options.size);
        console.log(userData, this.map[userData.x][userData.y]);
        this.selector.visible = true;
        this.selector.position.setX(position.x);
        this.selector.position.setZ(position.y);
        
    }

    private makePointer():Object3D {

        const geometry = new THREE.RingGeometry(0.97 * this.options.size, this.options.size, 6, 2);
        const material = new THREE.MeshBasicMaterial({
            color: this.options.pointerColor
        });

        let pointer:Object3D = new THREE.Mesh(geometry, material);
        pointer.rotateX(-90 * (Math.PI/180));
        pointer.position.setY(this.options.size / 10 + 1.1);
        pointer.visible = false;
        this.pointer = pointer;
        this.Callback[MapCallbackType.geometryAdd](pointer);
        return pointer;
    }

    public movePointer(userData:Point):void {
        let position:Point = getHexCenter(userData.x, userData.y, this.options.size);
        this.pointer.visible = true;
        this.pointer.position.setX(position.x);
        this.pointer.position.setZ(position.y);
    }
    //----------------------------------------------------------------------------------------------------
    // INTI MAP
    //----------------------------------------------------------------------------------------------------
    public init(mapData:MapInfo) {
        this.map = mapData;
        //Gen map
        this.makeMap();
        //Gen hex grid for map
        this.makeGrid();
        //Gen selector for map
        this.makeSelector();
        //Gen pointer for map
        this.makePointer();
    }
    //----------------------------------------------------------------------------------------------------
    // CALLBACKS REGISTRATION
    //----------------------------------------------------------------------------------------------------
    public on(index:string, callback:myCallbackType):void {
        this.Callback[index] = callback;
    }
}