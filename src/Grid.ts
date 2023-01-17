import { HEX } from "./Hex";
import { Group, Shape, ShapeGeometry, Mesh, MeshBasicMaterial, Vector2} from "three";
import { TOP } from "./interfaces";


export class Grid {
    private type_top:TOP       //Type of HEX: flat top or point top

    private x:number;           //Map size in X direction
    private y:number;           //Map size in Y direction

    private width:number;       //Width of 1 HEX
    private height:number;      //Height of 1 HEX
    private horiz:number;       //Horizontal spaicing between HEXES
    private vert:number;        //Vertical spacing between HEXES
    private size: number;       //Size of 1 HEX (main size)

    private hexGrid:Group = new Group();      //GRID groupe to store hexes

    constructor(x:number = 4, y:number = 5, size:number = 6, type_top:TOP = TOP.flat) {

        this.x = x;
        this.y = y;
        this.size = size;
        this.type_top = type_top;

        //Calculaion of main HEX dimensions
        if(type_top == TOP.flat) {
            this.width = 2 * size;
            this.height = Math.sqrt(3) * size;
            this.horiz = 3/2 * size;
            this.vert = this.height;
        }
        else {
            this.width = Math.sqrt(3) * size;
            this.height = 2 * size;
            this.horiz = this.width;
            this.vert = 3/2 * size;
        }

    }

    getGrid():Group {

        const line_material = new MeshBasicMaterial({ color:0x000000, wireframe: true });
          
        for(let x = 0; x < this.x; x++) {
            let space = 0;
            if(x % 2 == 0) {
                if(this.type_top == TOP.flat) {
                    space = this.height / 2;
                }
                else {
                    space = this.width / 2;
                }
            }
            else {
                space = 0;
            }
            console.log(space);
            for(let y = 0; y < this.y; y++) {
                let hexMesh:Shape;
                if(this.type_top == TOP.flat) {
                    hexMesh = new Shape(HEX(this.horiz * x, this.vert * y + space));
                }
                else {
                    hexMesh = new Shape(HEX(this.horiz * x, this.vert * y, TOP.point));
                }
                const geometry = new ShapeGeometry( hexMesh );
                const mesh = new Mesh( geometry, line_material ) ;
                this.hexGrid.add(mesh);
            }
        }

        return this.hexGrid;
    }
}