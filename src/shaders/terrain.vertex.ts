export const TERRAIN_VERTEX_SHADER = `
precision mediump float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// (atlas width, atlas height, cell size, cell spacing)
uniform vec4 textureAtlasMeta;
uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)

// Beach slope towards water neighbors (see neighborsKindA/B below). waterLevel
// is where the water plane sits (see water.vertex.ts) - a coastal land tile's
// rim sinks to meet it instead of staying flat and only color-blending in 2D.
// beachWidth is the fraction of the tile's radius over which the slope happens.
uniform float waterLevel;
uniform float beachWidth;
uniform float sandAtlasIndex;

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;       // world-space (x,z) offset of this tile instance
attribute vec3 style;        // x = atlas cell index, y = modifier bitmask (reserved for hill/etc.), z = edge-blend priority
attribute vec3 neighborsA;   // atlas cell index of SE/S/SW neighbor (-1 = none)
attribute vec3 neighborsB;   // atlas cell index of NW/N/NE neighbor (-1 = none)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 shore
attribute vec3 neighborsKindB; // NW/N/NE

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
varying vec3 vEdgeFactorsA; // SE, S, SW
varying vec3 vEdgeFactorsB; // NW, N, NE
varying vec3 vNormal;
varying float vBeachT; // 0 = normal land color, 1 = fully sand (see terrain.fragment.ts)

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

vec2 cellIndexToUV(float idx) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    float cols = atlasWidth / cellSize;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);

    return vec2(x / cols + uv.x / cols, 1.0 - (y / rows + (1.0 - uv.y) / rows));
}

// Tracks the strongest "closeness to a water-adjacent edge" (see
// vEdgeFactorsA/B) together with the direction it came from, so both the
// height (sink towards waterLevel) and its slope (for lighting normals) can be
// derived from the same single dominant edge.
vec3 strongestWaterEdge(vec3 best, float kind, float factor, vec2 dir) {
    if (kind >= 1.0 && factor > best.x) return vec3(factor, dir);
    return best;
}

void main() {
    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;

    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;

    vec3 best = vec3(0.0); // (edgeFactor, dir.x, dir.y)
    best = strongestWaterEdge(best, neighborsKindA.x, vEdgeFactorsA.x, DIR_SE);
    best = strongestWaterEdge(best, neighborsKindA.y, vEdgeFactorsA.y, DIR_S);
    best = strongestWaterEdge(best, neighborsKindA.z, vEdgeFactorsA.z, DIR_SW);
    best = strongestWaterEdge(best, neighborsKindB.x, vEdgeFactorsB.x, DIR_NW);
    best = strongestWaterEdge(best, neighborsKindB.y, vEdgeFactorsB.y, DIR_N);
    best = strongestWaterEdge(best, neighborsKindB.z, vEdgeFactorsB.z, DIR_NE);

    float waterEdge = clamp(best.x, 0.0, 1.0);
    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0);
    float beachT = smoothstep(e0, 1.0, waterEdge);

    // overshoot slightly past waterLevel: the water layer's own rim rests
    // almost exactly at waterLevel too (its wave damps out towards its edge -
    // see water.vertex.ts), so without this gap the two meshes would be
    // near-coincident at the shore and z-fight (flickery dark patches). Sand
    // continuing a bit under shallow water is also how a real beach looks.
    float sinkY = beachT * waterLevel * 1.2;
    vec3 pos = vec3(offset.x + position.x, position.y + sinkY, offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // analytic slope of sinkY w.r.t. local (x,z), via the chain rule through
    // smoothstep, for lighting - see water.vertex.ts for the same idea applied
    // to waves. Only the single dominant edge direction is considered, which is
    // exact away from corners and a reasonable approximation right at them.
    float xN = clamp((waterEdge - e0) / (1.0 - e0), 0.0, 1.0);
    float dSmooth = waterEdge > 0.0 ? 6.0 * xN * (1.0 - xN) / (1.0 - e0) : 0.0;
    vec2 slope = waterLevel * 1.2 * dSmooth * (best.yz / apothem);
    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));

    vUV = uv;
    vBorder = clamp(length(local) / hexSize, 0.0, 1.0);
    vTerrain = style.x;
    vModifiers = style.y;
    vPriority = style.z;
    vBeachT = beachT;
    vTexCoord = cellIndexToUV(style.x);
    vNeighborsA = neighborsA;
    vNeighborsB = neighborsB;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
}
`;
