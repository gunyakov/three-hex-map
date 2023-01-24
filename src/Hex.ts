import { Mesh, MeshPhongMaterial, RingGeometry, Shape, ExtrudeGeometry, MeshBasicMaterial, Group, ColorRepresentation, CircleGeometry} from "three";
import { HEXPolygon } from "./helpers";
import { LandColor, TileInfo } from "./interfaces";
import { WOOD } from "./objects/tree";

export function HEX(TileInfo:TileInfo, size:number = 6, x:number = 0, y:number = 0):Group {

    let hexGrope = new Group();
    //Color for tile from interfaces
    let color = LandColor[TileInfo.type];
    let arrPoints = HEXPolygon({x: 0, y: 0}, size);

    const materialTop = new MeshPhongMaterial( { color: color} );
    const materialSides = new MeshPhongMaterial( { color: 0xb47a7e});

    let materials = [
        materialTop, 
        materialSides, 
        materialSides, 
        materialSides, 
        materialSides, 
        materialSides, 
        materialSides, 
        materialSides
    ]

    const hexShape = new Shape();
    hexShape.moveTo(arrPoints[0]['x'], arrPoints[0]["y"]);
    for(let i = 1; i < arrPoints.length; i++) {
        hexShape.lineTo(arrPoints[i]['x'], arrPoints[i]["y"]);
    }
    hexShape.lineTo(arrPoints[0]['x'], arrPoints[0]["y"]);

    let geometry = new ExtrudeGeometry(hexShape, {depth: Math.round(size / 10)});
    geometry.rotateX(-90 * (Math.PI / 180));
    let mesh = new Mesh( geometry, materials ) ;
    mesh.userData = {
        x: x,
        y: y,
        type: "tile"
    }
    hexGrope.add(mesh);
    //Generate wood for tile
    if(TileInfo.wood) {
        hexGrope.add(WOOD(size, 20));
    }

    return hexGrope;
}

export function GRID (x:number, y:number, size:number, color:ColorRepresentation):Mesh {

    // let arrPoints = HEXPolygon({x: 0, y: 0}, size);
    // const material = new LineBasicMaterial( { color: color, linewidth: 5 } );
    // const points = [];
    // for(let i=0; i < arrPoints.length; i++) {
    //     points.push( new Vector3( arrPoints[i]['x'], 0, arrPoints[i]["y"] ) );
    // }
    // points.push( new Vector3( arrPoints[0]['x'], 0, arrPoints[0]["y"] ));

    // const geometry = new BufferGeometry().setFromPoints( points );
    // const line = new Line( geometry, material );

    const geometry = new RingGeometry(0.97 * size, size, 6, 2);
    const material = new MeshBasicMaterial({
        color: color
    });

    let gridHex:Mesh = new Mesh(geometry, material);
    gridHex.rotateX(-90 * (Math.PI/180));
    
    return gridHex;
    
}