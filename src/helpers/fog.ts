import { MapInfo, Point } from "../interfaces";
import { getNeighbors } from "./neighbors";

//----------------------------------------------------------------------------------
//Flood-fills outward from (x, y) along hex neighbors up to `range` steps,
//returning every in-bounds, existing tile within that hex distance (the
//origin itself included, at range 0). This is a plain BFS rather than a
//Euclidean-distance circle - hex grids don't have a single-formula "distance"
//in offset coordinates without converting to cube coordinates first, and BFS
//gets the same ring-shaped result for free by construction. Used by
//FogOfWar.recompute() to turn each unit's {x, y, viewRange} into the set of
//tiles it currently reveals.
//----------------------------------------------------------------------------------
export function tilesWithinRange(map: MapInfo, x: number, y: number, range: number): Point[] {
    if (range < 0 || !map.data[x]?.[y]) return [];

    const visited = new Set<string>([`${x},${y}`]);
    const result: Point[] = [{ x, y }];
    let frontier: Point[] = [{ x, y }];

    for (let step = 0; step < range; step++) {
        const next: Point[] = [];
        for (const tile of frontier) {
            for (const n of getNeighbors(tile.x, tile.y)) {
                const key = `${n.x},${n.y}`;
                if (visited.has(key)) continue;
                if (!map.data[n.x]?.[n.y]) continue;
                visited.add(key);
                next.push({ x: n.x, y: n.y });
                result.push({ x: n.x, y: n.y });
            }
        }
        frontier = next;
    }

    return result;
}
