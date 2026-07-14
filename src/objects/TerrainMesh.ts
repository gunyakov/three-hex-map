import {
    InstancedBufferGeometry,
    InstancedBufferAttribute,
    Mesh,
    RawShaderMaterial,
    TextureLoader,
    Vector4,
    Vector3,
    Box3,
    Color,
    Group,
    Sprite,
    ColorRepresentation,
    RepeatWrapping,
    LinearFilter,
    Texture
} from "three";

import { MapInfo, TileInfo, Point } from "../interfaces";
import { Land, LandPriority, LandColor } from "../enums";
import { getHexCenter } from "../helpers/helpers";
import { getNeighborCoords } from "../helpers/neighbors";
import { createHexagonGeometry } from "./hexagonGeometry";
import { makeTextSprite } from "./citysprite";
import { loadModel } from "../helpers/models";
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

    //If true (default), sea/coastal tiles render on their own animated layer with
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

    //Stylized coastal foam waves on land-adjacent water tiles (see the foam
    //section of shaders/water.fragment.ts): noise-distorted white bands
    //rolling towards the shore plus a solid lapping strip at the waterline.
    //All plain uniforms (live-tunable, no rebuild); only drawn when
    //waterAnimation is on, since the foam lives in the water shader.
    coastalWavesEnabled?: boolean;   // default true
    coastalWaveColor?: ColorRepresentation; // default 0xffffff
    coastalWaveCount?: number;       // bands per shore-to-center span, default 3
    coastalWaveSpeed?: number;       // travel speed towards shore, default 0.6
    coastalWaveWidth?: number;       // band thickness (0..1 of a wavelength), default 0.3
    coastalWaveRange?: number;       // reach out from the shore (0..1 of tile radius), default 0.8
    coastalWaveDistortion?: number;  // 0..1 noise bend/tear amount, default 0.5
    coastalWaveOpacity?: number;     // 0..1, default 0.85

    //How far below land (world units) the water plane rests, and how much of a
    //tile's radius the beach slope/color blend covers in total (0..1, split
    //evenly between the land and water tiles that share a coastal edge - see
    //terrain.vertex.ts/water.vertex.ts). Both only take effect when
    //waterAnimation is true.
    waterDepth?: number;
    beachWidth?: number;

    //Diffusion/blend band sizes (0..1 fraction of a tile's radius): how far a
    //land tile's own atlas texture blends towards a differently-typed land
    //neighbor (landBlendWidth), and how rounded a water tile's corner looks
    //where two coastal edges meet (waterCornerRounding, 0 = sharp, 1 = fully
    //rounded - only applies when both edges of that corner border land; a
    //single coastal edge never gets rounded).
    landBlendWidth?: number;
    waterCornerRounding?: number;

    //City tiles (TileInfo.city) get a 3D model + text label instead of plain
    //terrain (see loadCities()). cityModel is a model folder path (see
    //helpers/models.ts) used as the map-wide default; a tile's own city.model
    //(if present) overrides it. cityScale multiplies the model's own info.json
    //scale, as a map-wide "make all cities a bit bigger/smaller" knob.
    cityModel?: string;
    cityScale?: number;

    //war-fog.jpg (see FogOfWar.ts): file name resolved against texturesBaseUrl
    //(fogTexture) and the color multiplier applied to Explored (previously
    //seen, currently out-of-view-range) tiles/features (fogDarkenFactor, 0..1).
    //fogTextureSize is how many world units one repeat of the texture spans -
    //fog UVs are world-space, so the (seamlessly tileable) image flows
    //continuously across fogged tiles instead of restarting per hex. Default
    //size * 8, i.e. one repeat covers roughly an 8-tile-wide stretch of map.
    fogTexture?: string;
    fogDarkenFactor?: number;
    fogTextureSize?: number;
}

//Tile types rendered by the animated water layer (buildWaterLayer) instead of
//the flat land layer (buildLandLayer). Order matters: index+1 is the
//neighborsKind encoding used by the shaders (1 = sea, 2 = coastal).
const WATER_TYPES: Land[] = [Land.sea, Land.coastal];

interface InstanceAttributes {
    offset: Float32Array;
    style: Float32Array;
    neighborsA: Float32Array;
    neighborsB: Float32Array;
    neighborsPriorityA: Float32Array;
    neighborsPriorityB: Float32Array;
    neighborsKindA: Float32Array;
    neighborsKindB: Float32Array;
    fogState: Float32Array;
}

