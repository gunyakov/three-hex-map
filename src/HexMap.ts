import {
    WebGLRenderer,
    Scene as ThreeScene,
    PerspectiveCamera,
    Color,
    AmbientLight,
    DirectionalLight,
    Mesh,
    RingGeometry,
    MeshBasicMaterial,
    Line,
    LineBasicMaterial,
    BufferGeometry,
    Vector3,
    Object3D,
    ColorRepresentation,
    MOUSE,
    TOUCH
} from "three";
// MapControls was removed from three.js's examples; OrbitControls configured
// with swapped mouse buttons (left=pan, right=rotate) reproduces it.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { EventEmitter } from "./EventEmitter";
import { MapInfo, Point, TileInfo } from "./interfaces";
import { HexMapEventName, Land, LandColor } from "./enums";
import { getHexCenter } from "./helpers/helpers";
import { screenToGround, pickTile } from "./helpers/picking";
import { TerrainMesh, TerrainAtlas } from "./objects/TerrainMesh";
import { createForest, ForestField } from "./objects/Forest";
import { GrassField, createGrassField } from "./objects/Grass";
import { FogState } from "./objects/FogOfWar";

export interface HexMapOptions {
    element: string;                       // CSS selector for the <canvas>
    size?: number;                          // hex size in world units, default 40
    texturesBaseUrl?: string;                // folder with terrain.png/transitions.png/land-atlas.json
    gridVisible?: boolean;
    gridColor?: ColorRepresentation;
    gridWidth?: number;
    gridOpacity?: number;
    selectorColor?: ColorRepresentation;
    pointerColor?: ColorRepresentation;
    treesPerTile?: number;

    //If true (default), sea/coastal render as an animated, solid-colored water
    //layer (waves, sparkle, a 3D beach slope where they meet land). If false,
    //water is just another flat, static, atlas-textured tile like before -
    //useful if you'd rather supply your own water texture than solid colors.
    waterAnimation?: boolean;
    waterColorShallow?: ColorRepresentation;
    waterColorDeep?: ColorRepresentation;

    //Wave shape/animation fine-tuning (only used when waterAnimation is true).
    //Defaults produce a gentle, sparkling sea; turn amplitude/speed up for
    //choppier water, sparkleIntensity/fresnelIntensity down for a flatter look.
    waterWaveAmplitude?: number;    // default 1.6 (world units)
    waterWaveFrequency?: number;    // default 1.0 (multiplier)
    waterWaveSpeed?: number;        // default 1.0 (multiplier)
    waterSparkleIntensity?: number; // default 1.0
    waterFresnelIntensity?: number; // default 1.0

    //Stylized coastal foam waves (after Harry Alisavakis' stylized water
    //shader): noise-distorted white bands rolling in towards every shoreline
    //plus a solid lapping foam strip right at the waterline. Rendered by the
    //water shader, so it only shows when waterAnimation is true; every knob
    //is a live uniform (no rebuild), see shaders/water.fragment.ts.
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
    //evenly between the land and water tiles that share a coastal edge). Only
    //take effect when waterAnimation is true. waterDepth defaults to size*0.25.
    waterDepth?: number;
    beachWidth?: number; // default 0.35

    //Diffusion/blend band sizes (0..1 fraction of a tile's radius): how far a
    //land tile's atlas texture blends towards a differently-typed land
    //neighbor (landBlendWidth), and how rounded a water tile's corner looks
    //where two coastal edges meet (waterCornerRounding, 0 = sharp corner, 1 =
    //fully rounded - only where both edges of that corner border land).
    landBlendWidth?: number;    // default 0.5
    waterCornerRounding?: number; // default 0.4

    //Map-wide default tree/city models - each is a *folder* path containing
    //model.glb + info.json (see helpers/models.ts), not a bare filename; the
    //folder's info.json holds that model's own offset/rotation/scale fine-
    //tuning. A tile's own TileInfo.city.model/treeModel (see interfaces.ts)
    //overrides these per-tile. treeScale/cityScale are extra map-wide
    //multipliers on top of each model's own info.json scale.
    treeModel?: string;     // default "Assets/models/pinia"
    treeScale?: number;     // default 1
    cityModel?: string;     // default "Assets/models/monument"
    cityScale?: number;     // default 1

