import { ColorRepresentation } from "three";

export enum MapCallbackType {
    cellClick = "cellClick",
    unitMove = "unitMove",
    geometryAdd = "geometryAdd",
    mousemove = "mousemove"
}

export enum Land {
    sea = "sea",
    shore = "shore",
    land = "land",
    sand = "sand",
    tundra = "tundra",
    snow = "snow"
}

export let LandColor: { [key in Land]: ColorRepresentation} =  {
    [Land.land]: 0x84aa53,
    [Land.shore]: 0x4f6c80,
    [Land.sea]: 0x2a368c,
    [Land.sand]: 0xaea765,
    [Land.tundra]: 0xffffff,
    [Land.snow]: 0xffffff
}

export interface Point {x:number, y:number}

export interface TileInfo {type: Land, wood:boolean, river:boolean, unit:string}

export interface myCallbackType { (myArgument: object): void }
//Store data for maps
interface MapInfoY { [y:number]:TileInfo}

export interface MapInfo { [x:number]:MapInfoY }
