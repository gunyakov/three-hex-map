import { HEX } from "./Hex";
import { ColorRepresentation, Group, Mesh, Scene} from "three";
import { TOP } from "./interfaces";

export class Grid {
    private scene:Scene;       //Store link to scene
    private type_top:TOP       //Type of HEX: flat top or point top
    private ring:boolean;
    private x:number;           //Map size in X direction
    private y:number;           //Map size in Y direction
    private color:ColorRepresentation;
    private width:number;       //Width of 1 HEX
    private height:number;      //Height of 1 HEX
    private horiz:number;       //Horizontal spaicing between HEXES
    private vert:number;        //Vertical spacing between HEXES
    private size: number;       //Size of 1 HEX (main size)
    private hexGrid:Group;      //GRID groupe to store hexes

    constructor(x:number = 5, y:number = 5, size:number = 6, ring:boolean = false,  color:ColorRepresentation = 0x84aa53) {
        this.ring = ring;
        this.x = x;
        this.y = y;
        this.size = size;
        this.color = color;

        //Calculaion of main HEX dimensions
        this.width = 2 * size;
        this.height = Math.sqrt(3) * size;
        this.horiz = 3/2 * size;
        this.vert = this.height;

        this.hexGrid = new Group();
    }

    public getGrid():Mesh[] {

        let arrHex:Mesh[] = [];
          
        for(let x = 0; x < this.x; x++) {
            for(let y = 0; y < this.y; y++) {
                let hexMesh:Mesh = HEX(x, y, this.size, this.ring, this.color);
                arrHex.push(hexMesh);
            }
        }
        return arrHex;
    }

    public set visible(vis:boolean) {
        this.hexGrid.visible = vis;
    }

    public get visible():boolean {
        return this.hexGrid.visible;
    }

    public addTo(scene:Scene):void {
        this.scene = scene;
        this.hexGrid = new Group();

        let arrHex:Mesh[] = this.getGrid();

        for(let i = 0; i < arrHex.length; i++) {
            this.hexGrid.add(arrHex[i]);
        }
        scene.add(this.hexGrid);
    }
}