//----------------------------------------------------------------------------------
//Library entry point. `three` is a peerDependency (see package.json/tsup.config.ts) -
//consumers must have their own copy of three.js installed/loaded.
//----------------------------------------------------------------------------------
export { HexMap } from "./HexMap";
export type { HexMapOptions } from "./HexMap";

export { GameEngine } from "./gameengine";
export type { GameEngineOptions } from "./gameengine";

export { Unit } from "./objects/Unit";
export { PathFinder } from "./helpers/pathfinder";
export { EventEmitter } from "./EventEmitter";
export type { Listener } from "./EventEmitter";

export { FogOfWar, FogState } from "./objects/FogOfWar";
export type { FogViewer, FogChange } from "./objects/FogOfWar";

export { Land, UnitActions, LandColor, LandPriority } from "./enums";
export type { HexMapEventName } from "./enums";

export type {
    Point,
    TileInfo,
    CityInfo,
    RiverSegment,
    MapInfo,
    MapInfoData,
    UnitPlacement,
    UnitInfo,
    UnitList
} from "./interfaces";

export { getHexCenter, HEXPolygon } from "./helpers/helpers";
export { getNeighborCoords, getNeighbors, NEIGHBOR_DIRECTIONS } from "./helpers/neighbors";
export type { NeighborDirection, Neighbor } from "./helpers/neighbors";
