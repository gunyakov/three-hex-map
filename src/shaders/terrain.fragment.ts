export const TERRAIN_FRAGMENT_SHADER = `
// highp, not mediump: the river noise hash (hash21's fract(sin(x) * 43758...))
// is fed world-space coordinates in the hundreds/thousands - at fp16 precision
// it collapses into structured streak garbage. The water shader already runs
// highp for the same reason (its foam uses the same hash).
precision highp float;

uniform sampler2D map;
uniform vec4 textureAtlasMeta;
uniform float sandAtlasIndex;
uniform float landBlendWidth; // 0..1 fraction of tile radius, land-to-land diffusion size

// Curved coastline: the visual waterline is bent by *static* world-space value
// noise (same recipe as the river banks below) so bays and headlands cut
// across the straight hex edges. Where the bent waterline pushes inland, this
// shader paints animated sea water on the land tile - the water layer paints
// beach sand where it recedes seaward (see water.fragment.ts), both sampling
// the same world-space noise so the waterline stays continuous across the two
// meshes' shared edge. beachWidth/waterCornerRounding mirror the values the
// vertex/water stages use for the same signals.
uniform float beachWidth;
uniform float waterCornerRounding;
uniform float coastCurvature;   // 0..1, how strongly noise bends the waterline
uniform vec3 seaColorShallow;   // painted coast water colors - the SAME Color
uniform vec3 seaColorDeep;      // instances as the water layer's
                                // waterColorShallow/Deep (see TerrainMesh), so
                                // live color changes update both together

// Organic land-type transitions: the blendEdge() band is bent by the same
// world-space noise and its strength modulated by a finer octave, so borders
// read as patchy growth instead of straight strips parallel to hex edges.
uniform float landBlendCurvature; // 0..1

uniform sampler2D fogMap;        // war-fog.jpg, tiled per-tile via vUV (not atlas-indexed)
uniform float fogDarkenFactor;   // color multiplier for Explored (fogState 1) tiles

uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;

uniform vec3 lightDir;

// Rivers/lakes, drawn over the atlas texture on tiles with the "river"/"lake"
// modifier (vRiverEdges >= 0, see helpers/rivers.ts for the encoding). The
// waterline - a river's channel-centerline distance, a lake's shore factor -
// is bent by *static* world-space value noise: world-space makes the curved
// banks continue seamlessly across tile borders, static keeps the banks
// themselves still while the ripple noise (scrolled by uTime) animates only
// the water inside them.
uniform float hexSize;          // tile circumradius (shared via commonUniforms)
uniform float uTime;            // seconds, drives the ripple animation
uniform float foamEnabled;      // coastal wave foam on shader-painted coastal water
uniform vec3 foamColor;
uniform float foamCount;
uniform float foamSpeed;
uniform float foamWidth;
uniform float foamRange;
uniform float foamDistortion;
uniform float foamOpacity;
uniform float riverWidth;       // channel waterline half-width, fraction of tile radius
uniform float riverBankWidth;   // bank strip width beyond the waterline, same units
uniform float riverCurvature;   // 0..1, how strongly noise bends the banks
uniform float riverFlowSpeed;   // ripple scroll speed multiplier
uniform float lakeShoreWidth;   // lake grass rim inset from shored edges, same units
uniform vec3 riverColorShallow; // water color at the banks
uniform vec3 riverColorDeep;    // water color over the channel centerline / lake body
uniform vec3 riverBankColor;    // vegetation strip hugging the waterline

varying vec2 vUV;
varying vec2 vTexCoord;
varying float vBorder;
varying float vTerrain;
varying float vModifiers;
varying float vPriority;
varying vec3 vNeighborsA;
varying vec3 vNeighborsB;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying vec3 vNormal;
varying float vBeachT;
varying float vFogState;
varying vec2 vFogUV;
varying float vRiverEdges;
varying float vRiverSeaMouthEdges;
varying float vRiverLakeMouthEdges;
varying float vLakeNeighborEdges;
varying vec2 vLocal;
varying vec2 vWorldXZ;
varying vec3 vNeighborsKindA; // -1 no tile, 0 land, 1 sea, 2 coastal (SE,S,SW)
varying vec3 vNeighborsKindB; // (NW,N,NE)
varying float vElevation;     // normalized mountain elevation, 0 on flat tiles

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

// Cheap value noise, same recipe as water.fragment.ts's - keeps the land
// layer texture-free for rivers too (no extra noise texture to load).
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// Same channel-centerline distance as terrain.vertex.ts's riverChannelDist()
// (and helpers/rivers.ts's CPU mirror) - see the comments there. Duplicated
// because vertex and fragment shaders are separate string constants.
float riverSegDist(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return length(p - dir * t);
}

float riverChannelDist(vec2 p, float mask, float apothem) {
    float d = length(p);
    if (mod(floor(mask /  1.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SE, apothem));
    if (mod(floor(mask /  2.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_S,  apothem));
    if (mod(floor(mask /  4.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SW, apothem));
    if (mod(floor(mask /  8.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NW, apothem));
    if (mod(floor(mask / 16.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_N,  apothem));
    if (mod(floor(mask / 32.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NE, apothem));
    return d;
}

vec2 riverMouthSeg(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return vec2(length(p - dir * t), t / apothem);
}

// River mouths widen from the tile center to an outlet whose FULL width is
// 80% of one hex side. riverWidth/mouthWidth are half-widths, so the maximum
// half-width is 0.4 of hexSize.
// x = water mask strength, y = bank mask strength, z = deep-center strength,
// w = edge progress.
vec4 riverMouthShape(vec2 p, float mask, float apothem, float bendOff) {
    vec4 outShape = vec4(0.0);
    for (int i = 0; i < 6; i++) {
        float bit = pow(2.0, float(i));
        if (mod(floor(mask / bit), 2.0) < 0.5) continue;

        vec2 dir = DIR_SE;
        if (i == 1) dir = DIR_S;
        else if (i == 2) dir = DIR_SW;
        else if (i == 3) dir = DIR_NW;
        else if (i == 4) dir = DIR_N;
        else if (i == 5) dir = DIR_NE;

        vec2 seg = riverMouthSeg(p, dir, apothem);
        float progress = smoothstep(0.0, 1.0, seg.y);
        float mouthWidth = mix(riverWidth, 0.4, progress);
        float d = seg.x / hexSize + bendOff;

        float water = 1.0 - smoothstep(mouthWidth - 0.04, mouthWidth, d);
        float bank = 1.0 - smoothstep(mouthWidth + riverBankWidth * 0.35, mouthWidth + riverBankWidth, d);
        float depth = 1.0 - smoothstep(0.0, mouthWidth, d);
        outShape.x = max(outShape.x, water);
        outShape.y = max(outShape.y, bank);
        outShape.z = max(outShape.z, depth);
        outShape.w = max(outShape.w, progress * water);
    }
    return outShape;
}

// Lake shore factor - see terrain.vertex.ts's identical helper (and its CPU
// mirror in helpers/rivers.ts): closeness to the nearest *shored* edge, 1.0
// exactly on it, 0 on a fully-open lake-interior tile.
float lakeShore(float openMask, vec3 efA, vec3 efB) {
    float s = 0.0;
    if (mod(floor(openMask /  1.0), 2.0) < 0.5) s = max(s, efA.x);
    if (mod(floor(openMask /  2.0), 2.0) < 0.5) s = max(s, efA.y);
    if (mod(floor(openMask /  4.0), 2.0) < 0.5) s = max(s, efA.z);
    if (mod(floor(openMask /  8.0), 2.0) < 0.5) s = max(s, efB.x);
    if (mod(floor(openMask / 16.0), 2.0) < 0.5) s = max(s, efB.y);
    if (mod(floor(openMask / 32.0), 2.0) < 0.5) s = max(s, efB.z);
    return s;
}

vec2 cellIndexToUV(float idx) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    // subtract a small epsilon to avoid edge flickering when sampling the last column/row
    float cols = atlasWidth / cellSize - 1e-6;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);

    return vec2(x / cols + vUV.x / cols, 1.0 - (y / rows + (1.0 - vUV.y) / rows));
}

// Blends towards a neighboring tile's atlas texture near the edge actually
// shared with it. factor (from vEdgeFactorsA/B, see terrain.vertex.ts) is an
// analytic "closeness to that specific edge" value: 1.0 exactly on the shared
// edge, fading to 0 towards the opposite side of the hex. landBlendWidth
// compresses that fade into just the outer fraction of the tile (0..1) instead
// of spanning the whole distance to the far side, so the transition band's
// size is controllable instead of always being "the whole tile".
//
// Only blends towards a STRICTLY higher-priority neighbor (neighborPriority >
// vPriority - see enums.ts LandPriority). Without this, a shared edge blended
// both ways at once (e.g. land fading into water AND water fading into land),
// which reads as a fuzzy halo on both sides of every border instead of a single
// one-directional transition.
//
// bend (world-space noise, shared by all 6 calls) shifts the band's position
// so the border meanders instead of running parallel to the hex edge; patch
// modulates its strength so the mixed-in texture reads as patchy growth.
vec4 blendEdge(vec4 inputColor, float neighborTerrain, float neighborPriority, float factor, float bend, float patch) {
    if (neighborTerrain < 0.0 || neighborTerrain == vTerrain) return inputColor;
    if (neighborPriority <= vPriority) return inputColor;

    vec2 otherUV = cellIndexToUV(neighborTerrain);
    vec4 neighborColor = texture2D(map, otherUV);

    float e0 = 1.0 - clamp(landBlendWidth, 0.001, 1.0);
    float t = smoothstep(e0, 1.0, factor + bend) * patch;
    return mix(inputColor, neighborColor, t);
}

// Same corner treatment as water.vertex.ts's roundedCorner() - see the
// comment there. Applied per-pixel here so the land side's coastal-distance
// field has the same rounded shape as the water layer's own.
float roundedCorner(float isWaterA, float isWaterB, float dA, float dB) {
    if (isWaterA < 0.5 || isWaterB < 0.5) return -1.0;
    float sharp = max(dA, dB);
    float rounded = length(vec2(dA, dB));
    return mix(sharp, rounded, clamp(waterCornerRounding, 0.0, 1.0));
}

float lakeNeighborField(float mask) {
    float wSE = mod(floor(mask /  1.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wS  = mod(floor(mask /  2.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wSW = mod(floor(mask /  4.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wNW = mod(floor(mask /  8.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wN  = mod(floor(mask / 16.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wNE = mod(floor(mask / 32.0), 2.0) > 0.5 ? 1.0 : 0.0;

    float f = 0.0;
    f = max(f, wSE > 0.5 ? vEdgeFactorsA.x : 0.0);
    f = max(f, wS  > 0.5 ? vEdgeFactorsA.y : 0.0);
    f = max(f, wSW > 0.5 ? vEdgeFactorsA.z : 0.0);
    f = max(f, wNW > 0.5 ? vEdgeFactorsB.x : 0.0);
    f = max(f, wN  > 0.5 ? vEdgeFactorsB.y : 0.0);
    f = max(f, wNE > 0.5 ? vEdgeFactorsB.z : 0.0);
    if (f <= 0.0) return 0.0;

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    f = max(f, roundedCorner(wSE, wS,  dSE, dS));
    f = max(f, roundedCorner(wS,  wSW, dS,  dSW));
    f = max(f, roundedCorner(wSW, wNW, dSW, dNW));
    f = max(f, roundedCorner(wNW, wN,  dNW, dN));
    f = max(f, roundedCorner(wN,  wNE, dN,  dNE));
    f = max(f, roundedCorner(wNE, wSE, dNE, dSE));
    return f;
}

// Per-pixel "closeness to the coastline" field: max over the water-neighbor
// edges' factors, with shared corners between two water edges rounded off.
// Returns vec2(field, kind): field is 1.0 exactly on the mesh edge shared
// with a water tile, 0 on a tile with no water neighbor at all (never grows
// a coast); kind is the dominant water neighbor's kind (1 sea, 2 coastal),
// so the painted water can start from the same deep/shallow base color that
// actual neighbor tile renders - without it, an island in deep sea got a
// visibly lighter hex-shaped ring (shallow-based paint against deep water).
// Kinds arrive as varyings and must be re-rounded (floor(v + 0.5)): varying
// interpolation is not exact even for per-instance-constant values, and the
// >= 0.5 water test would otherwise flip per pixel (see vRiverEdges below).
vec2 coastField() {
    vec3 kA = floor(vNeighborsKindA + 0.5);
    vec3 kB = floor(vNeighborsKindB + 0.5);
    float wSE = kA.x >= 0.5 ? 1.0 : 0.0;
    float wS  = kA.y >= 0.5 ? 1.0 : 0.0;
    float wSW = kA.z >= 0.5 ? 1.0 : 0.0;
    float wNW = kB.x >= 0.5 ? 1.0 : 0.0;
    float wN  = kB.y >= 0.5 ? 1.0 : 0.0;
    float wNE = kB.z >= 0.5 ? 1.0 : 0.0;

    // straight per-edge max, tracking which edge's kind won
    float f = 0.0;
    float kind = 2.0;
    if (wSE > 0.5 && vEdgeFactorsA.x > f) { f = vEdgeFactorsA.x; kind = kA.x; }
    if (wS  > 0.5 && vEdgeFactorsA.y > f) { f = vEdgeFactorsA.y; kind = kA.y; }
    if (wSW > 0.5 && vEdgeFactorsA.z > f) { f = vEdgeFactorsA.z; kind = kA.z; }
    if (wNW > 0.5 && vEdgeFactorsB.x > f) { f = vEdgeFactorsB.x; kind = kB.x; }
    if (wN  > 0.5 && vEdgeFactorsB.y > f) { f = vEdgeFactorsB.y; kind = kB.y; }
    if (wNE > 0.5 && vEdgeFactorsB.z > f) { f = vEdgeFactorsB.z; kind = kB.z; }
    if (f <= 0.0) return vec2(0.0, kind);

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    // rounded corners only strengthen the field; the winning edge's kind from
    // above is kept (a corner blends two edges anyway - the stronger one's
    // kind is the reasonable pick).
    f = max(f, roundedCorner(wSE, wS,  dSE, dS));
    f = max(f, roundedCorner(wS,  wSW, dS,  dSW));
    f = max(f, roundedCorner(wSW, wNW, dSW, dNW));
    f = max(f, roundedCorner(wNW, wN,  dNW, dN));
    f = max(f, roundedCorner(wN,  wNE, dN,  dNE));
    f = max(f, roundedCorner(wNE, wSE, dNE, dSE));
    return vec2(f, kind);
}

// Same travelling coastal foam bands as water.fragment.ts, used here for the
// part of the sea that the land shader paints when a curved coastline pushes
// water inland onto a land tile.
float coastalFoam(vec2 worldXZ, float t, float shoreDist) {
    float n = valueNoise(worldXZ * (3.0 / hexSize) + vec2(0.0, t * 0.2));
    n = 0.5 * n + 0.5 * valueNoise(worldXZ * (7.0 / hexSize) - vec2(t * 0.15, 0.0));
    float distort = (n - 0.5) * foamDistortion;

    float phase = fract(shoreDist * foamCount + t * foamSpeed + distort * 2.0);
    float halfW = clamp(foamWidth, 0.02, 1.0) * 0.5;
    float band = smoothstep(halfW, halfW * 0.35, abs(phase - 0.5));
    float fade = 1.0 - smoothstep(foamRange * 0.35, max(foamRange, 0.001), shoreDist);
    band *= fade * (0.55 + 0.45 * n);

    float edge = smoothstep(0.12, 0.0, shoreDist + distort * 0.35);

    return clamp(edge + band, 0.0, 1.0) * foamOpacity;
}

void main() {
    // Unseen: replace the tile outright with the war-fog texture, skipping
    // every other layer/lighting/grid computation below. vFogUV is computed
    // from *world* position (see terrain.vertex.ts), so one repeat of the
    // texture spans several tiles and flows seamlessly across every fogged
    // hex - no per-tile square-texture-in-a-hex seams.
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    vec4 texColor = texture2D(map, vTexCoord);

    // One noise evaluation shared by all 6 blendEdge calls: a coarse octave
    // meanders the border position, a finer one modulates its strength into
    // patches (like the river banks' bankPatchiness below).
    float blendNoise = valueNoise(vWorldXZ * (3.0 / hexSize));
    float blendBend = (blendNoise - 0.5) * landBlendCurvature * 0.5;
    float blendPatch = clamp(0.6 + 0.8 * valueNoise(vWorldXZ * (8.0 / hexSize)), 0.0, 1.0);

    texColor = blendEdge(texColor, vNeighborsA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x, blendBend, blendPatch); // SE
    texColor = blendEdge(texColor, vNeighborsA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y, blendBend, blendPatch); // S
    texColor = blendEdge(texColor, vNeighborsA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z, blendBend, blendPatch); // SW
    texColor = blendEdge(texColor, vNeighborsB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x, blendBend, blendPatch); // NW
    texColor = blendEdge(texColor, vNeighborsB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y, blendBend, blendPatch); // N
    texColor = blendEdge(texColor, vNeighborsB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z, blendBend, blendPatch); // NE

    // Curved coastline. coastField() is 1.0 exactly on the mesh edge shared
    // with a water tile; bending it with static world-space noise moves the
    // *visual* waterline off that straight edge. The bend is ONE-SIDED
    // (inland only, noise >= 0): the whole visible waterline - sand band,
    // painted sea, foam strip - then lives on the land tile, drawn from this
    // single tile's own field, so it is continuous by construction. An
    // earlier two-sided version also painted sand on the water layer where
    // the line receded seaward, but the water tiles' per-tile shore fields
    // disagree near shared corners (each tile only knows its own neighbors),
    // which cut visible gaps/straight seams into the painted sand - see
    // water.fragment.ts, whose foam now just softly continues this line.
    vec2 coastFK = coastField();
    float coast = coastFK.x;
    if (coast > 0.0) {
        float cn = valueNoise(vWorldXZ * (1.3 / hexSize));
        cn = 0.6 * cn + 0.4 * valueNoise(vWorldXZ * (3.2 / hexSize));
        float f = coast + cn * coastCurvature * 0.5;

        // sand beach: replaces the old vBeachT vertex blend with the same
        // smoothstep keyed to the bent per-pixel field.
        float e0Beach = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
        float beachT = smoothstep(e0Beach, 1.0, f);
        if (beachT > 0.0) {
            vec4 sandColor = texture2D(map, cellIndexToUV(sandAtlasIndex));
            texColor = mix(texColor, sandColor, beachT);
        }

        // painted sea past the bent waterline. Color-matched to what the
        // water layer shows right across the mesh seam: the base color is
        // the dominant water neighbor's own (deep for a sea tile, shallow
        // for coastal - coastFK.y), and its shore-distance field at the same
        // physical point equals (2 - f) in this side's units (both fields
        // are 1.0 on the mesh edge and bent by the same noise), so feeding
        // that through the water shader's own shore lightening (base
        // brightened towards white, see water.fragment.ts) makes the strip
        // continue the water tile's color seamlessly - no darker band, no
        // lighter ring around deep-sea islands. A mean-neutral ripple (like
        // the river water below) keeps it alive without shifting brightness.
        float seaT = smoothstep(1.0, 1.04, f);
        if (seaT > 0.0) {
            vec3 seaBase = coastFK.y < 1.5 ? seaColorDeep : seaColorShallow;
            float shoreT = smoothstep(e0Beach, 1.0, 2.0 - f);
            vec3 shoreCol = mix(seaColorShallow, vec3(1.0), 0.5);
            vec3 seaColor = mix(seaBase, shoreCol, shoreT);
            float t = uTime;
            float ripple = valueNoise(vWorldXZ * (6.0 / hexSize) + vec2(t * 0.35, t * 0.2));
            ripple = 0.5 * ripple + 0.5 * valueNoise(vWorldXZ * (12.0 / hexSize) - vec2(t * 0.25, t * 0.4));
            seaColor *= 0.85 + 0.3 * ripple;
            texColor = mix(texColor, vec4(seaColor, 1.0), seaT);

            if (foamEnabled > 0.5) {
                texColor.rgb = mix(texColor.rgb, foamColor, coastalFoam(vWorldXZ, uTime, max(f - 1.0, 0.0)) * seaT);
            }
        }

        if (foamEnabled < 0.5) {
            // a thin non-animated lapping-foam strip for maps that disable
            // coastal wave bands but still want the curved waterline readable.
            float foamStrip = smoothstep(0.98, 1.005, f) - smoothstep(1.04, 1.1, f);
            texColor.rgb = mix(texColor.rgb, vec3(1.0), clamp(foamStrip, 0.0, 1.0) * 0.35);
        }
    }

    // Mountain snowcap: tint the rock towards snow near the peak (vElevation
    // is 0 on every non-mountain tile). The relief itself comes from the
    // vertex stage's displacement + normals; this is just the color accent.
    if (vElevation > 0.0) {
        float snowT = smoothstep(0.55, 0.95, vElevation);
        texColor.rgb = mix(texColor.rgb, vec3(0.93, 0.95, 0.98), snowT * 0.85);
    }

    // Rivers/lakes (see the uniform block's comment above). Drawn before
    // lighting/fog/grid so all three keep applying to them unchanged; the
    // Unseen fog short-circuit at the top already hides them entirely.
    if (vRiverEdges > -0.5 || vLakeNeighborEdges > 0.5) {
        // Round the mask back to an exact integer: every vertex of an instance
        // carries the same riverEdges value, but varying interpolation is not
        // exact - a mask of 34.0 can arrive as 33.99997 on some fragments, and
        // floor(mask / 2^i) then decodes *different connection bits on
        // neighboring pixels* (pixel-level water/bank garbage along the river).
        float mask = floor(vRiverEdges + 0.5);
        float apothem = hexSize * 0.8660254;

        // static two-octave world-space noise bends the waterline: the curved,
        // "hand-drawn" banks instead of ruler-straight strips/hex-edge rims.
        float bend = valueNoise(vWorldXZ * (2.2 / hexSize));
        bend = 0.6 * bend + 0.4 * valueNoise(vWorldXZ * (5.0 / hexSize));
        float bendOff = (bend - 0.5) * riverCurvature * 0.6;

        float waterT = 0.0; // 1 = water surface
        float bankT = 0.0;  // 1 = inside the vegetation band (water overdraws its inner part)
        float depthT = 0.0; // 0 shallow (waterline) .. 1 deep (channel center / lake body)
        float seaMouthT = 0.0;

        if (mask >= 2048.0) {
            // Lake tiles are full water. The curved green shoreline is painted
            // by neighboring land tiles (like sea/coast), which gives the lake
            // more room and avoids a straight hex-shaped rim on the lake tile.
            float openMask = floor((mask - 4096.0) / 64.0);
            float channelMask = mask - 4096.0 - openMask * 64.0;
            waterT = 1.0;
            depthT = 1.0;
        } else if (mask >= 0.0) {
            // river: water along the channel centerline segments
            float d = riverChannelDist(vLocal, mask, apothem) / hexSize + bendOff;
            bankT = 1.0 - smoothstep(riverWidth + riverBankWidth * 0.35, riverWidth + riverBankWidth, d);
            waterT = 1.0 - smoothstep(riverWidth - 0.04, riverWidth, d);
            depthT = 1.0 - smoothstep(0.0, riverWidth, d);

            float seaMouthMask = floor(vRiverSeaMouthEdges + 0.5);
            float lakeMouthMask = floor(vRiverLakeMouthEdges + 0.5);
            vec4 seaMouth = riverMouthShape(vLocal, seaMouthMask, apothem, bendOff);
            vec4 lakeMouth = riverMouthShape(vLocal, lakeMouthMask, apothem, bendOff);
            bankT = max(bankT, max(seaMouth.y, lakeMouth.y));
            waterT = max(waterT, max(seaMouth.x, lakeMouth.x));
            depthT = max(depthT, max(seaMouth.z, lakeMouth.z));
            seaMouthT = smoothstep(0.45, 1.0, seaMouth.w);
        }

        float lakeNeighborMask = floor(vLakeNeighborEdges + 0.5);
        if (mask < 2048.0 && lakeNeighborMask > 0.5) {
            float lakeField = lakeNeighborField(lakeNeighborMask);
            if (lakeField > 0.0) {
                float lakeNoise = valueNoise(vWorldXZ * (1.3 / hexSize));
                lakeNoise = 0.6 * lakeNoise + 0.4 * valueNoise(vWorldXZ * (3.2 / hexSize));
                float fLake = lakeField + lakeNoise * coastCurvature * 0.5;
                float s0Lake = 1.0 - clamp(lakeShoreWidth, 0.001, 1.0);
                float lakeBankT = smoothstep(s0Lake, 1.0, fLake);
                float lakeWaterT = smoothstep(1.0, 1.04, fLake);
                bankT = max(bankT, lakeBankT);
                waterT = max(waterT, lakeWaterT);
                depthT = max(depthT, smoothstep(1.0, 1.2, fLake));
            }
        }

        // bank strip first: a light vegetation band reaching past the
        // waterline, its own strength varied by a finer noise so it reads as
        // patchy growth instead of a uniform outline. The water below
        // overdraws its inner part, leaving the band hugging the waterline.
        float bankPatchiness = 0.55 + 0.45 * valueNoise(vWorldXZ * (8.0 / hexSize));
        texColor = mix(texColor, vec4(riverBankColor, 1.0), bankT * bankPatchiness);

        // water: shallow color at the waterline deepening inward, brightness
        // rippled by two octaves of scrolling noise (uTime) - non-directional
        // on purpose, since a junction/lake has no single flow direction.
        if (waterT > 0.0) {
            vec3 waterColor = mix(riverColorShallow, riverColorDeep, depthT);
            waterColor = mix(waterColor, seaColorShallow, seaMouthT);

            float t = uTime * riverFlowSpeed;
            float ripple = valueNoise(vWorldXZ * (6.0 / hexSize) + vec2(t * 0.35, t * 0.2));
            ripple = 0.5 * ripple + 0.5 * valueNoise(vWorldXZ * (12.0 / hexSize) - vec2(t * 0.25, t * 0.4));
            waterColor *= 0.85 + 0.3 * ripple;

            texColor = mix(texColor, vec4(waterColor, 1.0), waterT);
        }
    }

    vec3 normal = normalize(vNormal);
    float lambertian = max(dot(normalize(lightDir), normal), 0.0);
    vec3 color = lightAmbient * texColor.rgb + lambertian * lightDiffuse * texColor.rgb;

    // Explored (previously seen, currently outside every unit's view range):
    // keep every feature visible, just darker - the "remembered" Civ-style look.
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;