    //A wind-animated grass-blade layer scattered on top of Land.land ("grass")
    //tiles, on top of the terrain layer's own atlas texture (see objects/
    //Grass.ts) - purely decorative, disabling it just leaves the plain grass
    //texture visible underneath, exactly like before this option existed.
    grassEnabled?: boolean;      // default true
    grassDensity?: number;       // blades per tile, default 60
    grassBladeWidth?: number;    // world units, default size * 0.03
    grassBladeHeight?: number;   // world units, default size * 0.18
    grassWindStrength?: number;  // tip sway distance, world units, default bladeHeight * 0.35
    grassWindSpeed?: number;     // default 1.2

    //Fog of war (see objects/FogOfWar.ts): fogTexture is a file name resolved
    //against texturesBaseUrl (default "war-fog.jpg", the same folder as the
    //terrain atlas), drawn over every tile HexMap.setTileFog() marks Unseen -
    //fogDarkenFactor is the color multiplier applied instead to Explored tiles
    //(previously seen, currently outside every unit's view range), across
    //every layer (terrain, grass, trees, cities). fogTextureSize is how many
    //world units one repeat of the (seamlessly tileable) fog texture spans -
    //fog UVs are world-space, so the image flows continuously across fogged
    //tiles instead of restarting per hex; defaults to size * 8. Every tile
    //defaults to fully visible until something calls setTileFog(), so this is
    //a no-op unless a consumer (e.g. GameEngine) actively drives it.
    fogTexture?: string;
    fogDarkenFactor?: number;
    fogTextureSize?: number;
}

const DEFAULT_OPTIONS: Required<Omit<HexMapOptions, "element" | "waterDepth" | "fogTextureSize">> = {
    size: 40,
    texturesBaseUrl: "textures/",
    gridVisible: true,
    gridColor: 0x42322b,
    gridWidth: 0.04,
    gridOpacity: 0.35,
    selectorColor: 0xffff00,
    pointerColor: 0xeeeeee,
    treesPerTile: 20,
    waterAnimation: true,
    waterColorShallow: LandColor[Land.coastal],
    waterColorDeep: LandColor[Land.sea],
    waterWaveAmplitude: 1.6,
    waterWaveFrequency: 1.0,
    waterWaveSpeed: 1.0,
    waterSparkleIntensity: 1.0,
    waterFresnelIntensity: 1.0,
    coastalWavesEnabled: true,
    coastalWaveColor: 0xffffff,
    coastalWaveCount: 3,
    coastalWaveSpeed: 0.6,
    coastalWaveWidth: 0.3,
    coastalWaveRange: 0.8,
    coastalWaveDistortion: 0.5,
    coastalWaveOpacity: 0.85,
    beachWidth: 0.35,
    landBlendWidth: 0.5,
    waterCornerRounding: 0.4,
    treeModel: "Assets/models/pinia",
    treeScale: 1,
    cityModel: "Assets/models/monument",
    cityScale: 1,
    grassEnabled: true,
    grassDensity: 60,
    grassBladeWidth: 1.2,
    grassBladeHeight: 7.2,
    grassWindStrength: 2.5,
    grassWindSpeed: 1.2,
    fogTexture: "war-fog.jpg",
    fogDarkenFactor: 0.45
};

//----------------------------------------------------------------------------------
//Public entry point of the library. Owns the renderer/camera/scene/controls (what
//used to be Scene.ts) and the tile/grid/selector/trees content (what used to be
//map.ts/HexMap in map.ts) - the two were split only because of the callback
//plumbing between them, which the shared EventEmitter now makes unnecessary.
//
//Usage (mirrors maplibre-gl's event-driven API):
//   const map = new HexMap({ element: "canvas" });
//   await map.load(mapData);
//   map.on("click", ({x, y, tile}) => ...);
//   map.on("hover", ({x, y, tile}) => ...);
//----------------------------------------------------------------------------------
export class HexMap extends EventEmitter {
    private options: Required<Omit<HexMapOptions, "element" | "waterDepth" | "fogTextureSize">> & { element: string, waterDepth: number, fogTextureSize: number };

