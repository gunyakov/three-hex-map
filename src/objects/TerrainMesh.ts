import {
    InstancedBufferGeometry,
    InstancedBufferAttribute,
    Mesh,
    RawShaderMaterial,
    TextureLoader,
    Vector4,
    Color,
    Group,
    ColorRepresentation,
    RepeatWrapping,
    LinearFilter
} from "three";

import { MapInfo, TileInfo, Point } from "../interfaces";
import { Land, LandPriority, LandColor } from "../enums";
import { getHexCenter } from "../helpers/helpers";
import { getNeighborCoords } from "../helpers/neighbors";
import { createHexagonGeometry } from "./hexagonGeometry";
import { makeTextSprite } from "./citysprite";
import { TERRAIN_VERTEX_SHADER } from "../shaders/terrain.vertex";
import { TERRAIN_FRAGMENT_SHADER } from "../shaders/terrain.fragment";
import { WATER_VERTEX_SHADER } from "../shaders/water.vertex";
import { WATER_FRAGMENT_SHADER } from "../shaders/water.fragment";

export interface TerrainAtlasCell { cellX: number, cellY: number }
export interface TerrainAtlas {
    image: string;
    width: number;
    height: number;
    cellSize: number;
    cellSpacing: number;
    textures: { [name: string]: TerrainAtlasCell };
}

export interface TerrainMeshOptions {
    size: number;
    texturesBaseUrl: string;   // folder containing terrain.png / land-atlas.json
    atlas: TerrainAtlas;
    gridColor?: ColorRepresentation;
    gridWidth?: number;
    gridOpacity?: number;
    gridVisible?: boolean;

    //If true (default), sea/shore tiles render on their own animated layer with
    //solid colors (waterColorShallow/Deep) - see shaders/water.*.ts. If false,
    //water is just another flat, atlas-textured tile like land/sand/etc (no
    //animation, no solid colors, no beach slope): the original, simplest look.
    waterAnimation?: boolean;
    waterColorShallow?: ColorRepresentation;
    waterColorDeep?: ColorRepresentation;

    //Wave shape/animation fine-tuning (only used when waterAnimation is true).
    waterWaveAmplitude?: number;
    waterWaveFrequency?: number;
    waterWaveSpeed?: number;
    waterSparkleIntensity?: number;
    waterFresnelIntensity?: number;

    //How far below land (world units) the water plane rests, and how much of a
    //coastal land tile's radius the beach slope/sand blend covers (0..1).
    //Both only take effect when waterAnimation is true.
    waterDepth?: number;
    beachWidth?: number;
}

//Tile types rendered by the animated water layer (buildWaterLayer) instead of
//the flat land layer (buildLandLayer). Order matters: index+1 is the
//neighborsKind encoding used by the shaders (1 = sea, 2 = shore).
const WATER_TYPES: Land[] = [Land.sea, Land.shore];

interface InstanceAttributes {
    offset: Float32Array;
    style: Float32Array;
    neighborsA: Float32Array;
    neighborsB: Float32Array;
    neighborsPriorityA: Float32Array;
    neighborsPriorityB: Float32Array;
    neighborsKindA: Float32Array;
    neighborsKindB: Float32Array;
}

