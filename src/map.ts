import * as THREE from 'three';

import { MapControls } from "three/examples/jsm/controls/OrbitControls";

import { Grid } from "./Grid";
import { MapCallbackType, myCallbackType } from './interfaces';
import { Object3D } from 'three';
import { HEX } from './Hex';
let { setOptions } = require( "./setoptions.js");

export class HexMap {

    private selector:THREE.Object3D;
    private pointer:THREE.Object3D;
    private Callback:{ [key: string]: myCallbackType } = {};
    private grid:Grid = new Grid();
    private map:object;

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
        let gridHex = new THREE.Group();
        //@ts-ignore
        this.options.width = this.map.w;
        //@ts-ignore
        this.options.height = this.map.h;
        //@ts-ignore
        for(let x = 0; x < this.map.w; x++) {
            //@ts-ignore
            for(let y = 0; y < this.map.h; y++) {
                let color = 0x84aa53;
                //@ts-ignore
                if(this.map[x][y] == "w") {
                    color = 0x6d95b2;
                }
                //@ts-ignore
                if(this.map[x][y] == "t") {
                    color = 0xf2e98c;
                }
                let hex = HEX(x, y, this.options.size, false, color);
                hex.userData = {
                    x: x,
                    y: y,
                    type: "tile",
                    //@ts-ignore
                    land: this.map[x][y]
                }
                gridHex.add(hex);
            }
        } 
        // Hexes for map

        this.Callback[MapCallbackType.geometryAdd](gridHex);
        return gridHex;
    }

    private makeGrid():Grid {
        this.grid = new Grid(this.options.width, this.options.height, this.options.size, true, this.options.gridColor);
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
        selector.position.setY(0.01);
        selector.visible = false;
        this.selector = selector;
        this.Callback[MapCallbackType.geometryAdd](selector);
        return selector;
    }

    public moveSelector(Tile:THREE.Object3D):void {
        this.selector.visible = true;
        this.selector.position.set(Tile.position.x, this.selector.position.y, Tile.position.z);
    }

    private makePointer():Object3D {

        const geometry = new THREE.RingGeometry(0.97 * this.options.size, this.options.size, 6, 2);
        const material = new THREE.MeshBasicMaterial({
            color: this.options.pointerColor
        });

        let pointer:Object3D = new THREE.Mesh(geometry, material);
        pointer.rotateX(-90 * (Math.PI/180));
        pointer.position.setY(0.05);
        pointer.visible = false;
        this.pointer = pointer;
        this.Callback[MapCallbackType.geometryAdd](pointer);
        return pointer;
    }

    public movePointer(Tile:THREE.Object3D):void {
        this.pointer.visible = true;
        this.pointer.position.set(Tile.position.x, this.pointer.position.y, Tile.position.z);
    }
    //----------------------------------------------------------------------------------------------------
    // INTI MAP
    //----------------------------------------------------------------------------------------------------
    public init(mapData:object) {
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