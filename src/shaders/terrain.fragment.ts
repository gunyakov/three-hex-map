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
varying vec2 vLocal;
varying vec2 vWorldXZ;

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
vec4 blendEdge(vec4 inputColor, float neighborTerrain, float neighborPriority, float factor) {
    if (neighborTerrain < 0.0 || neighborTerrain == vTerrain) return inputColor;
    if (neighborPriority <= vPriority) return inputColor;

    vec2 otherUV = cellIndexToUV(neighborTerrain);
    vec4 neighborColor = texture2D(map, otherUV);

    float e0 = 1.0 - clamp(landBlendWidth, 0.001, 1.0);
    float t = smoothstep(e0, 1.0, factor);
    return mix(inputColor, neighborColor, t);
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

    texColor = blendEdge(texColor, vNeighborsA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x); // SE
    texColor = blendEdge(texColor, vNeighborsA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y); // S
    texColor = blendEdge(texColor, vNeighborsA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z); // SW
    texColor = blendEdge(texColor, vNeighborsB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x); // NW
    texColor = blendEdge(texColor, vNeighborsB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y); // N
    texColor = blendEdge(texColor, vNeighborsB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z); // NE

    // Beach: fade to sand near any edge that slopes down towards water (see
    // vBeachT / neighborsKindA/B in terrain.vertex.ts) - this is what actually
    // reads as a "shore" once the tile sinks towards waterLevel there, instead
    // of a flat 2D color blend against the water tile's own color.
    if (vBeachT > 0.0) {
        vec4 sandColor = texture2D(map, cellIndexToUV(sandAtlasIndex));
        texColor = mix(texColor, sandColor, vBeachT);
    }

    // Rivers/lakes (see the uniform block's comment above). Drawn before
    // lighting/fog/grid so all three keep applying to them unchanged; the
    // Unseen fog short-circuit at the top already hides them entirely.
    if (vRiverEdges > -0.5) {
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

        if (mask >= 2048.0) {
            // lake: water fills the hex except a grass rim inset from every
            // *shored* edge; edges to river tiles keep the rim but get a
            // channel-shaped opening so the river visibly flows in/out. The
            // shared segment geometry makes that opening line up exactly with
            // the river neighbor's own channel at the border.
            float openMask = floor((mask - 4096.0) / 64.0);
            float channelMask = mask - 4096.0 - openMask * 64.0;
            float s0 = 1.0 - lakeShoreWidth;
            float shore = lakeShore(openMask, vEdgeFactorsA, vEdgeFactorsB) + bendOff;
            bankT = 1.0 - smoothstep(s0 + riverBankWidth * 0.35, s0 + riverBankWidth, shore);
            waterT = 1.0 - smoothstep(s0 - 0.04, s0, shore);
            // short shallow-to-deep ramp: most of the body reads uniformly
            // deep, so the river-channel openings (depthT 1 at their
            // centerline) don't draw visibly darker strips across the lake.
            depthT = 1.0 - smoothstep(s0 - 0.22, s0, shore);
            if (channelMask > 0.5) {
                float dChan = riverChannelDist(vLocal, channelMask, apothem) / hexSize + bendOff;
                bankT = max(bankT, 1.0 - smoothstep(riverWidth + riverBankWidth * 0.35, riverWidth + riverBankWidth, dChan));
                waterT = max(waterT, 1.0 - smoothstep(riverWidth - 0.04, riverWidth, dChan));
                depthT = max(depthT, 1.0 - smoothstep(0.0, riverWidth, dChan));
            }
        } else {
            // river: water along the channel centerline segments
            float d = riverChannelDist(vLocal, mask, apothem) / hexSize + bendOff;
            bankT = 1.0 - smoothstep(riverWidth + riverBankWidth * 0.35, riverWidth + riverBankWidth, d);
            waterT = 1.0 - smoothstep(riverWidth - 0.04, riverWidth, d);
            depthT = 1.0 - smoothstep(0.0, riverWidth, d);
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
