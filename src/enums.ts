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
    | "cell_enter"
    | "end_move";

export enum Land {
    sea = "sea",
    coastal = "coastal",
    land = "land",
    sand = "sand",
    tundra = "tundra",
    snow = "snow",
    mountain = "mountain"
}

export let LandColor: { [key in Land]: ColorRepresentation} =  {
    [Land.land]: 0x84aa53,
    [Land.coastal]: 0x4f6c80,
    [Land.sea]: 0x2a368c,
    [Land.sand]: 0xaea765,
    [Land.tundra]: 0xffffff,
    [Land.snow]: 0xffffff,
    [Land.mountain]: 0x8b8075
}

//----------------------------------------------------------------------------------
//Edge-blend priority (see TerrainMesh/terrain shaders): a tile only blends
//*towards* a neighbor of strictly higher priority, never the other way round.
//Without this, every shared edge blended both ways (land fading into water AND
//water fading into land at the same border), which reads as a fuzzy halo around
//every coastline/patch instead of a one-directional transition.
//Water sits lowest so shorelines are drawn as a soft edge into the water, and
//"grass" is the base the other special surface types blend onto. sand/tundra/
//snow each need their *own* distinct value (not all three tied at once) -
//otherwise neighborPriority<=vPriority is true both ways between any two of
//them, and blendEdge() skips the blend entirely on both sides (a hard, un-
//blended border between e.g. sand and snow instead of a soft transition).
//----------------------------------------------------------------------------------
//Mountain sits highest so surrounding tiles blend towards its rock texture at
//shared edges - the foot-of-the-mountain transition comes from the existing
//blendEdge() with no extra shader work.
export let LandPriority: { [key in Land]: number } = {
    [Land.sea]: 0,
    [Land.coastal]: 1,
    [Land.land]: 2,
    [Land.sand]: 3,
    [Land.tundra]: 4,
    [Land.snow]: 5,
    [Land.mountain]: 6
}

export enum UnitActions {
    attack = "attack",
    walk = "walk",
    distanceAttack = "distanceAttack",
    death = "death",
    idle = "idle",
    defence = "defence"
}