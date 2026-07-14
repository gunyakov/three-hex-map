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
//A tile marked as a city gets a 3D model (see TerrainMesh's loadCities()) plus a
//text label instead of being rendered as plain terrain. `model` is a *folder*
//path (e.g. "Assets/models/monument"), containing model.glb + info.json - the
//model's own offset/rotation/scale fine-tuning lives in that info.json (see
//helpers/models.ts), not here, so picking a different model is just a path
//change in a map's own data, with no per-tile retuning. Falls back to
//HexMapOptions' cityModel if not set.
//----------------------------------------------------------------------------------
export interface CityInfo {
    name?: string,
    model?: string
}
//----------------------------------------------------------------------------------
//Tile info interface
//`type` is intentionally not closed to today's 6 Land values only in spirit - new
//terrain types (e.g. "mountain") are added to the Land enum as they're implemented.
//`modifiers` is a free-form flag list (e.g. ["hill"]) so new modifiers don't require
//core library changes, only additions to the atlas/shader config that reads them.
//`treeModel` (only meaningful when `wood` is true) is a model folder path just
//like city.model above - which tree species/asset to scatter on this specific
//tile, falling back to HexMapOptions' treeModel if not set.
//----------------------------------------------------------------------------------
export interface TileInfo {
    type: Land,
    modifiers?: string[],
    wood: boolean,
    treeModel?: string,
    rivers?: RiverSegment[],
    unit?: string,
    city?: CityInfo
}
//----------------------------------------------------------------------------------
//Map info interface
//----------------------------------------------------------------------------------
interface MapInfoY { [y:number]:TileInfo}
export interface MapInfoData { [x:number]:MapInfoY }
export interface MapInfo { data: MapInfoData, w: number, h: number}
//----------------------------------------------------------------------------------
//Where to place a unit on load (the units.json array passed to GameEngine.init/
//HexMap - just id/type/starting cell). `type` is a model folder path (e.g.
//"Assets/units/viking_boat", containing model.glb + info.json - see Unit.ts/
//helpers/models.ts) - the unit's actual asset and gameplay stats (movement/
//health/actions/...) live in that folder's info.json, not here.
//----------------------------------------------------------------------------------
export interface UnitPlacement {
    id: string,
    type: string,
    x: number,
    y: number
}
//----------------------------------------------------------------------------------
//A unit's gameplay stats + terrain restrictions, from Assets/units/${type}/
//info.json - that same file also carries the model's offset/rotation/scale
//fine-tuning (see ModelInfo in helpers/models.ts), merged in alongside these
//when Unit.setUnit() loads it.
//----------------------------------------------------------------------------------
export interface UnitInfo {
    land: boolean,
    coastal: boolean,
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
    actions: UnitActions[],
    animateSpeed?: number
}
//----------------------------------------------------------------------------------
//List to store units
//----------------------------------------------------------------------------------
export interface UnitList { [id:string]:UnitInfo }