//A city tile's model + label, tracked so setFogState() can hide it entirely
//(Unseen) or darken it in place (Explored) without a rebuild. Materials are
//cloned once at load time (see loadCities()) specifically so this darkening
//is independent per city - glTF clones otherwise share the same material
//instance, and mutating it would darken every city using that model at once.
interface CityFogEntry {
    wrapper: Group;
    sprite: Sprite;
    meshes: { mesh: Mesh, baseColor: Color }[];
}

//----------------------------------------------------------------------------------
//Renders the map as instanced draw calls (InstancedBufferGeometry - a single
//geometry with instanceCount + InstancedBufferAttribute) instead of a separate
//Mesh+ExtrudeGeometry+own TextureLoader per tile like the old Hex.ts/HEX(). Grid
//lines are drawn inside the fragment shaders instead of a RingGeometry mesh per
//tile (old Grid.ts).
//
//Tiles are split into two layers/meshes when waterAnimation is on: a flat "land"
//layer (grass/sand/tundra/snow, plus - if waterAnimation is off - sea/coastal too)
//and an animated "water" layer (sea/coastal, see shaders/water.*.ts - sum-of-sines
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
//non-water, 1 sea, 2 coastal) drives both that slope and the water layer's own
//"what to blend towards" decision.
//----------------------------------------------------------------------------------
export class TerrainMesh extends Group {
    private landMesh: Mesh | undefined;
    private landMaterial: RawShaderMaterial | undefined;
    private waterMesh: Mesh | undefined;
    private waterMaterial: RawShaderMaterial | undefined;
    private tileIndex = new Map<string, number>(); // "x,y" -> instance index (land layer only)
    private waterTileIndex = new Map<string, number>(); // "x,y" -> instance index (water layer only)
    private cityFog = new Map<string, CityFogEntry>(); // "x,y" -> that tile's city model/label
    private fogTexture: Texture;
    private map: MapInfo;
    private atlasCellIndex: { [type: string]: number } = {};
    private clock = 0;
    private waterAnimationEnabled: boolean;

