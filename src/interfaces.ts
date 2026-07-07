import { Land, UnitActions } from "./enums";
//----------------------------------------------------------------------------------
//Cell coords or pixel coords
//----------------------------------------------------------------------------------
export interface Point {x:number, y:number}
//----------------------------------------------------------------------------------
//Calback common interface
//----------------------------------------------------------------------------------
export interface myCallbackType { (myArgument: any): void }
//----------------------------------------------------------------------------------
//A river is an ordered chain of tiles: riverIndex identifies which river a tile
//belongs to (a map can have several rivers), riverTileIndex is this tile's position
//within that chain (used to tell direction and find the previous/next segment).
//----------------------------------------------------------------------------------
export interface RiverSegment { riverIndex: number, riverTileIndex: number }
//----------------------------------------------------------------------------------
//Tile info interface
//`type` is intentionally not closed to today's 6 Land values only in spirit - new
//terrain types (e.g. "mountain") are added to the Land enum as they're implemented.
//`modifiers` is a free-form flag list (e.g. ["hill"]) so new modifiers don't require
//core library changes, only additions to the atlas/shader config that reads them.
//----------------------------------------------------------------------------------
export interface TileInfo {
    type: Land,
    modifiers?: string[],
    wood: boolean,
    rivers?: RiverSegment[],
    unit?: string
}
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