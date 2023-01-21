import { myCallbackType } from "./interfaces";
import { HexMap } from "./map";

// once everything is loaded, we run our Three.js stuff.
function init() {

    let map_container = new HexMap();
    map_container.on("cellClick", function(info):void {
        console.log(info);
    });
    map_container.init();
}
window.onload = init;