    constructor(map: MapInfo, private options: TerrainMeshOptions) {
        super();
        this.map = map;
        this.waterAnimationEnabled = options.waterAnimation !== false;
        this.buildAtlasCellIndex();
        this.fogTexture = this.loadFogTexture();

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

    //-1 no tile, 0 non-water, 1 sea, 2 coastal - drives the land layer's beach
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
            neighborsKindB: new Float32Array(tiles.length * 3),
            fogState: new Float32Array(tiles.length).fill(2) // default Visible - see FogOfWar.ts
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
        geometry.setAttribute("fogState", new InstancedBufferAttribute(attrs.fogState, 1));

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
            fogMap: { value: this.fogTexture },
            fogDarkenFactor: { value: this.options.fogDarkenFactor ?? 0.45 },
            fogTextureSize: { value: this.options.fogTextureSize ?? size * 8 },
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

    //war-fog.jpg (see FogOfWar.ts) - a single, non-atlased image sampled with
    //world-space UVs (see terrain/water vertex shaders' vFogUV), so one repeat
    //spans several tiles. RepeatWrapping is required for that (world UVs run
    //far past 0..1); mipmaps are fine here, unlike the atlas (a standalone
    //image has no neighboring cells to bleed into).
    private loadFogTexture(): Texture {
        const loader = new TextureLoader().setPath(this.options.texturesBaseUrl);
        const texture = loader.load(this.options.fogTexture ?? "war-fog.jpg");
        texture.wrapS = texture.wrapT = RepeatWrapping;
        return texture;
    }

    //Subdivided (not a single flat triangle per wedge) so the beach slope and
    //landBlendWidth/beachWidth's smoothstep-based falloffs actually have interior
    //vertices to sample - with only the 2 outer corners + center (0 subdivisions),
    //the corners always saturate to fully-blended (edge factor is exactly 1 at
    //any hex corner) and the center is always 0, so the GPU only ever linearly
    //interpolates between those 2 fixed extremes no matter the configured width.
    private buildLandLayer(tiles: Point[]): void {
        if (tiles.length === 0) return;

        const geometry = this.buildInstancedGeometry(tiles, 2);
        tiles.forEach((tile, i) => this.tileIndex.set(`${tile.x},${tile.y}`, i));

        this.landMaterial = new RawShaderMaterial({
            uniforms: {
                map: { value: this.loadAtlasTexture() },
                landBlendWidth: { value: this.options.landBlendWidth ?? 0.5 },
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
        tiles.forEach((tile, i) => this.waterTileIndex.set(`${tile.x},${tile.y}`, i));

        this.waterMaterial = new RawShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                waveAmplitude: { value: this.options.waterWaveAmplitude ?? 1.6 },
                waveFrequency: { value: 0.045 * (this.options.waterWaveFrequency ?? 1.0) },
                waveSpeed: { value: this.options.waterWaveSpeed ?? 1.0 },
                sparkleIntensity: { value: this.options.waterSparkleIntensity ?? 1.0 },
                fresnelIntensity: { value: this.options.waterFresnelIntensity ?? 1.0 },
                foamEnabled: { value: (this.options.coastalWavesEnabled ?? true) ? 1.0 : 0.0 },
                foamColor: { value: new Color(this.options.coastalWaveColor ?? 0xffffff) },
                foamCount: { value: this.options.coastalWaveCount ?? 3 },
                foamSpeed: { value: this.options.coastalWaveSpeed ?? 0.6 },
                foamWidth: { value: this.options.coastalWaveWidth ?? 0.3 },
                foamRange: { value: this.options.coastalWaveRange ?? 0.8 },
                foamDistortion: { value: this.options.coastalWaveDistortion ?? 0.5 },
                foamOpacity: { value: this.options.coastalWaveOpacity ?? 0.85 },
                waterCornerRounding: { value: this.options.waterCornerRounding ?? 0.4 },
                waterColorDeep: { value: new Color(this.options.waterColorDeep ?? LandColor[Land.sea]) },
                waterColorShallow: { value: new Color(this.options.waterColorShallow ?? LandColor[Land.coastal]) },
                ...this.commonUniforms()
            },
            vertexShader: WATER_VERTEX_SHADER,
            fragmentShader: WATER_FRAGMENT_SHADER
        });

        this.waterMesh = new Mesh(geometry, this.waterMaterial);
        this.waterMesh.frustumCulled = false;
        this.add(this.waterMesh);
    }

    //Places a 3D model + text label on every tile.city (TileInfo.city, see
    //interfaces.ts) - independent of terrain type, so a city can sit on any
    //land tile instead of being tied to a specific Land value. The model
    //comes from the tile's own data if present (city.model), falling back to
    //the map-wide cityModel option - a map can mix different models (e.g. a
    //capital vs. a village) purely through its own JSON, no code changes
    //required. Each model's own offset/rotation/scale fine-tuning lives in its
    //folder's info.json (see helpers/models.ts's fixup matrix), not here -
    //cityScale only applies an *additional* map-wide multiplier on top of that.
    //
    //Async because loading a glTF model is async (see helpers/models.ts) -
    //called by HexMap.load() after construction, not from the constructor,
    //so callers can await it if they need cities present before proceeding.
    public async loadCities(): Promise<void> {
        const { size } = this.options;
        const defaultModel = this.options.cityModel ?? "Assets/models/monument";
        const cityScale = this.options.cityScale ?? 1;

        for (let x = 0; x < this.map.w; x++) {
            for (let y = 0; y < this.map.h; y++) {
                const tile = this.map.data[x]?.[y];
                if (!tile?.city) continue;

                const center = getHexCenter(x, y, size);
                const modelPath = tile.city.model ?? defaultModel;

                const { scene, fixup } = await loadModel(modelPath);
                const model = scene.clone(true);
                model.applyMatrix4(fixup);
                model.updateMatrixWorld(true);

                // Clone each mesh's material so darkening this city (see
                // setFogState()) doesn't also darken every other city sharing
                // the same model - scene.clone(true) copies the hierarchy but
                // leaves materials as shared references.
                const cityMeshes: { mesh: Mesh, baseColor: Color }[] = [];
                model.traverse(o => {
                    const mesh = o as Mesh;
                    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
                    mesh.material = (mesh.material as { clone(): typeof mesh.material }).clone();
                    const color = (mesh.material as unknown as { color?: Color }).color;
                    if (color) cityMeshes.push({ mesh, baseColor: color.clone() });
                });

                const box = new Box3().setFromObject(model);
                const modelHeight = box.getSize(new Vector3()).y;

                const wrapper = new Group();
                wrapper.add(model);
                wrapper.scale.setScalar(cityScale);
                wrapper.position.set(center.x, 0, center.y);
                this.add(wrapper);

                const sprite = makeTextSprite(` ${tile.city.name ?? "City"} `, {
                    fontsize: 32,
                    fontface: "Georgia",
                    borderColor: { r: 0, g: 0, b: 255, a: 0.8 }
                });
                sprite.position.set(center.x, modelHeight * cityScale + Math.round(size / 5), center.y);
                this.add(sprite);

                this.cityFog.set(`${x},${y}`, { wrapper, sprite, meshes: cityMeshes });
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

    //-------------------------------------------------------------------------
    //Live shader-uniform tuning knobs, for a GUI to adjust without rebuilding
    //the map (unlike waterAnimation itself, which changes tile layer grouping
    //and so needs a full TerrainMesh rebuild - see HexMap.rebuildTerrain()).
    //beachWidth/waterDepth exist as separate uniform objects on landMaterial
    //and waterMaterial each (commonUniforms() is called once per material, not
    //shared), so both setters below write to both.
    //-------------------------------------------------------------------------
    public get landBlendWidth(): number {
        return this.landMaterial?.uniforms.landBlendWidth.value ?? 0.5;
    }
    public set landBlendWidth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.landBlendWidth.value = value;
    }

    public get waterCornerRounding(): number {
        return this.waterMaterial?.uniforms.waterCornerRounding.value ?? 0.4;
    }
    public set waterCornerRounding(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.waterCornerRounding.value = value;
    }

    public get beachWidth(): number {
        return this.landMaterial?.uniforms.beachWidth.value ?? this.waterMaterial?.uniforms.beachWidth.value ?? 0.35;
    }
    public set beachWidth(value: number) {
        if (this.landMaterial) this.landMaterial.uniforms.beachWidth.value = value;
        if (this.waterMaterial) this.waterMaterial.uniforms.beachWidth.value = value;
    }

    //waterLevel uniform is negative (rest height below land); exposed here as
    //a positive "depth" to match the waterDepth constructor option's sign.
    public get waterDepth(): number {
        const level = this.landMaterial?.uniforms.waterLevel.value ?? this.waterMaterial?.uniforms.waterLevel.value;
        return level === undefined ? this.options.size * 0.25 : -level;
    }
    public set waterDepth(value: number) {
        const level = -value;
        if (this.landMaterial) this.landMaterial.uniforms.waterLevel.value = level;
        if (this.waterMaterial) this.waterMaterial.uniforms.waterLevel.value = level;
    }

    public get waterWaveAmplitude(): number {
        return this.waterMaterial?.uniforms.waveAmplitude.value ?? 1.6;
    }
    public set waterWaveAmplitude(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.waveAmplitude.value = value;
    }

    //The stored uniform is pre-scaled by 0.045 (see buildWaterLayer) so the
    //raw shader frequency stays in a sane range - getter/setter work in the
    //same "multiplier" units as the constructor option so callers don't need
    //to know about that factor.
    public get waterWaveFrequency(): number {
        return (this.waterMaterial?.uniforms.waveFrequency.value ?? 0.045) / 0.045;
    }
    public set waterWaveFrequency(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.waveFrequency.value = 0.045 * value;
    }

    public get waterWaveSpeed(): number {
        return this.waterMaterial?.uniforms.waveSpeed.value ?? 1.0;
    }
    public set waterWaveSpeed(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.waveSpeed.value = value;
    }

    public get waterSparkleIntensity(): number {
        return this.waterMaterial?.uniforms.sparkleIntensity.value ?? 1.0;
    }
    public set waterSparkleIntensity(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.sparkleIntensity.value = value;
    }

    public get waterFresnelIntensity(): number {
        return this.waterMaterial?.uniforms.fresnelIntensity.value ?? 1.0;
    }
    public set waterFresnelIntensity(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.fresnelIntensity.value = value;
    }

    public get waterColorShallow(): number {
        return (this.waterMaterial?.uniforms.waterColorShallow.value as Color)?.getHex() ?? 0;
    }
    public set waterColorShallow(value: ColorRepresentation) {
        (this.waterMaterial?.uniforms.waterColorShallow.value as Color)?.set(value);
    }

    public get waterColorDeep(): number {
        return (this.waterMaterial?.uniforms.waterColorDeep.value as Color)?.getHex() ?? 0;
    }
    public set waterColorDeep(value: ColorRepresentation) {
        (this.waterMaterial?.uniforms.waterColorDeep.value as Color)?.set(value);
    }

    //Coastal foam waves - all plain uniforms on the water material, so
    //toggling/tuning is live (unlike waterAnimation itself, which is
    //structural - see HexMap.rebuildTerrain()).
    public get coastalWavesEnabled(): boolean {
        return (this.waterMaterial?.uniforms.foamEnabled.value ?? 1.0) > 0.5;
    }
    public set coastalWavesEnabled(value: boolean) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamEnabled.value = value ? 1.0 : 0.0;
    }

    public get coastalWaveColor(): number {
        return (this.waterMaterial?.uniforms.foamColor.value as Color)?.getHex() ?? 0xffffff;
    }
    public set coastalWaveColor(value: ColorRepresentation) {
        (this.waterMaterial?.uniforms.foamColor.value as Color)?.set(value);
    }

    public get coastalWaveCount(): number {
        return this.waterMaterial?.uniforms.foamCount.value ?? 3;
    }
    public set coastalWaveCount(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamCount.value = value;
    }

    public get coastalWaveSpeed(): number {
        return this.waterMaterial?.uniforms.foamSpeed.value ?? 0.6;
    }
    public set coastalWaveSpeed(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamSpeed.value = value;
    }

    public get coastalWaveWidth(): number {
        return this.waterMaterial?.uniforms.foamWidth.value ?? 0.3;
    }
    public set coastalWaveWidth(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamWidth.value = value;
    }

    public get coastalWaveRange(): number {
        return this.waterMaterial?.uniforms.foamRange.value ?? 0.8;
    }
    public set coastalWaveRange(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamRange.value = value;
    }

    public get coastalWaveDistortion(): number {
        return this.waterMaterial?.uniforms.foamDistortion.value ?? 0.5;
    }
    public set coastalWaveDistortion(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamDistortion.value = value;
    }

    public get coastalWaveOpacity(): number {
        return this.waterMaterial?.uniforms.foamOpacity.value ?? 0.85;
    }
    public set coastalWaveOpacity(value: number) {
        if (this.waterMaterial) this.waterMaterial.uniforms.foamOpacity.value = value;
    }

    //Index of a tile within the land layer's instanced attributes, for future
    //point updates (e.g. HexMap.setTile) without rebuilding the whole geometry.
    public getInstanceIndex(x: number, y: number): number | undefined {
        return this.tileIndex.get(`${x},${y}`);
    }

    //-------------------------------------------------------------------------
    //Fog of war (see FogOfWar.ts) - updates one tile's terrain (land or water,
    //whichever layer it's actually on) and its city model/label (if any) to
    //the given state. Plain per-instance attribute writes, no rebuild.
    //-------------------------------------------------------------------------
    public setFogState(x: number, y: number, state: number): void {
        const key = `${x},${y}`;

        const landIdx = this.tileIndex.get(key);
        if (landIdx !== undefined && this.landMesh) {
            const attribute = this.landMesh.geometry.getAttribute("fogState") as InstancedBufferAttribute;
            attribute.setX(landIdx, state);
            attribute.needsUpdate = true;
        }

        const waterIdx = this.waterTileIndex.get(key);
        if (waterIdx !== undefined && this.waterMesh) {
            const attribute = this.waterMesh.geometry.getAttribute("fogState") as InstancedBufferAttribute;
            attribute.setX(waterIdx, state);
            attribute.needsUpdate = true;
        }

        this.setCityFog(key, state);
    }

    private setCityFog(key: string, state: number): void {
        const entry = this.cityFog.get(key);
        if (!entry) return;

        const hidden = state < 0.5;
        entry.wrapper.visible = !hidden;
        entry.sprite.visible = !hidden;
        if (hidden) return;

        const shade = state < 1.5 ? (this.options.fogDarkenFactor ?? 0.45) : 1;
        for (const { mesh, baseColor } of entry.meshes) {
            ((mesh.material as unknown as { color: Color }).color).copy(baseColor).multiplyScalar(shade);
        }
    }

    public get mesh(): Mesh | undefined {
        return this.landMesh;
    }

    //Releases the land/water geometries, materials and atlas texture. City
    //models/labels (also children of this Group) are *not* disposed - their
    //geometry/materials are shared references into loadModel()'s cache (see
    //helpers/models.ts), reused by future loads, not owned by this instance.
    public dispose(): void {
        this.landMesh?.geometry.dispose();
        (this.landMaterial?.uniforms.map?.value as Texture | undefined)?.dispose();
        this.landMaterial?.dispose();
        this.waterMesh?.geometry.dispose();
        this.waterMaterial?.dispose();
        this.fogTexture.dispose();
    }
}
