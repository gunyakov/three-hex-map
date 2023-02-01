import * as THREE from 'three';

import { Grid } from "./objects/Grid";
import { myCallbackType, Point, TileInfo, MapInfo } from './interfaces';
import { MapCallbackType, Land } from './enums';
import { HEX } from './objects/Hex';
import { getHexCenter } from './helpers/helpers';

import { Scene } from "./Scene";

import { setOptions } from "./helpers/setoptions";

export class HexMap {

    private selector:THREE.Object3D;
    private pointer:THREE.Object3D;
    private Callback:{ [key: string]: myCallbackType } = {};
    private grid:Grid = new Grid();
    private map:MapInfo;
    private _scene:THREE.Scene;
    private _lastCoordsClicked:Point = {x: 0, y:0};
    private _lastCellMove:Point = {x:0, y:0};
    private _pathLine:THREE.Line;

    private options = {
        gridVisible: true,
        gridColor: 0x42322b,
        pointerVisible: true,
        pointerColor: 0xeeeeee,
        selectorVisible: true,
        selectorColor: 0xffff00,
        width: 30,
        height: 30,
        size: 40,
        element: '[data-scene]'
    };

    constructor(options:object = {}) {
        //Merge options with default options
        setOptions(this, options);
        //Default callbacks to prevent any errors
        this.Callback[MapCallbackType.cellClick] = function() {};
        this.Callback[MapCallbackType.mousemove] = function() {};
        //Get element for render
        const sceneEl = document.querySelector(this.options.element);
        //Init scene
        let GameScene = new Scene(sceneEl);
        this._scene = GameScene.getScene();
        //Make axes helper is visible
        GameScene.axesVisible = true;
        //---------------------------------------------------------------------------------------------
        //REGISTER CALLBACK FOR CLICK
        //---------------------------------------------------------------------------------------------
        GameScene.on(MapCallbackType.cellClick, this.cellClick.bind(this));
        //---------------------------------------------------------------------------------------------
        //REGISTER CALLBACK FOR MOVEMENT OF POINTER
        //---------------------------------------------------------------------------------------------
        GameScene.on(MapCallbackType.mousemove, this.mousemove.bind(this)); 
        //---------------------------------------------------------------------------------------------
        //REGISTER CALLBACK FOR ANIMATE
        //---------------------------------------------------------------------------------------------
        GameScene.on(MapCallbackType.animate, this.animate.bind(this)); 
    }

    private cellClick(Tile:THREE.Object3D):void {

        this.cleanRoutePath();
        
        //Call callbacks to external functions.
        let cellCoords:Point = {x: Tile.userData.x, y: Tile.userData.y};

        this.Callback[MapCallbackType.cellClick](cellCoords);

        this.moveSelector(Tile);

        if(this._lastCoordsClicked.x > 0 || this._lastCoordsClicked.y > 0) {         
                    
        }

        if(this.map['data'][cellCoords.x][cellCoords.y]['unit'] !== "none") {
            this._lastCoordsClicked = cellCoords;
            console.log("Cell with unit");
        }
        else {
            this._lastCoordsClicked = {x: 0, y: 0};
        }
        
    }

    private makeMap():void {
        let mapHex = new THREE.Group();
        //@ts-ignore
        this.options.width = this.map.w;
        //@ts-ignore
        this.options.height = this.map.h;
        //@ts-ignore
        for(let x = 0; x < this.map.w; x++) {
            //@ts-ignore
            for(let y = 0; y < this.map.h; y++) {
                let tileInfo:TileInfo = this.map['data'][x][y];
                let hex = HEX(tileInfo, this.options.size, x, y);
                let position:Point = getHexCenter(x, y, this.options.size);
                hex.position.setX(position.x);
                hex.position.setZ(position.y);
                mapHex.add(hex);
            }
        } 
        // Hexes for map
        this._scene.add(mapHex);
    }

    private makeGrid():void {
        this.grid = new Grid(this.options.width, this.options.height, this.options.size, this.options.gridColor);
        this.grid.visible = this.options.gridVisible;
        this._scene.add(this.grid.getGrid());
    }

    public get gridVisible():boolean {
        return this.options.gridVisible;
    }

    public set gridVisible(newValue:boolean) {
        this.options.gridVisible = newValue;
        this.grid.visible = newValue;
    }

    private makeSelector():void {

        const geometry = new THREE.RingGeometry(0.97 * this.options.size, this.options.size, 6, 2);
        const material = new THREE.MeshBasicMaterial({
            color: this.options.selectorColor
        });

        this.selector = new THREE.Mesh(geometry, material);
        this.selector.rotateX(-90 * (Math.PI/180));
        this.selector.position.setY(this.options.size / 10 + 1.1);
        this.selector.visible = false;
        this._scene.add(this.selector);
    }

