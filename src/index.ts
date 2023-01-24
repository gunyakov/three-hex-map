import { MapCallbackType } from "./interfaces";
import { HexMap } from "./map";
import { Scene } from "./Scene";
import * as dat from 'dat.gui';
import axios from 'axios';

// once everything is loaded, we run our Three.js stuff.
function init() {
    //Get element for render
    const sceneEl = document.querySelector('[data-scene]');
    //Init scene
    const GameScene = new Scene(sceneEl);
    //Make axes helper is visible
    GameScene.axesVisible = true;
    //Init map container
    let Map = new HexMap();
    //Mmake callbacks to add geometry to scene
    Map.on(MapCallbackType.geometryAdd, function (geometry:any) {
        GameScene.add(geometry);
    });
    axios.get("map/map.json").then(function (response) {
        //INIT MAP
        Map.init(response.data);
    });
    //---------------------------------------------------------------------------------------------
    //REGISTER CALLBACK FOR MOVEMENT OF POINTER
    //---------------------------------------------------------------------------------------------
    GameScene.on(MapCallbackType.cellClick, function (Tile:THREE.Object3D) {
        Map.moveSelector({ x: Tile.userData.x, y: Tile.userData.y});
    });
    GameScene.on(MapCallbackType.mousemove, function (Tile:THREE.Object3D) {
       Map.movePointer({ x: Tile.userData.x, y: Tile.userData.y}); 
    });
    //Additional controls for testing purposes
    const gui = new dat.GUI();
    gui.add( GameScene, "axesVisible");
    gui.add( Map, "gridVisible");
}
window.onload = init;