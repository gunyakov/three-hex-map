import {
    InstancedMesh,
    InstancedBufferAttribute,
    Matrix4,
    Group,
    DynamicDrawUsage,
    Mesh,
    Vector3
} from "three";
import pointInPolygon from "robust-point-in-polygon";

import { getRandomInt, HEXPolygon, getHexCenter } from "../helpers/helpers";
import { loadModel } from "../helpers/models";
import { MapInfo, Point } from "../interfaces";
import { waterEdgeValue, isInTileWater, isLakeTile, WaterClearanceOptions } from "../helpers/rivers";

export interface ForestOptions {
    size: number;
    treesPerTile?: number;
    treeModel?: string; // model folder path (see helpers/models.ts), default "Assets/models/pinia"
    treeScale?: number; // extra multiplier on top of the model's own info.json scale, default 1
    fogDarkenFactor?: number; // instance-color multiplier for Explored fog tiles, default 0.45 - see FogOfWar.ts

    //River/lake water clearance on wood+river tiles (see helpers/rivers.ts's
    //isInTileWater and GrassOptions' matching fields): trees sit at y=0, so
    //anything inside the painted water (noise-bent bulges included) would
    //stand in the river/lake. Same fractions-of-tile-radius values as the
    //map's options - keep them in sync.
    riverWidth?: number;     // default 0.28
    riverBankWidth?: number; // default 0.14
    riverCurvature?: number; // default 0.5
    lakeShoreWidth?: number; // default 0.18
}

//Instances belonging to one tile's trees, all drawn by the same model group's
//InstancedMeshes (see createForest) - kept around so setFogState() can hide
//(Unseen), darken (Explored) or restore (Visible) them without a rebuild.
interface TileTreeRange {
    instancedMeshes: InstancedMesh[];
    start: number;
    count: number;
    originalMatrices: Matrix4[];
}

//----------------------------------------------------------------------------------
//Thin Group subclass so the forest can expose setFogState() per tile (see
//FogOfWar.ts) alongside the InstancedMeshes createForest() fills it with.
//Hiding a tile's trees zero-scales their matrices (setFogState() keeps the
//original matrices around to restore, since InstancedMesh has no "get the
//matrix I set earlier" API once overwritten); darkening uses each
//InstancedMesh's own instanceColor attribute, a plain built-in three.js
//feature that any GLTFLoader-produced Standard/Physical/Lambert/Phong
//material already multiplies its color by, no shader changes needed here.
//----------------------------------------------------------------------------------
export class ForestField extends Group {
    private readonly hiddenMatrix = new Matrix4().makeScale(0, 0, 0);

    constructor(private tileRanges: Map<string, TileTreeRange>, private fogDarkenFactor: number) {
        super();
    }

    public setFogState(x: number, y: number, state: number): void {
        const range = this.tileRanges.get(`${x},${y}`);
        if (!range) return;

        const hidden = state < 0.5;
        const shade = state < 1.5 ? this.fogDarkenFactor : 1;

        for (const instancedMesh of range.instancedMeshes) {
            for (let i = 0; i < range.count; i++) {
                const idx = range.start + i;
                instancedMesh.setMatrixAt(idx, hidden ? this.hiddenMatrix : range.originalMatrices[i]);
                instancedMesh.instanceColor?.setXYZ(idx, shade, shade, shade);
            }
            instancedMesh.instanceMatrix.needsUpdate = true;
            if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        }
    }
}

