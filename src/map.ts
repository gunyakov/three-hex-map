import * as THREE from 'three';

import { Grid } from "./objects/Grid";
import { MapCallbackType, myCallbackType, Point, TileInfo, MapInfo, Land } from './interfaces';
import { HEX } from './objects/Hex';
import { getHexCenter } from './helpers/helpers';
import { PathFinder } from "./helpers/pathfinder";
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { Scene } from "./Scene";

let { setOptions } = require( "./setoptions.js");

export class HexMap {

    private selector:THREE.Object3D;
    private pointer:THREE.Object3D;
    private Callback:{ [key: string]: myCallbackType } = {};
    private grid:Grid = new Grid();
    private map:MapInfo;
    private routeGroupe:THREE.Group;
    private _scene:THREE.Scene;
    private _lastCoordsClicked:Point = {x: 0, y:0};

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
        GameScene.on(MapCallbackType.mousemove, this.movePointer.bind(this)); 
    }

    private cellClick(Tile:THREE.Object3D):void {

        this.cleanRoutePath();
        
        //Call callbacks to external functions.
        let cellCoords:Point = {x: Tile.userData.x, y: Tile.userData.y};

        this.Callback[MapCallbackType.cellClick](cellCoords);

        this.moveSelector(Tile);

        if(this._lastCoordsClicked.x > 0 || this._lastCoordsClicked.y > 0) {
            this.findPath(this._lastCoordsClicked.x, this._lastCoordsClicked.y, cellCoords.x, cellCoords.y);
        }

        if(this.map[cellCoords.x][cellCoords.y]['unit']) {
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
                let tileInfo:TileInfo = this.map[x][y];
                let hex = HEX(tileInfo, this.options.size, x, y);
                let position:Point = getHexCenter(x, y, this.options.size);
                hex.position.setX(position.x);
                hex.position.setZ(position.y);
                mapHex.add(hex);
                if(tileInfo?.unit) {
                    this.setUnit(tileInfo.unit, x, y);
                }
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

    public movePointer(Tile:THREE.Object3D):void {
        let cellCoords:Point = {x: Tile.userData.x, y: Tile.userData.y};
        let position:Point = getHexCenter(cellCoords.x, cellCoords.y, this.options.size);
        this.pointer.visible = true;
        this.pointer.position.setX(position.x);
        this.pointer.position.setZ(position.y);

        if(this._lastCoordsClicked.x > 0 || this._lastCoordsClicked.y > 0) {
            this.findPath(this._lastCoordsClicked.x, this._lastCoordsClicked.y, cellCoords.x, cellCoords.y);
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

    public setUnit(key:string, x:number, y:number):void {
        let position:Point = getHexCenter(x, y, this.options.size);
        const fbxLoader = new FBXLoader()
        fbxLoader.load(
          `models/${key}.fbx`,
          (object) => {
              object.scale.set(.15, .15, .15)
              object.position.setX(position.x);
              object.position.setZ(position.y);
              object.position.setY(4);
              this._scene.add(object);
          },
          (xhr) => {
              console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
          },
          (error) => {
              console.log(error)
          }
        )
        // const fbxLoader2 = new FBXLoader()
        // fbxLoader2.load(
        //     `models/archer.fbx`,
        //     (object) => {
        //         //object.scale.set(.15, .15, .15)
        //         object.position.setX(position.x);
        //         object.position.setZ(position.y);
        //         object.position.setY(20);
        //         this.Callback[MapCallbackType.geometryAdd](object);
        //     },
        //     (xhr) => {
        //         console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
        //     },
        //     (error) => {
        //         console.log(error)
        //     }
        //   )
    }

    public findPath(start_x:number, start_y:number, stop_x:number, stop_y:number):void {

        this.cleanRoutePath();

        //this.routeGroupe = new THREE.Group();

        let restrictions:{ [key in Land]:boolean} = {
            sea: true,
            shore: true,
            land: false,
            sand: true,
            tundra: false,
            snow: false
        }

        let pathFinder = new PathFinder(this.options.width, this.options.height, this.map, restrictions);

        let path:Point[] = pathFinder.find(start_x, start_y, stop_x, stop_y);

        if(path.length > 0) {

            const material = new THREE.LineBasicMaterial( { color: 0xff0000, linewidth: 5 } );

            const points = [];
            
            for(let i = 0; i < path.length; i++) {

                let position:Point = getHexCenter(path[i]['x'], path[i]['y'], this.options.size);

                points.push( new THREE.Vector3( position.x, 20, position.y ) );

            }

            const geometry = new THREE.BufferGeometry().setFromPoints( points );

            const line = new THREE.Line( geometry, material );

            line.name = "LinePath";

            this._scene.add(line);
        }
    }

    private cleanRoutePath():void {
        //Delete prev route line from map
        let obj = this._scene.getObjectByName("LinePath");

        if(obj) {
            this._scene.remove(obj);
        }
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