//----------------------------------------------------------------------------------
//Renders the map as instanced draw calls (InstancedBufferGeometry - a single
//geometry with instanceCount + InstancedBufferAttribute) instead of a separate
//Mesh+ExtrudeGeometry+own TextureLoader per tile like the old Hex.ts/HEX(). Grid
//lines are drawn inside the fragment shaders instead of a RingGeometry mesh per
//tile (old Grid.ts).
//
//Tiles are split into two layers/meshes when waterAnimation is on: a flat "land"
//layer (grass/sand/tundra/snow, plus - if waterAnimation is off - sea/shore too)
//and an animated "water" layer (sea/shore, see shaders/water.*.ts - sum-of-sines
//vertex displacement with analytically derived normals, no normal map, solid
//colors instead of a texture). Both share the same per-tile neighbor/priority/
//kind computation below. A future "mountain" layer (new Land value, own shader
//with vertex displacement) would plug into this the same way, reusing the
//neighbor data to blend/raise shared borders between adjacent mountain tiles
//into a continuous ridge instead of isolated peaks.
//
//The neighborsA/neighborsB attribute order (SE,S,SW / NW,N,NE) must match
//NEIGHBOR_DIRECTIONS' angle convention (see helpers/neighbors.ts) and the
//DIR_SE/DIR_S/... vectors in the shaders, which compute an analytic "closeness
//to this edge" blend factor per direction - no pre-baked mask texture involved,
//so there's nothing that can be misaligned by a differently oriented texture
//asset. Blending is one-directional: a tile only blends towards a *strictly
//higher priority* neighbor (see enums.ts LandPriority), otherwise every shared
//edge would blend both ways at once (a fuzzy halo on both sides of every
//border instead of a single transition).
//
//When waterAnimation is on, coastal land tiles also sink their rim towards the
//water plane's height (waterLevel) and blend to sand near it (see vBeachT in
//terrain.vertex.ts/fragment.ts) - an actual 3D beach slope instead of a flat 2D
//color blend against the water tile's color. neighborsKindA/B (-1 no tile, 0
//non-water, 1 sea, 2 shore) drives both that slope and the water layer's own
//"what to blend towards" decision.
//----------------------------------------------------------------------------------
export class TerrainMesh extends Group {
    private landMesh: Mesh | undefined;
    private landMaterial: RawShaderMaterial | undefined;
    private waterMesh: Mesh | undefined;
    private waterMaterial: RawShaderMaterial | undefined;
    private tileIndex = new Map<string, number>(); // "x,y" -> instance index (land layer only)
    private map: MapInfo;
    private atlasCellIndex: { [type: string]: number } = {};
    private clock = 0;
    private waterAnimationEnabled: boolean;

    constructor(map: MapInfo, private options: TerrainMeshOptions) {
        super();
        this.map = map;
        this.waterAnimationEnabled = options.waterAnimation !== false;
        this.buildAtlasCellIndex();

        const allTiles: Point[] = [];
        for (let x = 0; x < this.map.w; x++) {
            for (let y = 0; y < this.map.h; y++) {
                if (this.map.data[x]?.[y]) allTiles.push({ x, y });
            }
        }

        const isWater = (tile: Point) => WATER_TYPES.includes(this.map.data[tile.x][tile.y].type);
        if (this.waterAnimationEnabled) {
            this.buildLandLayer(allTiles.filter(t => !isWater(t)));
            this.buildWaterLayer(allTiles.filter(isWater));
        } else {
            this.buildLandLayer(allTiles);
        }
        this.buildCitySprites();
    }

    private buildAtlasCellIndex(): void {
        const atlas = this.options.atlas;
        const cols = atlas.width / atlas.cellSize;
        for (const name in atlas.textures) {
            const cell = atlas.textures[name];
            this.atlasCellIndex[name] = cell.cellY * cols + cell.cellX;
        }
    }

    //Atlas cell index for a tile's terrain type. Returns -1 if the tile doesn't
    //exist (used for out-of-map neighbors).
    private cellIndexFor(x: number, y: number): number {
        const row = this.map.data[x];
        const tile: TileInfo | undefined = row ? row[y] : undefined;
        if (!tile) return -1;
        const cell = this.atlasCellIndex[tile.type];
        return cell === undefined ? -1 : cell;
    }

    //Edge-blend priority of a tile's terrain type (see enums.ts LandPriority).
    //Returns -Infinity for out-of-map neighbors so a border tile never blends
    //towards "nothing".
    private priorityFor(x: number, y: number): number {
        const row = this.map.data[x];
        const tile: TileInfo | undefined = row ? row[y] : undefined;
        return tile ? LandPriority[tile.type] : -Infinity;
    }

