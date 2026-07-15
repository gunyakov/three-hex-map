import { MapInfo, TileInfo } from "../interfaces";
import { Land } from "../enums";
import { getNeighborCoords, NeighborDirection } from "./neighbors";

//----------------------------------------------------------------------------------
//Rivers and lakes: land tiles carrying the free-form "river"/"lake" modifier (see
//TileInfo.modifiers) render water on the land layer (see shaders/terrain.*.ts):
//
//- a RIVER tile draws a channel along segments from the hex center to the midpoint
//  of every *connected* edge - one whose neighbor is itself river/lake water, or
//  sea/coastal (the river's mouth);
//- a LAKE tile is the inverse: water covers the whole hex except a shore rim inset
//  from every edge whose neighbor is NOT water. Edges to other lake/sea/coastal
//  tiles are fully open (the water just continues), edges to river tiles stay
//  shored but get a channel-shaped opening so the river visibly flows in/out.
//
//Connectivity is derived here from the map data alone, so map authors only mark
//tiles - there is no separate river-path/lake-outline data to keep in sync.
//
//Everything a tile needs is packed into ONE float instanced attribute (see
//waterEdgeValue() below and its decoding mirror in the shaders):
//    -1                                  not a water tile
//    0..63                               river: connected-edge bitmask
//    4096 + openMask*64 + channelMask    lake: fully-open edges / river-neighbor edges
//The bit order (SE,S,SW,NW,N,NE = bits 0..5) must match the neighborsA/neighborsB
//instanced-attribute order in TerrainMesh and the DIR_SE/DIR_S/... constants in
//the shaders.
//----------------------------------------------------------------------------------
const MASK_DIRECTIONS: NeighborDirection[] = ["SE", "S", "SW", "NW", "N", "NE"];

export const LAKE_FLAG = 4096;

//Edge midpoint directions in the local X/Z plane, same order/values as the
//shaders' DIR_* constants (flat-top hexagon, see helpers.ts's HEXPolygon).
const EDGE_DIRS: [number, number][] = [
    [0.8660254, 0.5],   // SE
    [0.0, 1.0],         // S
    [-0.8660254, 0.5],  // SW
    [-0.8660254, -0.5], // NW
    [0.0, -1.0],        // N
    [0.8660254, -0.5]   // NE
];

export function isRiverTile(tile: TileInfo | undefined): boolean {
    return !!tile?.modifiers?.includes("river");
}

export function isLakeTile(tile: TileInfo | undefined): boolean {
    return !!tile?.modifiers?.includes("lake");
}

function isSeaOrCoastal(tile: TileInfo): boolean {
    return tile.type === Land.sea || tile.type === Land.coastal;
}

//The encoded water value for the tile at (x, y) - see the format table above.
export function waterEdgeValue(map: MapInfo, x: number, y: number): number {
    const tile = map.data[x]?.[y];

    if (isLakeTile(tile)) {
        let openMask = 0, channelMask = 0;
        MASK_DIRECTIONS.forEach((direction, bit) => {
            const n = getNeighborCoords(x, y, direction);
            const neighbor = map.data[n.x]?.[n.y];
            if (!neighbor) return;
            if (isLakeTile(neighbor) || isSeaOrCoastal(neighbor)) openMask |= 1 << bit;
            else if (isRiverTile(neighbor)) channelMask |= 1 << bit;
        });
        return LAKE_FLAG + openMask * 64 + channelMask;
    }

    if (isRiverTile(tile)) {
        let mask = 0;
        MASK_DIRECTIONS.forEach((direction, bit) => {
            const n = getNeighborCoords(x, y, direction);
            const neighbor = map.data[n.x]?.[n.y];
            if (!neighbor) return;
            if (isRiverTile(neighbor) || isLakeTile(neighbor) || isSeaOrCoastal(neighbor)) mask |= 1 << bit;
        });
        return mask;
    }

    return -1;
}

//Distance (world units) from a tile-local point (lx, ly - offsets from the hex
//center in the X/Z ground plane) to the river channel's centerline: the union
//of segments from the center to each connected edge's midpoint (at the
//apothem). Mirrors the shader's riverChannelDist() exactly (minus the noise
//distortion applied there). A mask of 0 is a pond around the center.
export function riverChannelDistance(lx: number, ly: number, mask: number, size: number): number {
    if (mask < 0) return Infinity;

    const apothem = size * 0.8660254;
    let best = Math.hypot(lx, ly);

    for (let bit = 0; bit < 6; bit++) {
        if (!(mask & (1 << bit))) continue;
        const [dx, dy] = EDGE_DIRS[bit];
        // closest point on segment(0,0 -> apothem*dir): project, clamp to [0, apothem]
        const t = Math.min(Math.max(lx * dx + ly * dy, 0), apothem);
        best = Math.min(best, Math.hypot(lx - dx * t, ly - dy * t));
    }
    return best;
}

export interface WaterClearanceOptions {
    riverWidth: number;      // fractions of the tile radius - same values as the
    riverBankWidth: number;  // map's riverWidth/riverBankWidth/riverCurvature/
    riverCurvature: number;  // lakeShoreWidth options, keep them in sync
    lakeShoreWidth: number;
}

//True when a tile-local point sits in (or too close to) the tile's water, as the
//shader will actually paint it - used to keep scattered decorations (grass
//blades, trees - see Grass.ts/Forest.ts) off rivers and lakes. "Too close"
//includes the waterline's maximum outward noise wobble ((bend-0.5) *
//riverCurvature * 0.6 in the fragment shader, so up to 0.3*curvature of the tile
//radius) - clearing only the un-bent waterline left blades standing in every
//noise-pushed bulge of the water.
export function isInTileWater(lx: number, ly: number, value: number, size: number, options: WaterClearanceOptions): boolean {
    if (value < 0) return false;

    const wobble = 0.3 * options.riverCurvature + 0.03;
    const channelClearance = (options.riverWidth + Math.max(options.riverBankWidth, wobble)) * size;

    if (value >= LAKE_FLAG) {
        const openMask = Math.floor((value - LAKE_FLAG) / 64);
        const channelMask = (value - LAKE_FLAG) % 64;

        // shore factor: how far towards the nearest *shored* edge this point
        // sits (1 = exactly on that edge) - mirrors the shader's lakeShore().
        const apothem = size * 0.8660254;
        let shore = 0;
        for (let bit = 0; bit < 6; bit++) {
            if (openMask & (1 << bit)) continue;
            const [dx, dy] = EDGE_DIRS[bit];
            shore = Math.max(shore, (lx * dx + ly * dy) / apothem);
        }
        // shore stays 0 on a fully-open (lake interior) tile, so this also
        // covers the "everything is water" case
        if (shore < 1.0 - options.lakeShoreWidth + wobble) return true;

        return channelMask > 0 && riverChannelDistance(lx, ly, channelMask, size) < channelClearance;
    }

    return riverChannelDistance(lx, ly, value, size) < channelClearance;
}
