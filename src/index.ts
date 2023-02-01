
import * as dat from 'dat.gui';
import { UnitActions } from './enums';
import { Point } from "./interfaces";

import { GameEngine } from "./gameengine";

// once everything is loaded, we run our Three.js stuff.
async function init() {
    //MAKE NEW GAME
    let game = new GameEngine({element: "[game-scene]"});
    //INIT GAME
    await game.init();

    game.on('unitClick', function(cellCoords:Point) {
        //Here must be your code to generate UI to activate unit actions
        //actions return Array with actions enabled for this unit
        console.log(game.currentUnit.actions);
    });
    //Here you need activate proper unit action
    //game.currentUnit.activate(UnitActions.walk);

    game.on("cellClick", function(cellCoords:Point) {
        
    });
    //Additional controls for testing purposes
    const gui = new dat.GUI();
    gui.add( game.map, "gridVisible");
}

window.onload = init;