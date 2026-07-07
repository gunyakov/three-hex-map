import {
    ConeGeometry,
    MeshLambertMaterial,
    InstancedMesh,
    Matrix4,
    ColorRepresentation,
    DynamicDrawUsage
} from "three";
import pointInPolygon from "robust-point-in-polygon";

import { getRandomInt, HEXPolygon, getHexCenter } from "../helpers/helpers";
import { MapInfo, Point } from "../interfaces";

export interface ForestOptions {
    size: number;
    treesPerTile?: number;
    color?: ColorRepresentation;
}

//----------------------------------------------------------------------------------
//Replaces the old tree.ts WOOD() (a Group with one Mesh+ConeGeometry per tree, i.e.
//one draw call per tree) with a single THREE.InstancedMesh for every tree on the
//map. Height/radius variety, which used to come from building a distinct
//ConeGeometry per tree, now comes from per-instance non-uniform scale on one
//shared unit cone - the shared geometry is what makes instancing possible.
//
//Returns null if the map has no wood tiles (nothing to render).
//----------------------------------------------------------------------------------
export function createForest(map: MapInfo, options: ForestOptions): InstancedMesh | null {
    const { size } = options;
    const treesPerTile = options.treesPerTile ?? 20;
    const treeSize = Math.max(1, Math.round(size / 10));

    const woodTiles: Point[] = [];
    for (let x = 0; x < map.w; x++) {
        for (let y = 0; y < map.h; y++) {
            if (map.data[x]?.[y]?.wood) woodTiles.push({ x, y });
        }
    }

    if (woodTiles.length === 0) return null;

    const geometry = new ConeGeometry(1, 1, 6);
    const material = new MeshLambertMaterial({ color: options.color ?? 0x0b633c });
    const mesh = new InstancedMesh(geometry, material, woodTiles.length * treesPerTile);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;

    // polygon slightly shrunk from the hex boundary, same as the old WOOD()
    const polygon = HEXPolygon({ x: 0, y: 0 }, size - treeSize).map(p => [p.x, p.y]);

    const matrix = new Matrix4();
    let instance = 0;

    for (const tile of woodTiles) {
        const center = getHexCenter(tile.x, tile.y, size);
        const placed: Point[] = [];
        let attempts = 0;

        while (placed.length < treesPerTile && attempts < treesPerTile * 20) {
            attempts++;
            const lx = getRandomInt(-size, size);
            const ly = getRandomInt(-size, size);

            if (pointInPolygon(polygon, [lx, ly]) !== -1) continue; // -1 = inside the polygon

            const overlaps = placed.some(p => Math.abs(p.x - lx) < treeSize && Math.abs(p.y - ly) < treeSize);
            if (overlaps) continue;

            placed.push({ x: lx, y: ly });

            const height = treeSize * getRandomInt(2, 5);
            matrix.makeScale(treeSize, height, treeSize);
            matrix.setPosition(center.x + lx, height / 2, center.y + ly);
            mesh.setMatrixAt(instance, matrix);
            instance++;
        }
    }

    mesh.count = instance;
    mesh.instanceMatrix.needsUpdate = true;

    return mesh;
}
