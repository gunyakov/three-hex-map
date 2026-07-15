import {
    BufferGeometry,
    Float32BufferAttribute,
    InstancedBufferGeometry,
    InstancedBufferAttribute,
    Mesh,
    RawShaderMaterial,
    Color,
    ColorRepresentation,
    DoubleSide
} from "three";
import pointInPolygon from "robust-point-in-polygon";

import { getRandomInt, HEXPolygon, getHexCenter } from "../helpers/helpers";
import { MapInfo } from "../interfaces";
import { Land } from "../enums";
import { waterEdgeValue, isInTileWater, isLakeTile, WaterClearanceOptions } from "../helpers/rivers";
import { GRASS_VERTEX_SHADER } from "../shaders/grass.vertex";
import { GRASS_FRAGMENT_SHADER } from "../shaders/grass.fragment";

export interface GrassOptions {
    size: number;
    density?: number;         // blades per tile, default 60
    bladeWidth?: number;      // world units, default size * 0.03
    bladeHeight?: number;     // world units, default size * 0.18
    heightVariation?: number; // 0..1 random per-blade height jitter, default 0.4
    windStrength?: number;    // tip sway distance in world units, default bladeHeight * 0.35
    windSpeed?: number;       // default 1.2
    colorBase?: ColorRepresentation; // root color, default a darker green
    colorTip?: ColorRepresentation;  // tip color, default a lighter green
    fogDarkenFactor?: number; // color multiplier for Explored fog tiles, default 0.45 - see FogOfWar.ts

    //River/lake water clearance (see helpers/rivers.ts's isInTileWater):
    //blades sit at a flat y=0 baseline, so anything inside the painted water
    //(including its noise-bent bulges) would stand in the river/lake. Same
    //fractions-of-tile-radius values as the map's options - keep them in sync.
    riverWidth?: number;     // default 0.28
    riverBankWidth?: number; // default 0.14
    riverCurvature?: number; // default 0.5
    lakeShoreWidth?: number; // default 0.18
}

interface TileBladeRange { start: number, count: number }

//----------------------------------------------------------------------------------
//A thin, wind-animated grass layer scattered on top of Land.land ("grass") tiles
//- purely decorative, added on top of TerrainMesh's own atlas-textured land
//layer (which keeps rendering underneath exactly as before). Skips tiles with a
//city (a model sits there instead); wood tiles keep their grass (forest floor).
//
//One InstancedBufferGeometry / one draw call for every blade on the map - same
//approach TerrainMesh already uses for hex tiles - rather than a Mesh/Object3D
//per blade. Each blade is a single 5-vertex tapered shape (see
//buildBladeGeometry), vertex-colored root->tip instead of textured, since a
//solid gradient is enough at this scale and needs no extra texture fetch/alpha
//test. Wind sway is a per-instance phase-shifted sine (grass.vertex.ts) so a
//gust visibly travels across the field instead of every blade moving in
//lockstep.
//
//Purely procedural - no textures/models to load - so unlike Forest.ts/
//TerrainMesh.loadCities() this is synchronous and can be rebuilt instantly
//(e.g. a live GUI slider changing blade density) without an async round-trip.
//----------------------------------------------------------------------------------
export class GrassField extends Mesh {
    private grassMaterial: RawShaderMaterial;
    private clock = 0;

    constructor(
        geometry: InstancedBufferGeometry,
        material: RawShaderMaterial,
        private tileRanges: Map<string, TileBladeRange>
    ) {
        super(geometry, material);
        this.grassMaterial = material;
        this.frustumCulled = false;
    }

    //Updates every blade belonging to (x, y) to the given fog state (see
    //FogOfWar.ts) - a plain attribute-slice fill + needsUpdate, no rebuild.
    //No-op for tiles with no grass (city tiles, non-"land" terrain).
    public setFogState(x: number, y: number, state: number): void {
        const range = this.tileRanges.get(`${x},${y}`);
        if (!range) return;

        const attribute = this.geometry.getAttribute("fogState") as InstancedBufferAttribute;
        for (let i = 0; i < range.count; i++) attribute.setX(range.start + i, state);
        attribute.needsUpdate = true;
    }

    //Advances the wind animation. `dtS` is the elapsed time in seconds since
    //the previous frame - call this once per frame (see HexMap's render loop).
    public update(dtS: number): void {
        this.clock += dtS;
        this.grassMaterial.uniforms.uTime.value = this.clock;
    }

    public get windStrength(): number {
        return this.grassMaterial.uniforms.windStrength.value;
    }
    public set windStrength(value: number) {
        this.grassMaterial.uniforms.windStrength.value = value;
    }

    public get windSpeed(): number {
        return this.grassMaterial.uniforms.windSpeed.value;
    }
    public set windSpeed(value: number) {
        this.grassMaterial.uniforms.windSpeed.value = value;
    }

    public dispose(): void {
        this.geometry.dispose();
        this.grassMaterial.dispose();
    }
}

//A single tapered blade authored in [-0.5..0.5] width x [0..1] height (local,
//unscaled) - per-instance `scale` stretches it to the actual blade size, so
//the geometry itself is built once and reused for every instance. The mid-
//height vertices give the blade a bend joint instead of a single rigid
//triangle, so the wind shader has something to visibly curve.
function buildBladeGeometry(): BufferGeometry {
    const positions = new Float32Array([
        -0.5, 0.0, 0,
        0.5, 0.0, 0,
        -0.25, 0.5, 0,
        0.25, 0.5, 0,
        0.0, 1.0, 0
    ]);
    const index = [0, 1, 2, 1, 3, 2, 2, 3, 4];

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    return geometry;
}

