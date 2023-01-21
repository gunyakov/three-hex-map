import { Mesh, CircleGeometry, MeshBasicMaterial, RingGeometry, BufferGeometry, ColorRepresentation, TextureLoader, MeshPhongMaterial, Material} from "three";

export function HEX(x:number = 0, y:number = 0, size:number = 6, ring:boolean = false, color:ColorRepresentation = 0x84aa53):Mesh {

    // let points:Vector2[] = [];

    // for(let i = 0; i < 6; i++) {
    //     let angle_deg = top == TOP.flat ? 60 * i : 60 * i + 30;
    //     var angle_rad = Math.PI / 180 * angle_deg;
    //     let point = new Vector2(x + size * Math.cos(angle_rad), y + size * Math.sin(angle_rad));
    //     points.push(point);
    // }

    // let hexMesh:Shape;
    // if(this.type_top == TOP.flat) {
    //     hexMesh = new Shape(HEX(this.horiz * x, this.vert * y + space));
    // }
    // else {
    //     hexMesh = new Shape(HEX(this.horiz * x, this.vert * y, TOP.point));
    // }
    // const geometry = new ShapeGeometry( hexMesh );
    let space = 0;
    if(x % 2 == 0) {
        space = size * Math.sqrt(3) / 2;
    }

    let geometry:BufferGeometry;
    let material:Material;

    if(ring) {
        geometry = new RingGeometry(size * 0.98, size, 6, 2);
        material = new MeshBasicMaterial( { color: color } );
    }
    else {
        geometry = new CircleGeometry( size, 6);
        var textureLoader = new TextureLoader();
        let crateTexture = textureLoader.load("textures/grass.png");
        material = new MeshPhongMaterial({
            color: color,
            
            map:crateTexture
            //bumpMap:crateBumpMap,
            //normalMap:crateNormalMap
        });
    }
    
    const mesh = new Mesh( geometry, material );

    let type = ring ? 'mesh' : "tile";

    mesh.userData = {x:x, y:y, type: type};
    mesh.position.setX(x * size * 1.5);
    mesh.position.setY(ring == false ? 0 : 0.005);
    mesh.position.setZ(y * size * Math.sqrt(3) + space);
    mesh.rotateX(-90 * (Math.PI/180));
    return mesh;
    
}