    //-1 no tile, 0 non-water, 1 sea, 2 shore - drives the land layer's beach
    //slope and the water layer's edge-color resolution (see shaders). Always 0
    //when waterAnimation is off, so no slope/solid-color logic ever triggers
    //and everything renders exactly like the flat, atlas-only original.
    private kindFor(x: number, y: number): number {
        if (!this.waterAnimationEnabled) return 0;
        const row = this.map.data[x];
        const tile: TileInfo | undefined = row ? row[y] : undefined;
        if (!tile) return -1;
        const waterIndex = WATER_TYPES.indexOf(tile.type);
        return waterIndex === -1 ? 0 : waterIndex + 1;
    }

    //Builds the per-instance attribute arrays (offset/style/neighbors/neighbor
    //priorities/kinds) shared by every layer - land and water tiles are laid
    //out identically, only the geometry/shader differ.
    private buildInstanceAttributes(tiles: Point[]): InstanceAttributes {
        const { size } = this.options;
        const attrs: InstanceAttributes = {
            offset: new Float32Array(tiles.length * 2),
            style: new Float32Array(tiles.length * 3),
            neighborsA: new Float32Array(tiles.length * 3),
            neighborsB: new Float32Array(tiles.length * 3),
            neighborsPriorityA: new Float32Array(tiles.length * 3),
            neighborsPriorityB: new Float32Array(tiles.length * 3),
            neighborsKindA: new Float32Array(tiles.length * 3),
            neighborsKindB: new Float32Array(tiles.length * 3)
        };

        tiles.forEach((tile, i) => {
            const info = this.map.data[tile.x][tile.y];
            const center = getHexCenter(tile.x, tile.y, size);

            attrs.offset[i * 2 + 0] = center.x;
            attrs.offset[i * 2 + 1] = center.y; // world Z

            attrs.style[i * 3 + 0] = this.atlasCellIndex[info.type] ?? 0;
            attrs.style[i * 3 + 1] = info.modifiers?.includes("hill") ? 1 : 0;
            attrs.style[i * 3 + 2] = LandPriority[info.type] ?? 0;

            const se = getNeighborCoords(tile.x, tile.y, "SE");
            const s = getNeighborCoords(tile.x, tile.y, "S");
            const sw = getNeighborCoords(tile.x, tile.y, "SW");
            const nw = getNeighborCoords(tile.x, tile.y, "NW");
            const n = getNeighborCoords(tile.x, tile.y, "N");
            const ne = getNeighborCoords(tile.x, tile.y, "NE");

            attrs.neighborsA[i * 3 + 0] = this.cellIndexFor(se.x, se.y);
            attrs.neighborsA[i * 3 + 1] = this.cellIndexFor(s.x, s.y);
            attrs.neighborsA[i * 3 + 2] = this.cellIndexFor(sw.x, sw.y);

            attrs.neighborsB[i * 3 + 0] = this.cellIndexFor(nw.x, nw.y);
            attrs.neighborsB[i * 3 + 1] = this.cellIndexFor(n.x, n.y);
            attrs.neighborsB[i * 3 + 2] = this.cellIndexFor(ne.x, ne.y);

            attrs.neighborsPriorityA[i * 3 + 0] = this.priorityFor(se.x, se.y);
            attrs.neighborsPriorityA[i * 3 + 1] = this.priorityFor(s.x, s.y);
            attrs.neighborsPriorityA[i * 3 + 2] = this.priorityFor(sw.x, sw.y);

            attrs.neighborsPriorityB[i * 3 + 0] = this.priorityFor(nw.x, nw.y);
            attrs.neighborsPriorityB[i * 3 + 1] = this.priorityFor(n.x, n.y);
            attrs.neighborsPriorityB[i * 3 + 2] = this.priorityFor(ne.x, ne.y);

            attrs.neighborsKindA[i * 3 + 0] = this.kindFor(se.x, se.y);
            attrs.neighborsKindA[i * 3 + 1] = this.kindFor(s.x, s.y);
            attrs.neighborsKindA[i * 3 + 2] = this.kindFor(sw.x, sw.y);

            attrs.neighborsKindB[i * 3 + 0] = this.kindFor(nw.x, nw.y);
            attrs.neighborsKindB[i * 3 + 1] = this.kindFor(n.x, n.y);
            attrs.neighborsKindB[i * 3 + 2] = this.kindFor(ne.x, ne.y);
        });

        return attrs;
    }

