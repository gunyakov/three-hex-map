import { Points } from "three";
import { Point } from "../interfaces";

//Ger random int include min and max values
export function getRandomInt(min:number, max:number):number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//Get HEX point according number
export function pointy_hex_corner(center:Point, size:number, i:number):Point {
    let angle_deg = 60 * i;
    let angle_rad = Math.PI / 180 * angle_deg;
    return {
        "x": Math.round(center.x + size * Math.cos(angle_rad)),
        "y": Math.round(center.y + size * Math.sin(angle_rad))
    }
}
    
//Get all points for HEX
export function HEXPolygon(center:Point = {x: 0, y: 0}, size:number = 1):Point[] {
    let arrPoints:Point[] = [];

    for(let i = 1; i <= 6; i++) {
        arrPoints.push(pointy_hex_corner(center, size, i));
    }

    return arrPoints;
}

export function getHexCenter(x:number, y:number, size:number):Point {
    let space = 0;
    if(x % 2 == 0) {
        space = size * Math.sqrt(3) / 2;
    }

    return {x: x * size * 1.5, y: y * size * Math.sqrt(3) + space}
}