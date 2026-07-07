import { ColorRepresentation } from "three";

//----------------------------------------------------------------------------------
//Public HexMap events - see HexMap.on()/EventEmitter. "start_move"/"end_move" use
//snake_case (not the camelCase of the rest) to match the exact event names requested
//for the public API.
//----------------------------------------------------------------------------------
export type HexMapEventName =
    | "load"
    | "click"
    | "hover"
    | "unitClick"
    | "start_move"
    | "end_move";

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

//----------------------------------------------------------------------------------
//Edge-blend priority (see TerrainMesh/terrain shaders): a tile only blends
//*towards* a neighbor of strictly higher priority, never the other way round.
//Without this, every shared edge blended both ways (land fading into water AND
//water fading into land at the same border), which reads as a fuzzy halo around
//every coastline/patch instead of a one-directional transition.
//Water sits lowest so shorelines are drawn as a soft edge into the water, and
//"grass" is the base other special surface types (sand/tundra/snow) blend onto.
//----------------------------------------------------------------------------------
export let LandPriority: { [key in Land]: number } = {
    [Land.sea]: 0,
    [Land.shore]: 1,
    [Land.land]: 2,
    [Land.sand]: 3,
    [Land.tundra]: 3,
    [Land.snow]: 3
}

export enum UnitActions {
    attack = "attack",
    walk = "walk",
    distanceAttack = "distanceAttack",
    death = "death",
    idle = "idle",
    defence = "defence"
}