    private buildInstancedGeometry(tiles: Point[], numSubdivisions: number): InstancedBufferGeometry {
        const hexagon = createHexagonGeometry(this.options.size, numSubdivisions);
        const geometry = new InstancedBufferGeometry();
        geometry.setAttribute("position", hexagon.getAttribute("position"));
        geometry.setAttribute("uv", hexagon.getAttribute("uv"));
        geometry.setIndex(hexagon.getIndex());
        geometry.instanceCount = tiles.length;

        const attrs = this.buildInstanceAttributes(tiles);
        geometry.setAttribute("offset", new InstancedBufferAttribute(attrs.offset, 2));
        geometry.setAttribute("style", new InstancedBufferAttribute(attrs.style, 3));
        geometry.setAttribute("neighborsA", new InstancedBufferAttribute(attrs.neighborsA, 3));
        geometry.setAttribute("neighborsB", new InstancedBufferAttribute(attrs.neighborsB, 3));
        geometry.setAttribute("neighborsPriorityA", new InstancedBufferAttribute(attrs.neighborsPriorityA, 3));
        geometry.setAttribute("neighborsPriorityB", new InstancedBufferAttribute(attrs.neighborsPriorityB, 3));
        geometry.setAttribute("neighborsKindA", new InstancedBufferAttribute(attrs.neighborsKindA, 3));
        geometry.setAttribute("neighborsKindB", new InstancedBufferAttribute(attrs.neighborsKindB, 3));

        return geometry;
    }

    private commonUniforms() {
        const atlas = this.options.atlas;
        const size = this.options.size;
        return {
            textureAtlasMeta: { value: new Vector4(atlas.width, atlas.height, atlas.cellSize, atlas.cellSpacing) },
            hexSize: { value: size },
            sandAtlasIndex: { value: this.atlasCellIndex[Land.sand] ?? 0 },
            waterLevel: { value: -(this.options.waterDepth ?? size * 0.25) },
            beachWidth: { value: this.options.beachWidth ?? 0.35 },
            lightDir: { value: { x: 0.4, y: 1.0, z: 0.3 } },
            showGrid: { value: this.options.gridVisible === false ? 0.0 : 1.0 },
            gridColor: { value: new Color(this.options.gridColor ?? 0x000000) },
            gridWidth: { value: this.options.gridWidth ?? 0.04 },
            gridOpacity: { value: this.options.gridOpacity ?? 0.35 }
        };
    }

    //Mipmapping a multi-cell texture atlas bleeds neighboring cells into each
    //other at lower mip levels (each mip texel then averages pixels that span
    //a cell boundary) - visible as dark blotches on distant/oblique tiles,
    //worst on the water layer's sand-cell blend since it's sampled from many
    //different tiles' local UVs at once. Disabling mipmaps (plain bilinear
    //filtering) avoids it; some distant-terrain shimmer is an acceptable
    //trade-off for a tile-based map that's mostly viewed from a fixed range of
    //distances anyway.
    private loadAtlasTexture() {
        const loader = new TextureLoader().setPath(this.options.texturesBaseUrl);
        const atlasTexture = loader.load(this.options.atlas.image);
        atlasTexture.wrapS = atlasTexture.wrapT = RepeatWrapping;
        atlasTexture.generateMipmaps = false;
        atlasTexture.minFilter = LinearFilter;
        return atlasTexture;
    }