    public moveSelector(Tile:THREE.Object3D):void {
        let cellCoords:Point = {x: Tile.userData.x, y: Tile.userData.y};
        let position:Point = getHexCenter(cellCoords.x, cellCoords.y, this.options.size);
        this.selector.visible = true;
        this.selector.position.setX(position.x);
        this.selector.position.setZ(position.y);
    }

    private makePointer():void {
        const geometry = new THREE.RingGeometry(0.97 * this.options.size, this.options.size, 6, 2);
        const material = new THREE.MeshBasicMaterial({
            color: this.options.pointerColor
        });

        this.pointer = new THREE.Mesh(geometry, material);
        this.pointer.rotateX(-90 * (Math.PI/180));
        this.pointer.position.setY(this.options.size / 10 + 1.1);
        this.pointer.visible = false;
        this._scene.add(this.pointer);
    }

    private mousemove(Tile:THREE.Object3D):void {
        //Get cell coords from scene
        let cellCoords:Point = {x: Tile.userData.x, y: Tile.userData.y};
        //If mouse move fired not in the same cell 
        //Prevent code execution if mouse move in same cell
        if(this._lastCellMove.x != cellCoords.x || this._lastCellMove.y != cellCoords.y) {
            //Get center in pixels from cell coords
            let position:Point = getHexCenter(cellCoords.x, cellCoords.y, this.options.size);
            //Show pointer
            this.pointer.visible = true;
            //Set position of pointer
            this.pointer.position.setX(position.x);
            this.pointer.position.setZ(position.y);
            //Save last cell coords
            this._lastCellMove = cellCoords;
            //Fire callback to notice game engine of pointer move
            this.Callback[MapCallbackType.cellMove](cellCoords);
        }
        
    }

    private makeFog():THREE.Object3D {
        let size = this.options.size * this.options.height;
        var fogTexture = new THREE.TextureLoader().load( 'textures/war-fog.jpg' );
        var fogAlpha = new THREE.TextureLoader().load( 'textures/hills-ambient.png' );
        fogTexture.wrapS = fogTexture.wrapT = THREE.RepeatWrapping; 
        fogTexture.repeat.set( 10, 10 );
        // DoubleSide: render texture on both sides of mesh
        var floorMaterial = new THREE.MeshBasicMaterial( { 
            map: fogTexture, 
            side: THREE.DoubleSide ,
            alphaMap: fogAlpha,
            transparent: true,
            opacity: 1
        } );
        var floorGeometry = new THREE.PlaneGeometry(size * 3, size * 3, 1, 1);
        var floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = this.options.size / 10 + 5;
        floor.position.x = size / 2;
        floor.position.z = size / 2;
        floor.rotation.x = -Math.PI / 2;
        floor.rotation.z = Math.PI / 2;
        this.Callback[MapCallbackType.geometryAdd](floor);
        return floor;
    }

    public add(object:THREE.Object3D) {
        this._scene.add(object);
    }

    public drawRoutePath(path:Point[]):void {

        const material = new THREE.LineBasicMaterial( { color: 0xff0000, linewidth: 5 } );

        const points:THREE.Vector3[] = [];

        for(let i = 0; i < path.length; i++) {

            let position:Point = getHexCenter(path[i]['x'], path[i]['y'], this.options.size);

            let point3 = new THREE.Vector3( position.x, 10, position.y );
            
            points.push( point3 );

        }

        const geometry = new THREE.BufferGeometry().setFromPoints( points );

        this._pathLine = new THREE.Line( geometry, material );

        this._scene.add(this._pathLine);
    }

    public cleanRoutePath():void {
        //Delete prev route line from map
        if(typeof this._pathLine !== "undefined") {
            this._scene.remove(this._pathLine);
            this._pathLine = undefined;
        }
    }
    //----------------------------------------------------------------------------------------------------
    //ANIMATE
    //----------------------------------------------------------------------------------------------------
    private animate(temp:object) {
        
    }
    //----------------------------------------------------------------------------------------------------
    // INTI MAP
    //----------------------------------------------------------------------------------------------------
    public async init(mapData:MapInfo):Promise<void> {
        this.map = mapData;
        //Gen map
        this.makeMap();
        //Gen hex grid for map
        this.makeGrid();
        //Gen selector for map
        this.makeSelector();
        //Gen pointer for map
        this.makePointer();
        //Gen fog of the war for map
        //this.makeFog();
    }
    //----------------------------------------------------------------------------------------------------
    // CALLBACKS REGISTRATION
    //----------------------------------------------------------------------------------------------------
    public on(index:string, callback:myCallbackType):void {
        this.Callback[index] = callback;
    }
}