import { ConeGeometry, MeshLambertMaterial, Mesh, Group, Box3} from "three";
import { getRandomInt, HEXPolygon } from "../helpers/helpers";
//------------------------------------------------------------------------------
//Checker point inside polygon or not
//------------------------------------------------------------------------------
let pointInPolygon = require('robust-point-in-polygon');
import { Point } from "../interfaces";

//Gen 1 tree
export function TREE(size:number = 1, color:THREE.ColorRepresentation = 0x0b633c):Mesh {
    //Gen cone geometry with random height from 2 to 5 times more than size randomly
    const geometry = new ConeGeometry( size, size * getRandomInt(2, 5), 6 );
    const material = new MeshLambertMaterial( {color: color} );
    return new Mesh( geometry, material );
}

//Gen wood using tree function
export function WOOD(size:number = 1, trees:number = 1, color:THREE.ColorRepresentation = 0x0b633c):THREE.Group {
    let treeSize = Math.round(size / 10);
    let polygon:Point[] = HEXPolygon({x: 0, y: 0}, size - treeSize);
    let normalPolygon = [];

    for(let i = 0; i < polygon.length; i++) {
        normalPolygon.push([polygon[i]['x'], polygon[i]['y']]);
    }

    let wood:Group = new Group();

    let treeCounter = 0;

    let treePoint:Point[] = [];
    //Go while dont put all trees
    while(treeCounter < trees) {
        //Get random X and Y from plain square
        let x = getRandomInt(-size , size);
        let y = getRandomInt(-size, size);
        //Check if point inside tile boundary
        if(pointInPolygon(normalPolygon, [x, y]) === -1) {
            //Check that trees isn crossing each other
            let treeCross = false;
            for(let i = 0; i < treePoint.length; i++) {
                if(Math.abs(treePoint[i]['x'] - x) < treeSize && Math.abs(treePoint[i]['y'] - y) < treeSize) {
                    treeCross = true;
                    break;
                }
            }
            //If tree dont cross any other trees in groupe
            if(!treeCross) {
                //Add tree to the scene
                let tree = TREE(treeSize);
                tree.geometry.computeBoundingBox();
                tree.position.set(x, Math.round(treeSize) + tree.geometry.boundingBox.max.y , y);
                wood.add(tree);
                treeCounter++;
                treePoint.push({x: x, y:y});
            }
        }
    }
    return wood;
}