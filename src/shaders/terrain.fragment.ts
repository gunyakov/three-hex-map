export const TERRAIN_FRAGMENT_SHADER = `
precision mediump float;

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

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);

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
