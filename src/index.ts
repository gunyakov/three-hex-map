import { HexMap } from "./map";

// once everything is loaded, we run our Three.js stuff.
async function init(): Promise<void> {

    let map_container = new HexMap();
    await map_container.render("map-container");
}
window.onload = init;