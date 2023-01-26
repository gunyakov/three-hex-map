import { HexMap } from "./map";

import * as dat from 'dat.gui';
import axios from 'axios';
import { Point } from "./interfaces";

// once everything is loaded, we run our Three.js stuff.
function init() {
    //Init map container
    let Map = new HexMap({ element: "[game-scene]"});
    //INIT MAP
    axios.get("map/map.json").then(function (response) {
        Map.init(response.data);
    });
    
    Map.on("cellClick", function(point:Point) {
        console.log(point);
    });
    //Additional controls for testing purposes
    const gui = new dat.GUI();
    gui.add( Map, "gridVisible");
}

window.onload = init;