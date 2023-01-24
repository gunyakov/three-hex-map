import { GRID } from "./Hex";
import { ColorRepresentation, Group, Mesh} from "three";

export class Grid {;
    private x:number;           //Map size in X direction
    private y:number;           //Map size in Y direction
    private color:ColorRepresentation;
    //Vertical spacing between HEXES
    private size: number;       //Size of 1 HEX (main size)
    private hexGrid:Group;      //GRID groupe to store hexes

    constructor(x:number = 5, y:number = 5, size:number = 6, color:ColorRepresentation = 0x000000) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.color = color;
        //Calculaion of main HEX dimensions

        this.hexGrid = new Group();
    }

    public getGrid():Group {

        this.hexGrid = new Group();
          
        for(let x = 0; x < this.x; x++) {
            let space = 0;
            if(x % 2 == 0) {
                space = this.size * Math.sqrt(3) / 2;
            }
            for(let y = 0; y < this.y; y++) {
                let hexMesh:Mesh = GRID(x, y, this.size, this.color);
                hexMesh.position.setX(x * this.size * 1.5);
                hexMesh.position.setY(this.size / 10 + 1.1);
                hexMesh.position.setZ(y * this.size * Math.sqrt(3) + space);
                this.hexGrid.add(hexMesh);
            }
        }

        return this.hexGrid;
    }

    public set visible(vis:boolean) {
        this.hexGrid.visible = vis;
    }

    public get visible():boolean {
        return this.hexGrid.visible;
    }
}