    private canvas: HTMLCanvasElement;
    private renderer: WebGLRenderer;
    private scene: ThreeScene;
    private camera: PerspectiveCamera;
    private controls: OrbitControls;

    private mapData: MapInfo;
    private atlas: TerrainAtlas;
    private terrain: TerrainMesh;
    private forest: ForestField | undefined;
    private grass: GrassField | undefined;
    private selector: Mesh;
    private pointer: Mesh;
    private routeLine: Line | undefined;

    private mouseDownAt: Point | null = null; // screen coords, used to distinguish click vs. drag
    private lastHover: Point | null = null;
    private lastSelected: Point | null = null;

    constructor(options: HexMapOptions) {
        super();
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            waterDepth: options.waterDepth ?? (options.size ?? DEFAULT_OPTIONS.size) * 0.25,
            fogTextureSize: options.fogTextureSize ?? (options.size ?? DEFAULT_OPTIONS.size) * 8
        };

        const el = document.querySelector(this.options.element);
        if (!(el instanceof HTMLCanvasElement)) {
            throw new Error(`HexMap: element "${this.options.element}" is not a <canvas>`);
        }
        this.canvas = el;

        this.setupScene();
        this.setupCamera();
        this.setupLights();
        this.setupControls();
        this.setupMarkers();
        this.setupEvents();
        this.handleResize();

