import { Vector2 } from "three";
import { TOP } from "./interfaces";

export function HEX(x:number = 0, y:number = 0, size:number = 6, top:TOP = TOP.flat):Vector2[] {

    let points:Vector2[] = [];

    for(let i = 0; i < 6; i++) {
        let angle_deg = top == TOP.flat ? 60 * i : 60 * i + 30;
        var angle_rad = Math.PI / 180 * angle_deg;
        let point = new Vector2(x + size * Math.cos(angle_rad), y + size * Math.sin(angle_rad));
        points.push(point);
    }

    return points;
    
}