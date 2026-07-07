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
import { createForest } from "./objects/Forest";

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

    //If true (default), sea/shore render as an animated, solid-colored water
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

    //How far below land (world units) the water plane rests, and how much of a
    //coastal land tile's radius the beach slope/sand blend covers (0..1). Only
    //take effect when waterAnimation is true. waterDepth defaults to size*0.25.
    waterDepth?: number;
    beachWidth?: number; // default 0.35
}

const DEFAULT_OPTIONS: Required<Omit<HexMapOptions, "element" | "waterDepth">> = {
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
    waterColorShallow: LandColor[Land.shore],
    waterColorDeep: LandColor[Land.sea],
    waterWaveAmplitude: 1.6,
    waterWaveFrequency: 1.0,
    waterWaveSpeed: 1.0,
    waterSparkleIntensity: 1.0,
    waterFresnelIntensity: 1.0,
    beachWidth: 0.35
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
    private options: Required<Omit<HexMapOptions, "element" | "waterDepth">> & { element: string, waterDepth: number };

    private canvas: HTMLCanvasElement;
    private renderer: WebGLRenderer;
    private scene: ThreeScene;
    private camera: PerspectiveCamera;
    private controls: OrbitControls;

    private mapData: MapInfo;
    private terrain: TerrainMesh;
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
            waterDepth: options.waterDepth ?? (options.size ?? DEFAULT_OPTIONS.size) * 0.25
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
        const atlas: TerrainAtlas = await fetch(atlasUrl).then(r => r.json());

        this.terrain = new TerrainMesh(mapData, {
            size: this.options.size,
            texturesBaseUrl: this.options.texturesBaseUrl,
            atlas,
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
            waterDepth: this.options.waterDepth,
            beachWidth: this.options.beachWidth
        });
        this.scene.add(this.terrain);

        const forest = createForest(mapData, { size: this.options.size, treesPerTile: this.options.treesPerTile });
        if (forest) this.scene.add(forest);

        this.emit("load" satisfies HexMapEventName, undefined);
    }

    public getTile(x: number, y: number): TileInfo | undefined {
        return this.mapData?.data[x]?.[y];
    }

    public get gridVisible(): boolean {
        return this.terrain?.gridVisible ?? this.options.gridVisible;
    }

    public set gridVisible(value: boolean) {
        this.options.gridVisible = value;
        if (this.terrain) this.terrain.gridVisible = value;
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