//Builds the map-wide grass field. Returns null if the map has no grass tiles
//or density is 0.
export function createGrassField(map: MapInfo, options: GrassOptions): GrassField | null {
    const { size } = options;
    const density = options.density ?? 60;
    if (density <= 0) return null;

    const bladeWidth = options.bladeWidth ?? size * 0.03;
    const bladeHeight = options.bladeHeight ?? size * 0.18;
    const heightVariation = options.heightVariation ?? 0.4;
    const windStrength = options.windStrength ?? bladeHeight * 0.35;
    const windSpeed = options.windSpeed ?? 1.2;

    //Lake tiles are skipped outright: with the waterline's noise wobble the
    //remaining dry shore rim is too thin to reliably place blades in (and the
    //10-attempt rejection fallback below would end up dropping them in the
    //water). River tiles keep their grass - the banks are wide enough.
    const tiles: { x: number, y: number }[] = [];
    for (let x = 0; x < map.w; x++) {
        for (let y = 0; y < map.h; y++) {
            const tile = map.data[x]?.[y];
            if (tile?.type === Land.land && !tile.city && !isLakeTile(tile)) tiles.push({ x, y });
        }
    }
    if (tiles.length === 0) return null;

    // Shrunk somewhat from the true hex edge, since blades are placed at a flat
    // y=0 baseline while the land layer itself sinks its rim on coastal tiles
    // (see terrain.vertex.ts's beach slope) - keeping clear of the rim avoids
    // blades floating above/poking through that sunken edge.
    const polygon = HEXPolygon({ x: 0, y: 0 }, size * 0.8).map(p => [p.x, p.y]);
    const totalBlades = tiles.length * density;

    // On river tiles, keep blades out of the water (its maximum noise-bent
    // reach included - see isInTileWater). Blades landing in the outer bank
    // strip are fine - it's a vegetation band.
    const waterOptions: WaterClearanceOptions = {
        riverWidth: options.riverWidth ?? 0.28,
        riverBankWidth: options.riverBankWidth ?? 0.14,
        riverCurvature: options.riverCurvature ?? 0.5,
        lakeShoreWidth: options.lakeShoreWidth ?? 0.18
    };

    const offsets = new Float32Array(totalBlades * 2);
    const angles = new Float32Array(totalBlades);
    const scales = new Float32Array(totalBlades * 2);
    const phases = new Float32Array(totalBlades);
    const shades = new Float32Array(totalBlades);
    const fogStates = new Float32Array(totalBlades).fill(2); // default Visible - see FogOfWar.ts

    const tileRanges = new Map<string, TileBladeRange>();

    let instance = 0;
    for (const tile of tiles) {
        const center = getHexCenter(tile.x, tile.y, size);
        const tileStart = instance;
        const waterValue = waterEdgeValue(map, tile.x, tile.y); // -1 = no water, isInTileWater is then always false

        for (let i = 0; i < density; i++) {
            let lx = 0, ly = 0, attempts = 0, valid = false;
            while (!valid && attempts < 20) {
                lx = getRandomInt(-size, size);
                ly = getRandomInt(-size, size);
                valid = pointInPolygon(polygon, [lx, ly]) === -1 // -1 = inside the polygon
                    && !isInTileWater(lx, ly, waterValue, size, waterOptions);
                attempts++;
            }
            // No dry spot found - DROP the blade rather than placing it at the
            // last attempt's position: on river tiles the water covers enough
            // of the hex that the old "place it anyway" fallback dumped a few
            // blades per tile straight into the channel. The instanced arrays
            // are simply left oversized; instanceCount below only covers what
            // was actually placed.
            if (!valid) continue;

            offsets[instance * 2 + 0] = center.x + lx;
            offsets[instance * 2 + 1] = center.y + ly;
            angles[instance] = Math.random() * Math.PI * 2;

            const heightJitter = 1 - heightVariation * 0.5 + Math.random() * heightVariation;
            scales[instance * 2 + 0] = bladeWidth * (0.8 + Math.random() * 0.4);
            scales[instance * 2 + 1] = bladeHeight * heightJitter;

            phases[instance] = Math.random() * Math.PI * 2;
            shades[instance] = 0.75 + Math.random() * 0.35;

            instance++;
        }

        tileRanges.set(`${tile.x},${tile.y}`, { start: tileStart, count: instance - tileStart });
    }

    const blade = buildBladeGeometry();
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute("position", blade.getAttribute("position"));
    geometry.setIndex(blade.getIndex());
    geometry.instanceCount = instance;

    geometry.setAttribute("offset", new InstancedBufferAttribute(offsets, 2));
    geometry.setAttribute("angle", new InstancedBufferAttribute(angles, 1));
    geometry.setAttribute("scale", new InstancedBufferAttribute(scales, 2));
    geometry.setAttribute("phase", new InstancedBufferAttribute(phases, 1));
    geometry.setAttribute("shade", new InstancedBufferAttribute(shades, 1));
    geometry.setAttribute("fogState", new InstancedBufferAttribute(fogStates, 1));

    const material = new RawShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            windStrength: { value: windStrength },
            windSpeed: { value: windSpeed },
            colorBase: { value: new Color(options.colorBase ?? 0x3c6e2e) },
            colorTip: { value: new Color(options.colorTip ?? 0x8fce5a) },
            fogDarkenFactor: { value: options.fogDarkenFactor ?? 0.45 }
        },
        vertexShader: GRASS_VERTEX_SHADER,
        fragmentShader: GRASS_FRAGMENT_SHADER,
        side: DoubleSide
    });

    return new GrassField(geometry, material, tileRanges);
}
