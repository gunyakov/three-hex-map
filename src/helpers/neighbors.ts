import { Point } from "../interfaces";

//----------------------------------------------------------------------------------
//Six neighbor directions for the offset-coordinate, flat-top hex grid used
//throughout this library (see getHexCenter() below and pointy_hex_corner()/
//HEXPolygon() in helpers.ts, which place hex corners at 0/60/120/180/240/300deg -
//a flat-top hexagon). Column x is the primary axis (spacing size*1.5), and the
//row within a column is offset depending on whether x is even or odd.
//
//This mirrors the adjacency rule already used by helpers/pathfinder.ts (see its
//hex_accessible() neighbor switch with firstrowlong=false, the only value ever
//used). It is intentionally duplicated here rather than shared, so the
//pathfinding algorithm itself stays untouched.
//----------------------------------------------------------------------------------
export type NeighborDirection = "NE" | "N" | "NW" | "SW" | "S" | "SE";

export const NEIGHBOR_DIRECTIONS: NeighborDirection[] = ["NE", "N", "NW", "SW", "S", "SE"];

export function getNeighborCoords(x: number, y: number, direction: NeighborDirection): Point {
    const odd = x % 2 !== 0;
    switch (direction) {
        case "NE": return { x: x + 1, y: odd ? y - 1 : y };
        case "N":  return { x, y: y - 1 };
        case "NW": return { x: x - 1, y: odd ? y - 1 : y };
        case "SW": return { x: x - 1, y: odd ? y : y + 1 };
        case "S":  return { x, y: y + 1 };
        case "SE": return { x: x + 1, y: odd ? y : y + 1 };
    }
}

export interface Neighbor extends Point {
    direction: NeighborDirection;
}

export function getNeighbors(x: number, y: number): Neighbor[] {
    return NEIGHBOR_DIRECTIONS.map(direction => ({ direction, ...getNeighborCoords(x, y, direction) }));
}