        this.animate(0);
    }

    //-------------------------------------------------------------------------
    //Scene / renderer / camera / controls
    //-------------------------------------------------------------------------
    private setupScene(): void {
        this.scene = new ThreeScene();
        this.scene.background = new Color(0xcccccc);
        this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
    }

    private setupCamera(): void {
        this.camera = new PerspectiveCamera(60, 1, 10, 2000);
        this.camera.position.set(900, 500, 1000);
        this.scene.add(this.camera);
    }

    private setupLights(): void {
        const dirLight1 = new DirectionalLight(0xffffff);
        dirLight1.position.set(1, 1, 1);
        this.scene.add(dirLight1);

        const dirLight2 = new DirectionalLight(0x002288);
        dirLight2.position.set(-1, -1, -1);
        this.scene.add(dirLight2);

        this.scene.add(new AmbientLight(0x222222));
    }

    private setupControls(): void {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        // MapControls (removed from three.js) was just OrbitControls with left/right
        // mouse buttons swapped so left-drag pans instead of rotating.
        this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
        this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 100;
        this.controls.maxDistance = 800;
        this.controls.minAzimuthAngle = 80 * (Math.PI / 180);
        this.controls.maxAzimuthAngle = 100 * (Math.PI / 180);
        this.controls.minPolarAngle = 10 * (Math.PI / 180);
        this.controls.maxPolarAngle = 90 * (Math.PI / 180);
    }

    //The initial camera position/target (set in setupCamera(), before map data
    //is known) looks at world origin, which is only the map's (0,0) corner, not
    //its middle - most maps would load with the camera pointed off to one side
    //of the actual content. Re-centers the existing look-at *angle* (the
    //direction from target to camera, already tuned via min/maxAzimuth/PolarAngle)
    //on the map's real center instead, at a fixed, in-range viewing distance.
    private frameMap(mapData: MapInfo): void {
        const size = this.options.size;
        const corner00 = getHexCenter(0, 0, size);
        const cornerWH = getHexCenter(mapData.w - 1, mapData.h - 1, size);
        const centerX = (corner00.x + cornerWH.x) / 2;
        const centerZ = (corner00.y + cornerWH.y) / 2;

        const viewDistance = (this.controls.minDistance + this.controls.maxDistance) / 2;
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();

        this.controls.target.set(centerX, 0, centerZ);
        this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
        this.controls.update();
    }

    private setupMarkers(): void {
        const size = this.options.size;

        const selectorGeom = new RingGeometry(0.97 * size, size, 6, 2);
        this.selector = new Mesh(selectorGeom, new MeshBasicMaterial({ color: this.options.selectorColor }));
        this.selector.rotateX(-Math.PI / 2);
        this.selector.position.setY(size / 10 + 1.1);
        this.selector.visible = false;
        this.scene.add(this.selector);

        const pointerGeom = new RingGeometry(0.97 * size, size, 6, 2);
        this.pointer = new Mesh(pointerGeom, new MeshBasicMaterial({ color: this.options.pointerColor }));
        this.pointer.rotateX(-Math.PI / 2);
        this.pointer.position.setY(size / 10 + 1.1);
        this.pointer.visible = false;
        this.scene.add(this.pointer);
    }

    private setupEvents(): void {
        window.addEventListener("resize", this.handleResize, { passive: true });
        this.canvas.addEventListener("mousedown", this.onMouseDown);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("mouseup", this.onMouseUp);
    }

    private handleResize = (): void => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height);
    };

    private lastFrameTime: number | undefined;

    private animate = (t: number): void => {
        const dtS = this.lastFrameTime === undefined ? 0 : (t - this.lastFrameTime) / 1000;
        this.lastFrameTime = t;

        this.terrain?.update(dtS);
        this.grass?.update(dtS);
        this.emit("frame", { t });
        this.renderer.render(this.scene, this.camera);
        window.requestAnimationFrame(this.animate);
    };

    //-------------------------------------------------------------------------
    //Picking (analytic, ground-plane based - see helpers/picking.ts)
    //-------------------------------------------------------------------------
    private onMouseDown = (event: MouseEvent): void => {
        this.mouseDownAt = { x: event.clientX, y: event.clientY };
    };

    private onPointerMove = (event: MouseEvent): void => {
        const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
        if (!ground) return;

        const tileCoords = pickTile(ground, this.options.size, this.mapData?.w, this.mapData?.h);
        if (!tileCoords) return;

        if (this.lastHover && this.lastHover.x === tileCoords.x && this.lastHover.y === tileCoords.y) return;
        this.lastHover = tileCoords;

        const tile = this.getTile(tileCoords.x, tileCoords.y);
        if (!tile) return;

        const center = getHexCenter(tileCoords.x, tileCoords.y, this.options.size);
        this.pointer.visible = true;
        this.pointer.position.setX(center.x);
        this.pointer.position.setZ(center.y);

        this.emit("hover" satisfies HexMapEventName, { x: tileCoords.x, y: tileCoords.y, tile });
    };

    private onMouseUp = (event: MouseEvent): void => {
        const downAt = this.mouseDownAt;
        this.mouseDownAt = null;
        if (!downAt) return;

        // if the pointer moved noticeably, treat this as a camera drag, not a click
        const dragDistance = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
        if (dragDistance > 4) return;

        const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
        if (!ground) return;

        const tileCoords = pickTile(ground, this.options.size, this.mapData?.w, this.mapData?.h);
        if (!tileCoords) return;

        const tile = this.getTile(tileCoords.x, tileCoords.y);
        if (!tile) return;

        this.selectTile(tileCoords.x, tileCoords.y);
        this.emit("click" satisfies HexMapEventName, { x: tileCoords.x, y: tileCoords.y, tile });
    };

    //-------------------------------------------------------------------------
    //Public API
    //-------------------------------------------------------------------------

    //Builds the terrain/grid/trees for the given map data. Fetches the terrain
    //atlas descriptor (land-atlas.json) from texturesBaseUrl; textures themselves
    //load in the background as usual for three.js.
    public async load(mapData: MapInfo): Promise<void> {
        this.mapData = mapData;
        this.frameMap(mapData);

        const atlasUrl = new URL("land-atlas.json", new URL(this.options.texturesBaseUrl, window.location.href)).href;
        this.atlas = await fetch(atlasUrl).then(r => r.json());

        await this.rebuildTerrain();
        await this.rebuildForest();
        this.rebuildGrass();

        this.emit("load" satisfies HexMapEventName, undefined);
    }

    //Tears down and recreates the terrain (land/water layers + city models) from
    //the current options against the already-fetched atlas/map data. Needed for
    //any option that changes tile layer *grouping* rather than a plain shader
    //uniform - currently only waterAnimation (splitting sea/coastal onto their own
    //animated layer vs. flattening them into the atlas-textured land layer is a
    //different instance count/geometry, not something a uniform can express).
    //Everything else water/blend-related is a live uniform - see TerrainMesh's
    //own getters/setters, forwarded below (waterWaveAmplitude, beachWidth, etc.)
    private async rebuildTerrain(): Promise<void> {
        if (this.terrain) {
            this.scene.remove(this.terrain);
            this.terrain.dispose();
        }

        this.terrain = new TerrainMesh(this.mapData, {
            size: this.options.size,
            texturesBaseUrl: this.options.texturesBaseUrl,
            atlas: this.atlas,
            gridVisible: this.options.gridVisible,
            gridColor: this.options.gridColor,
            gridWidth: this.options.gridWidth,
            gridOpacity: this.options.gridOpacity,
            waterAnimation: this.options.waterAnimation,
            waterColorShallow: this.options.waterColorShallow,
            waterColorDeep: this.options.waterColorDeep,
            waterWaveAmplitude: this.options.waterWaveAmplitude,
            waterWaveFrequency: this.options.waterWaveFrequency,
            waterWaveSpeed: this.options.waterWaveSpeed,
            waterSparkleIntensity: this.options.waterSparkleIntensity,
            waterFresnelIntensity: this.options.waterFresnelIntensity,
            coastalWavesEnabled: this.options.coastalWavesEnabled,
            coastalWaveColor: this.options.coastalWaveColor,
            coastalWaveCount: this.options.coastalWaveCount,
            coastalWaveSpeed: this.options.coastalWaveSpeed,
            coastalWaveWidth: this.options.coastalWaveWidth,
            coastalWaveRange: this.options.coastalWaveRange,
            coastalWaveDistortion: this.options.coastalWaveDistortion,
            coastalWaveOpacity: this.options.coastalWaveOpacity,
            waterDepth: this.options.waterDepth,
            beachWidth: this.options.beachWidth,
            landBlendWidth: this.options.landBlendWidth,
            waterCornerRounding: this.options.waterCornerRounding,
            cityModel: this.options.cityModel,
            cityScale: this.options.cityScale,
            fogTexture: this.options.fogTexture,
            fogDarkenFactor: this.options.fogDarkenFactor,
            fogTextureSize: this.options.fogTextureSize
        });
        this.scene.add(this.terrain);
        await this.terrain.loadCities();
    }

    //Tears down and recreates the tree instances from the current tree*
    //options. treesPerTile/treeScale are baked into the instanced geometry's
    //instance count/matrices at build time, so - like grass - there's no live
    //uniform for them, only a rebuild. Model files are cached (see
    //helpers/models.ts), so repeated rebuilds don't re-fetch the glTF.
    private async rebuildForest(): Promise<void> {
        if (this.forest) {
            this.scene.remove(this.forest);
            this.forest.traverse(o => (o as unknown as Mesh).geometry?.dispose());
            this.forest = undefined;
        }
        if (!this.mapData) return;

        this.forest = (await createForest(this.mapData, {
            size: this.options.size,
            treesPerTile: this.options.treesPerTile,
            treeModel: this.options.treeModel,
            treeScale: this.options.treeScale,
            fogDarkenFactor: this.options.fogDarkenFactor
        })) ?? undefined;

        if (this.forest) this.scene.add(this.forest);
    }

    //Tears down and recreates the grass field from the current grass* options
    //against the already-loaded map data. Grass is purely procedural (no
    //textures/models to load), so this is synchronous and cheap enough to call
    //directly from a live GUI slider (see grassDensity/grassBladeWidth/
    //grassBladeHeight setters below) - a rebuild replaces the whole instanced
    //geometry, there's no partial/incremental update.
    private rebuildGrass(): void {
        if (this.grass) {
            this.scene.remove(this.grass);
            this.grass.dispose();
            this.grass = undefined;
        }
        if (!this.mapData) return;

        this.grass = createGrassField(this.mapData, {
            size: this.options.size,
            density: this.options.grassDensity,
            bladeWidth: this.options.grassBladeWidth,
            bladeHeight: this.options.grassBladeHeight,
            windStrength: this.options.grassWindStrength,
            windSpeed: this.options.grassWindSpeed,
            fogDarkenFactor: this.options.fogDarkenFactor
        }) ?? undefined;

        if (this.grass) {
            this.grass.visible = this.options.grassEnabled;
            this.scene.add(this.grass);
        }
    }

    public getTile(x: number, y: number): TileInfo | undefined {
        return this.mapData?.data[x]?.[y];
    }

    //-------------------------------------------------------------------------
    //Fog of war (see objects/FogOfWar.ts) - updates one tile's terrain, grass
    //and trees/city to the given state (0 = Unseen, 1 = Explored, 2 = Visible).
    //Every tile defaults to Visible, so calling this is entirely optional; a
    //consumer that wants fog of war (e.g. GameEngine, when its own fogOfWar
    //option is on) drives it from unit positions/view ranges.
    //-------------------------------------------------------------------------
    public setTileFog(x: number, y: number, state: FogState): void {
        this.terrain?.setFogState(x, y, state);
        this.grass?.setFogState(x, y, state);
        this.forest?.setFogState(x, y, state);
    }

    public get gridVisible(): boolean {
        return this.terrain?.gridVisible ?? this.options.gridVisible;
    }

    public set gridVisible(value: boolean) {
        this.options.gridVisible = value;
        if (this.terrain) this.terrain.gridVisible = value;
    }

    //-------------------------------------------------------------------------
    //Water animation - enabling/disabling is structural (see rebuildTerrain()),
    //everything else here is a live shader uniform forwarded straight through
    //to TerrainMesh, no rebuild needed.
    //-------------------------------------------------------------------------
    public get waterAnimation(): boolean {
        return this.options.waterAnimation;
    }
    public set waterAnimation(value: boolean) {
        this.options.waterAnimation = value;
        void this.rebuildTerrain();
    }

    public get waterWaveAmplitude(): number {
        return this.terrain?.waterWaveAmplitude ?? this.options.waterWaveAmplitude;
    }
    public set waterWaveAmplitude(value: number) {
        this.options.waterWaveAmplitude = value;
        if (this.terrain) this.terrain.waterWaveAmplitude = value;
    }

    public get waterWaveFrequency(): number {
        return this.terrain?.waterWaveFrequency ?? this.options.waterWaveFrequency;
    }
    public set waterWaveFrequency(value: number) {
        this.options.waterWaveFrequency = value;
        if (this.terrain) this.terrain.waterWaveFrequency = value;
    }

    public get waterWaveSpeed(): number {
        return this.terrain?.waterWaveSpeed ?? this.options.waterWaveSpeed;
    }
    public set waterWaveSpeed(value: number) {
        this.options.waterWaveSpeed = value;
        if (this.terrain) this.terrain.waterWaveSpeed = value;
    }

    public get waterSparkleIntensity(): number {
        return this.terrain?.waterSparkleIntensity ?? this.options.waterSparkleIntensity;
    }
    public set waterSparkleIntensity(value: number) {
        this.options.waterSparkleIntensity = value;
        if (this.terrain) this.terrain.waterSparkleIntensity = value;
    }

    public get waterFresnelIntensity(): number {
        return this.terrain?.waterFresnelIntensity ?? this.options.waterFresnelIntensity;
    }
    public set waterFresnelIntensity(value: number) {
        this.options.waterFresnelIntensity = value;
        if (this.terrain) this.terrain.waterFresnelIntensity = value;
    }

    public get waterColorShallow(): ColorRepresentation {
        return this.terrain?.waterColorShallow ?? this.options.waterColorShallow;
    }
    public set waterColorShallow(value: ColorRepresentation) {
        this.options.waterColorShallow = value;
        if (this.terrain) this.terrain.waterColorShallow = value;
    }

    public get waterColorDeep(): ColorRepresentation {
        return this.terrain?.waterColorDeep ?? this.options.waterColorDeep;
    }
    public set waterColorDeep(value: ColorRepresentation) {
        this.options.waterColorDeep = value;
        if (this.terrain) this.terrain.waterColorDeep = value;
    }

    //-------------------------------------------------------------------------
    //Coastal foam waves - all live shader uniforms forwarded to TerrainMesh,
    //no rebuild (the enable flag included: it's a uniform gate in the water
    //fragment shader, not a structural change like waterAnimation).
    //-------------------------------------------------------------------------
    public get coastalWavesEnabled(): boolean {
        return this.terrain?.coastalWavesEnabled ?? this.options.coastalWavesEnabled;
    }
    public set coastalWavesEnabled(value: boolean) {
        this.options.coastalWavesEnabled = value;
        if (this.terrain) this.terrain.coastalWavesEnabled = value;
    }

    public get coastalWaveColor(): ColorRepresentation {
        return this.terrain?.coastalWaveColor ?? this.options.coastalWaveColor;
    }
    public set coastalWaveColor(value: ColorRepresentation) {
        this.options.coastalWaveColor = value;
        if (this.terrain) this.terrain.coastalWaveColor = value;
    }

    public get coastalWaveCount(): number {
        return this.terrain?.coastalWaveCount ?? this.options.coastalWaveCount;
    }
    public set coastalWaveCount(value: number) {
        this.options.coastalWaveCount = value;
        if (this.terrain) this.terrain.coastalWaveCount = value;
    }

    public get coastalWaveSpeed(): number {
        return this.terrain?.coastalWaveSpeed ?? this.options.coastalWaveSpeed;
    }
    public set coastalWaveSpeed(value: number) {
        this.options.coastalWaveSpeed = value;
        if (this.terrain) this.terrain.coastalWaveSpeed = value;
    }

    public get coastalWaveWidth(): number {
        return this.terrain?.coastalWaveWidth ?? this.options.coastalWaveWidth;
    }
    public set coastalWaveWidth(value: number) {
        this.options.coastalWaveWidth = value;
        if (this.terrain) this.terrain.coastalWaveWidth = value;
    }

    public get coastalWaveRange(): number {
        return this.terrain?.coastalWaveRange ?? this.options.coastalWaveRange;
    }
    public set coastalWaveRange(value: number) {
        this.options.coastalWaveRange = value;
        if (this.terrain) this.terrain.coastalWaveRange = value;
    }

    public get coastalWaveDistortion(): number {
        return this.terrain?.coastalWaveDistortion ?? this.options.coastalWaveDistortion;
    }
    public set coastalWaveDistortion(value: number) {
        this.options.coastalWaveDistortion = value;
        if (this.terrain) this.terrain.coastalWaveDistortion = value;
    }

    public get coastalWaveOpacity(): number {
        return this.terrain?.coastalWaveOpacity ?? this.options.coastalWaveOpacity;
    }
    public set coastalWaveOpacity(value: number) {
        this.options.coastalWaveOpacity = value;
        if (this.terrain) this.terrain.coastalWaveOpacity = value;
    }

    //-------------------------------------------------------------------------
    //Land/coastal blending + beach height - all live shader uniforms, no rebuild.
    //-------------------------------------------------------------------------
    public get landBlendWidth(): number {
        return this.terrain?.landBlendWidth ?? this.options.landBlendWidth;
    }
    public set landBlendWidth(value: number) {
        this.options.landBlendWidth = value;
        if (this.terrain) this.terrain.landBlendWidth = value;
    }

    public get waterCornerRounding(): number {
        return this.terrain?.waterCornerRounding ?? this.options.waterCornerRounding;
    }
    public set waterCornerRounding(value: number) {
        this.options.waterCornerRounding = value;
        if (this.terrain) this.terrain.waterCornerRounding = value;
    }

    public get beachWidth(): number {
        return this.terrain?.beachWidth ?? this.options.beachWidth;
    }
    public set beachWidth(value: number) {
        this.options.beachWidth = value;
        if (this.terrain) this.terrain.beachWidth = value;
    }

    public get waterDepth(): number {
        return this.terrain?.waterDepth ?? this.options.waterDepth;
    }
    public set waterDepth(value: number) {
        this.options.waterDepth = value;
        if (this.terrain) this.terrain.waterDepth = value;
    }

    //-------------------------------------------------------------------------
    //Tree density/size - baked into the instanced geometry at build time (like
    //grass), so both rebuild the forest rather than touching a uniform.
    //-------------------------------------------------------------------------
    public get treesPerTile(): number {
        return this.options.treesPerTile;
    }
    public set treesPerTile(value: number) {
        this.options.treesPerTile = value;
        void this.rebuildForest();
    }

    public get treeScale(): number {
        return this.options.treeScale;
    }
    public set treeScale(value: number) {
        this.options.treeScale = value;
        void this.rebuildForest();
    }

    //Toggling visibility just flips the mesh's own `visible` flag (grass is
    //still generated even when disabled) - the terrain's own grass texture
    //keeps rendering underneath either way, so disabling this is purely
    //"remove the blade overlay", not "regenerate as flat grass".
    public get grassVisible(): boolean {
        return this.grass?.visible ?? this.options.grassEnabled;
    }

    public set grassVisible(value: boolean) {
        this.options.grassEnabled = value;
        if (this.grass) this.grass.visible = value;
    }

    //Wind uniforms are cheap to update live - no rebuild needed.
    public get grassWindStrength(): number {
        return this.grass?.windStrength ?? this.options.grassWindStrength;
    }

    public set grassWindStrength(value: number) {
        this.options.grassWindStrength = value;
        if (this.grass) this.grass.windStrength = value;
    }

    public get grassWindSpeed(): number {
        return this.grass?.windSpeed ?? this.options.grassWindSpeed;
    }

    public set grassWindSpeed(value: number) {
        this.options.grassWindSpeed = value;
        if (this.grass) this.grass.windSpeed = value;
    }

    //Blade count/size is baked into the instanced geometry at build time, so
    //changing any of these rebuilds the whole grass field (see rebuildGrass()).
    public get grassDensity(): number {
        return this.options.grassDensity;
    }

    public set grassDensity(value: number) {
        this.options.grassDensity = value;
        this.rebuildGrass();
    }

    public get grassBladeWidth(): number {
        return this.options.grassBladeWidth;
    }

    public set grassBladeWidth(value: number) {
        this.options.grassBladeWidth = value;
        this.rebuildGrass();
    }

    public get grassBladeHeight(): number {
        return this.options.grassBladeHeight;
    }

    public set grassBladeHeight(value: number) {
        this.options.grassBladeHeight = value;
        this.rebuildGrass();
    }

    public selectTile(x: number, y: number): void {
        const center = getHexCenter(x, y, this.options.size);
        this.selector.visible = true;
        this.selector.position.setX(center.x);
        this.selector.position.setZ(center.y);
        this.lastSelected = { x, y };
    }

    public get selectedTile(): Point | null {
        return this.lastSelected;
    }

    public drawRoutePath(path: Point[]): void {
        this.cleanRoutePath();

        const points = path.map(p => {
            const center = getHexCenter(p.x, p.y, this.options.size);
            return new Vector3(center.x, 10, center.y);
        });

        const geometry = new BufferGeometry().setFromPoints(points);
        const material = new LineBasicMaterial({ color: 0xff0000, linewidth: 5 });
        this.routeLine = new Line(geometry, material);
        this.scene.add(this.routeLine);
    }

    public cleanRoutePath(): void {
        if (this.routeLine) {
            this.scene.remove(this.routeLine);
            this.routeLine = undefined;
        }
    }

    //Escape hatch for consumers that want to add their own Object3D (units,
    //effects, custom markers) to the map's scene.
    public add(object: Object3D): void {
        this.scene.add(object);
    }

    public remove(object: Object3D): void {
        this.scene.remove(object);
    }

    public getCamera(): PerspectiveCamera {
        return this.camera;
    }

    public getScene(): ThreeScene {
        return this.scene;
    }
}
