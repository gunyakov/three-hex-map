import { Land, UnitActions } from "./enums";
//----------------------------------------------------------------------------------
//Cell coords or pixel coords
//----------------------------------------------------------------------------------
export interface Point {x:number, y:number}
//----------------------------------------------------------------------------------
//Calback common interface
//----------------------------------------------------------------------------------
export interface myCallbackType { (myArgument: object): void }
//----------------------------------------------------------------------------------
//Tile info interface
//----------------------------------------------------------------------------------
export interface TileInfo {type: Land, wood:boolean, river:boolean, unit:string}
//----------------------------------------------------------------------------------
//Map info interface
//----------------------------------------------------------------------------------
interface MapInfoY { [y:number]:TileInfo}
export interface MapInfoData { [x:number]:MapInfoY }
export interface MapInfo { data: MapInfoData, w: number, h: number}
//----------------------------------------------------------------------------------
//Units Info interface
//----------------------------------------------------------------------------------
export interface UnitInfo {
    id: string,
    file: string,
    format: string,
    scale: number,
    positionY: number,
    land: boolean,
    shore: boolean,
    sea: boolean,
    sand: boolean,
    tundra: boolean,
    snow: boolean,
    movement: number,
    health: number,
    attack: number,
    defence: number,
    viewRange: number,
    distanceAttack: number,
    actions: UnitActions[]
}
//----------------------------------------------------------------------------------
//List to store units 
//----------------------------------------------------------------------------------
export interface UnitList { [id:string]:UnitInfo }