    private buildLandLayer(tiles: Point[]): void {
        if (tiles.length === 0) return;

        const geometry = this.buildInstancedGeometry(tiles, 0);
        tiles.forEach((tile, i) => this.tileIndex.set(`${tile.x},${tile.y}`, i));

        this.landMaterial = new RawShaderMaterial({
            uniforms: {
                map: { value: this.loadAtlasTexture() },
                ...this.commonUniforms()
            },
            vertexShader: TERRAIN_VERTEX_SHADER,
            fragmentShader: TERRAIN_FRAGMENT_SHADER
        });

        this.landMesh = new Mesh(geometry, this.landMaterial);
        this.landMesh.frustumCulled = false;
        this.add(this.landMesh);
    }

    //Water tiles get a subdivided geometry (more vertices than the flat land
    //hex) so the sum-of-sines wave displacement in water.vertex.ts has enough
    //resolution to look like a smooth, rounded surface instead of a faceted tent.
    private buildWaterLayer(tiles: Point[]): void {
        if (tiles.length === 0) return;

        const geometry = this.buildInstancedGeometry(tiles, 2);

        this.waterMaterial = new RawShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                waveAmplitude: { value: this.options.waterWaveAmplitude ?? 1.6 },
                waveFrequency: { value: 0.045 * (this.options.waterWaveFrequency ?? 1.0) },
                waveSpeed: { value: this.options.waterWaveSpeed ?? 1.0 },
                sparkleIntensity: { value: this.options.waterSparkleIntensity ?? 1.0 },
                fresnelIntensity: { value: this.options.waterFresnelIntensity ?? 1.0 },
                waterColorDeep: { value: new Color(this.options.waterColorDeep ?? LandColor[Land.sea]) },
                waterColorShallow: { value: new Color(this.options.waterColorShallow ?? LandColor[Land.shore]) },
                ...this.commonUniforms()
            },
            vertexShader: WATER_VERTEX_SHADER,
            fragmentShader: WATER_FRAGMENT_SHADER
        });

        this.waterMesh = new Mesh(geometry, this.waterMaterial);
        this.waterMesh.frustumCulled = false;
        this.add(this.waterMesh);
    }

    //Demo placeholder: labels sand tiles as a "city" (there's no dedicated city
    //flag in TileInfo yet). Kept as-is from the previous Hex.ts behavior.
    private buildCitySprites(): void {
        const { size } = this.options;
        for (let x = 0; x < this.map.w; x++) {
            for (let y = 0; y < this.map.h; y++) {
                const tile = this.map.data[x]?.[y];
                if (!tile || tile.type !== Land.sand) continue;

                const center = getHexCenter(x, y, size);
                const sprite = makeTextSprite(" City name ", {
                    fontsize: 32,
                    fontface: "Georgia",
                    borderColor: { r: 0, g: 0, b: 255, a: 0.8 }
                });
                sprite.position.set(center.x, Math.round(size / 5), center.y);
                this.add(sprite);
            }
        }
    }

    //Advances the water animation. `dtS` is the elapsed time in seconds since
    //the previous frame - call this once per frame (see HexMap's render loop).
    public update(dtS: number): void {
        if (!this.waterMaterial) return;
        this.clock += dtS;
        this.waterMaterial.uniforms.uTime.value = this.clock;
    }

    public get gridVisible(): boolean {
        return (this.landMaterial ?? this.waterMaterial)?.uniforms.showGrid.value > 0;
    }

    public set gridVisible(value: boolean) {
        const v = value ? 1.0 : 0.0;
        if (this.landMaterial) this.landMaterial.uniforms.showGrid.value = v;
        if (this.waterMaterial) this.waterMaterial.uniforms.showGrid.value = v;
    }

    //Index of a tile within the land layer's instanced attributes, for future
    //point updates (e.g. HexMap.setTile) without rebuilding the whole geometry.
    public getInstanceIndex(x: number, y: number): number | undefined {
        return this.tileIndex.get(`${x},${y}`);
    }

    public get mesh(): Mesh | undefined {
        return this.landMesh;
    }
}
