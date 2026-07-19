import { Land } from "../enums";
import { MapInfo, TileInfo } from "../interfaces";
import { getNeighborCoords, NeighborDirection } from "./neighbors";

export interface CoastClearanceOptions {
    beachWidth?: number;
    lakeShoreWidth?: number;
    waterCornerRounding?: number;
    coastCurvature?: number;
}

const DIRS: Record<NeighborDirection, { x: number, y: number }> = {
    SE: { x: 0.8660254, y: 0.5 },
    S: { x: 0.0, y: 1.0 },
    SW: { x: -0.8660254, y: 0.5 },
    NW: { x: -0.8660254, y: -0.5 },
    N: { x: 0.0, y: -1.0 },
    NE: { x: 0.8660254, y: -0.5 }
};

const COAST_DIRECTIONS: NeighborDirection[] = ["SE", "S", "SW", "NW", "N", "NE"];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function fract(value: number): number {
    return value - Math.floor(value);
}

function mix(a: number, b: number, t: number): number {
    return a * (1 - t) + b * t;
}

function hash21(x: number, y: number): number {
    return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function valueNoise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fract(x);
    const fy = fract(y);
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    return mix(
        mix(hash21(ix, iy), hash21(ix + 1, iy), ux),
        mix(hash21(ix, iy + 1), hash21(ix + 1, iy + 1), ux),
        uy
    );
}

function isWater(tile: TileInfo | undefined): boolean {
    return tile?.type === Land.sea || tile?.type === Land.coastal;
}

function isLake(tile: TileInfo | undefined): boolean {
    return !!tile?.modifiers?.includes("lake");
}

function roundedCorner(isWaterA: boolean, isWaterB: boolean, dA: number, dB: number, waterCornerRounding: number): number {
    if (!isWaterA || !isWaterB) return -1;
    return mix(Math.max(dA, dB), Math.hypot(dA, dB), clamp(waterCornerRounding, 0, 1));
}

// CPU mirror of terrain.fragment.ts's curved coastline beach/water test.
// Returns true for the shader-painted coastal band (sand, lapping foam, or
// land-side water), so trees can be scattered only on the dry land interior.
export function isInCoastalShore(
    map: MapInfo,
    tileX: number,
    tileY: number,
    localX: number,
    localY: number,
    worldX: number,
    worldY: number,
    size: number,
    options: CoastClearanceOptions = {}
): boolean {
    const tile = map.data[tileX]?.[tileY];
    if (!tile || isWater(tile)) return true;

    const apothem = size * 0.8660254;
    const waterByDirection = new Map<NeighborDirection, boolean>();
    const factorByDirection = new Map<NeighborDirection, number>();

    for (const direction of COAST_DIRECTIONS) {
        const neighbor = getNeighborCoords(tileX, tileY, direction);
        waterByDirection.set(direction, isWater(map.data[neighbor.x]?.[neighbor.y]));
        const dir = DIRS[direction];
        factorByDirection.set(direction, (localX * dir.x + localY * dir.y) / apothem);
    }

    let coast = 0;
    for (const direction of COAST_DIRECTIONS) {
        const factor = factorByDirection.get(direction) ?? 0;
        if (waterByDirection.get(direction) && factor > coast) coast = factor;
    }
    if (coast <= 0) return false;

    const waterCornerRounding = options.waterCornerRounding ?? 0.4;
    for (let i = 0; i < COAST_DIRECTIONS.length; i++) {
        const a = COAST_DIRECTIONS[i];
        const b = COAST_DIRECTIONS[(i + 1) % COAST_DIRECTIONS.length];
        coast = Math.max(
            coast,
            roundedCorner(
                waterByDirection.get(a) ?? false,
                waterByDirection.get(b) ?? false,
                Math.max(factorByDirection.get(a) ?? 0, 0),
                Math.max(factorByDirection.get(b) ?? 0, 0),
                waterCornerRounding
            )
        );
    }

    const coastCurvature = options.coastCurvature ?? 0.5;
    const coarse = valueNoise(worldX * (1.3 / size), worldY * (1.3 / size));
    const fine = valueNoise(worldX * (3.2 / size), worldY * (3.2 / size));
    const curvedCoast = coast + (0.6 * coarse + 0.4 * fine) * coastCurvature * 0.5;
    const beachStart = 1 - clamp(options.beachWidth ?? 0.35, 0.001, 1) * 0.5;

    return curvedCoast >= beachStart;
}

// CPU mirror of terrain.fragment.ts's lakeNeighborField() + curved lake shore
// block. Lake water itself is a full tile; the visible green shore/water strip
// is painted on adjacent land, so tree scattering must reject that painted band.
export function isInLakeShore(
    map: MapInfo,
    tileX: number,
    tileY: number,
    localX: number,
    localY: number,
    worldX: number,
    worldY: number,
    size: number,
    options: CoastClearanceOptions = {}
): boolean {
    const tile = map.data[tileX]?.[tileY];
    if (!tile || isLake(tile)) return true;

    const apothem = size * 0.8660254;
    const lakeByDirection = new Map<NeighborDirection, boolean>();
    const factorByDirection = new Map<NeighborDirection, number>();

    for (const direction of COAST_DIRECTIONS) {
        const neighbor = getNeighborCoords(tileX, tileY, direction);
        lakeByDirection.set(direction, isLake(map.data[neighbor.x]?.[neighbor.y]));
        const dir = DIRS[direction];
        factorByDirection.set(direction, (localX * dir.x + localY * dir.y) / apothem);
    }

    let lakeField = 0;
    for (const direction of COAST_DIRECTIONS) {
        const factor = factorByDirection.get(direction) ?? 0;
        if (lakeByDirection.get(direction) && factor > lakeField) lakeField = factor;
    }
    if (lakeField <= 0) return false;

    const waterCornerRounding = options.waterCornerRounding ?? 0.4;
    for (let i = 0; i < COAST_DIRECTIONS.length; i++) {
        const a = COAST_DIRECTIONS[i];
        const b = COAST_DIRECTIONS[(i + 1) % COAST_DIRECTIONS.length];
        lakeField = Math.max(
            lakeField,
            roundedCorner(
                lakeByDirection.get(a) ?? false,
                lakeByDirection.get(b) ?? false,
                Math.max(factorByDirection.get(a) ?? 0, 0),
                Math.max(factorByDirection.get(b) ?? 0, 0),
                waterCornerRounding
            )
        );
    }

    const coastCurvature = options.coastCurvature ?? 0.5;
    const coarse = valueNoise(worldX * (1.3 / size), worldY * (1.3 / size));
    const fine = valueNoise(worldX * (3.2 / size), worldY * (3.2 / size));
    const curvedLake = lakeField + (0.6 * coarse + 0.4 * fine) * coastCurvature * 0.5;
    const shoreStart = 1 - clamp(options.lakeShoreWidth ?? 0.18, 0.001, 1);

    return curvedLake >= shoreStart;
}