//----------------------------------------------------------------------------------
//Replaces the old procedurally-generated cone trees with instances of real glTF
//models (see helpers/models.ts) - each wood tile can pick its own tree species
//via TileInfo.treeModel, falling back to options.treeModel, so a map can mix e.g.
//oak/pinia/palm freely. Tiles are grouped by their resolved model path and one
//set of InstancedMeshes is built per group (a tree model like pinia.glb typically
//has several parts - trunk, foliage - as separate meshes/materials, so this
//builds one InstancedMesh per part, not per model, all parts sharing the same
//per-tree transform - see the shared `matrix` written to every part below).
//Each part's own offset within the model (its node transform in the glTF) plus
//the model's info.json fine-tuning (fixup, see loadModel) is baked into its
//geometry once, since InstancedMesh only applies one transform per instance.
//
//Returns null if the map has no wood tiles.
//----------------------------------------------------------------------------------
export async function createForest(map: MapInfo, options: ForestOptions): Promise<ForestField | null> {
    const { size } = options;
    const treesPerTile = options.treesPerTile ?? 20;
    const defaultModel = options.treeModel ?? "Assets/models/pinia";
    const treeScale = options.treeScale ?? 1;
    const fogDarkenFactor = options.fogDarkenFactor ?? 0.45;

    //Wood is a tile *modifier* (TileInfo.modifiers, like "river"/"lake"/
    //"hill"), not its own field. Lake tiles are skipped even if marked wood -
    //the dry shore rim is too thin to reliably place trees in (see Grass.ts's
    //matching skip).
    const tilesByModel = new Map<string, Point[]>();
    for (let x = 0; x < map.w; x++) {
        for (let y = 0; y < map.h; y++) {
            const tile = map.data[x]?.[y];
            if (!tile?.modifiers?.includes("wood") || isLakeTile(tile)) continue;
            const modelPath = tile.treeModel ?? defaultModel;
            const tiles = tilesByModel.get(modelPath) ?? [];
            tiles.push({ x, y });
            tilesByModel.set(modelPath, tiles);
        }
    }
    if (tilesByModel.size === 0) return null;

    // polygon slightly shrunk from the hex boundary, same as the old WOOD()
    const treeFootprint = Math.max(1, Math.round(size / 10));
    const polygon = HEXPolygon({ x: 0, y: 0 }, size - treeFootprint).map(p => [p.x, p.y]);
    const waterOptions: WaterClearanceOptions = {
        riverWidth: options.riverWidth ?? 0.28,
        riverBankWidth: options.riverBankWidth ?? 0.14,
        riverCurvature: options.riverCurvature ?? 0.5,
        lakeShoreWidth: options.lakeShoreWidth ?? 0.18
    };

    const tileRanges = new Map<string, TileTreeRange>();
    const group = new ForestField(tileRanges, fogDarkenFactor);

    for (const [modelPath, tiles] of tilesByModel) {
        const { scene, fixup } = await loadModel(modelPath);

        const meshes: Mesh[] = [];
        scene.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
        if (meshes.length === 0) continue;

        const totalInstances = tiles.length * treesPerTile;
        const instancedMeshes = meshes.map(mesh => {
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld); // bake this part's offset within the model
            geometry.applyMatrix4(fixup);             // bake the model's own info.json fine-tuning
            const instancedMesh = new InstancedMesh(geometry, mesh.material, totalInstances);
            instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
            instancedMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(totalInstances * 3).fill(1), 3);
            instancedMesh.frustumCulled = false;
            group.add(instancedMesh);
            return instancedMesh;
        });

        const matrix = new Matrix4();
        const scaleVector = new Vector3();
        let instance = 0;

        for (const tile of tiles) {
            const center = getHexCenter(tile.x, tile.y, size);
            const placed: Point[] = [];
            const tileStart = instance;
            const originalMatrices: Matrix4[] = [];
            let attempts = 0;
            const waterValue = waterEdgeValue(map, tile.x, tile.y); // -1 = no water, isInTileWater is then always false

            while (placed.length < treesPerTile && attempts < treesPerTile * 20) {
                attempts++;
                const lx = getRandomInt(-size, size);
                const ly = getRandomInt(-size, size);

                if (pointInPolygon(polygon, [lx, ly]) !== -1) continue; // -1 = inside the polygon
                if (isInTileWater(lx, ly, waterValue, size, waterOptions)) continue; // keep trees out of river/lake water

                const overlaps = placed.some(p => Math.abs(p.x - lx) < treeFootprint && Math.abs(p.y - ly) < treeFootprint);
                if (overlaps) continue;

                placed.push({ x: lx, y: ly });

                const scale = treeScale * (0.8 + Math.random() * 0.4);
                matrix.makeRotationY(Math.random() * Math.PI * 2);
                matrix.scale(scaleVector.set(scale, scale, scale));
                matrix.setPosition(center.x + lx, 0, center.y + ly);

                for (const instancedMesh of instancedMeshes) instancedMesh.setMatrixAt(instance, matrix);
                originalMatrices.push(matrix.clone());
                instance++;
            }

            tileRanges.set(`${tile.x},${tile.y}`, { instancedMeshes, start: tileStart, count: instance - tileStart, originalMatrices });
        }

        for (const instancedMesh of instancedMeshes) {
            instancedMesh.count = instance;
            instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    return group;
}
