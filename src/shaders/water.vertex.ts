export const WATER_VERTEX_SHADER = `
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)
uniform float uTime;   // seconds, animates the waves
uniform float waterLevel; // rest height of the water plane (usually negative, below land)

// Wave shape - see waveHeightAndSlope() below.
uniform float waveAmplitude;
uniform float waveFrequency;
uniform float waveSpeed;

// Beach: waterLevel is where the water plane sits, waveAmplitude/etc animate it -
// but near an actual coastline (a land-adjacent edge/corner, see coastalFactor()
// below) the water settles down to a flat shore instead of waving right up to
// the sand. beachWidth is the *total* transition width shared with the land
// layer's own mirrored slope (see terrain.vertex.ts) - each side only covers
// half of it. waterCornerRounding (0..1) controls how much a corner shared by
// two land-adjacent edges rounds off instead of meeting at a sharp point.
uniform float beachWidth;
uniform float waterCornerRounding;
uniform float fogTextureSize; // world units one repeat of the fog texture spans (see terrain.vertex.ts)

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;
attribute vec3 style;        // x = atlas cell index (unused here), y = modifiers, z = priority (0 = sea, 1 = coastal)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying vec2 vUV;
varying float vBorder;
varying float vPriority;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA; // SE, S, SW
varying vec3 vEdgeFactorsB; // NW, N, NE
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vBeachT; // 0 = open water, 1 = right at the shore (see terrain.fragment.ts's vBeachT)
varying float vShoreT; // like vBeachT but unsquashed by beachWidth: raw 0 (tile center) .. 1 (land edge) coastal distance, 0 on tiles with no land neighbor - drives the foam bands in water.fragment.ts
varying float vFogState;
varying vec2 vFogUV; // world-space fog texture coords, continuous across tiles

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

const float GOLDEN_ANGLE = 2.399963; // ~137.5 deg, keeps summed waves from lining up

// Sum of sine waves (NVIDIA GPU Gems ocean approach): height is a sum of sines
// of the world-space position; the *derivative* of a sine is a cosine of the
// same phase, so the surface normal's slope can be computed analytically in
// the same loop instead of sampling a normal map.
// Returns (height, slope.x, slope.z).
vec3 waveHeightAndSlope(vec2 worldXZ, float t) {
    float height = 0.0;
    vec2 slope = vec2(0.0);

    float amp = waveAmplitude;
    float freq = waveFrequency;
    float speed = waveSpeed;
    float dirAngle = 0.4;

    for (int i = 0; i < 4; i++) {
        vec2 dir = vec2(cos(dirAngle), sin(dirAngle));
        float phase = dot(dir, worldXZ) * freq + t * speed;

        height += amp * sin(phase);
        slope += dir * (amp * freq * cos(phase));

        amp *= 0.55;
        freq *= 1.8;
        speed *= 1.3;
        dirAngle += GOLDEN_ANGLE;
    }

    return vec3(height, slope.x, slope.y);
}

// Only an edge whose neighbor is real land (kind == 0, not sea/coastal/off-map)
// counts as "coastal" - mirrors the land shader's opposite check (kind >= 1.0).
float isLandKind(float kind) {
    return (kind > -0.5 && kind < 0.5) ? 1.0 : 0.0;
}

// Rounds off a corner shared by two coastal edges instead of leaving a sharp
// wedge where their two straight falloffs meet. Both dA/dB are already
// clamped to >= 0 (distance past the tile's own center towards that edge), so
// at the actual hex corner both equal ~1 regardless of which edge you ask -
// length() there extends the reach slightly beyond either edge alone, forming
// a rounded arc; mix() lets waterCornerRounding dial that between "sharp"
// (plain max, same as a single straight edge) and "fully rounded".
// Returns a negative sentinel if either edge isn't itself coastal, so a
// corner with only one land-adjacent edge never gets any rounding treatment.
float roundedCorner(float isLandA, float isLandB, float dA, float dB) {
    if (isLandA < 0.5 || isLandB < 0.5) return -1.0;
    float sharp = max(dA, dB);
    float rounded = length(vec2(dA, dB));
    return mix(sharp, rounded, clamp(waterCornerRounding, 0.0, 1.0));
}

void main() {
    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;

    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;

    float isLandSE = isLandKind(neighborsKindA.x);
    float isLandS  = isLandKind(neighborsKindA.y);
    float isLandSW = isLandKind(neighborsKindA.z);
    float isLandNW = isLandKind(neighborsKindB.x);
    float isLandN  = isLandKind(neighborsKindB.y);
    float isLandNE = isLandKind(neighborsKindB.z);

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    // straight per-edge contribution: a single coastal edge (water on both
    // sides of it around the tile) never triggers the corner rounding below.
    float coastal = -1.0;
    coastal = max(coastal, isLandSE > 0.5 ? vEdgeFactorsA.x : -1.0);
    coastal = max(coastal, isLandS  > 0.5 ? vEdgeFactorsA.y : -1.0);
    coastal = max(coastal, isLandSW > 0.5 ? vEdgeFactorsA.z : -1.0);
    coastal = max(coastal, isLandNW > 0.5 ? vEdgeFactorsB.x : -1.0);
    coastal = max(coastal, isLandN  > 0.5 ? vEdgeFactorsB.y : -1.0);
    coastal = max(coastal, isLandNE > 0.5 ? vEdgeFactorsB.z : -1.0);

    // corner rounding, only where two *adjacent* edges are both coastal.
    coastal = max(coastal, roundedCorner(isLandSE, isLandS,  dSE, dS));
    coastal = max(coastal, roundedCorner(isLandS,  isLandSW, dS,  dSW));
    coastal = max(coastal, roundedCorner(isLandSW, isLandNW, dSW, dNW));
    coastal = max(coastal, roundedCorner(isLandNW, isLandN,  dNW, dN));
    coastal = max(coastal, roundedCorner(isLandN,  isLandNE, dN,  dNE));
    coastal = max(coastal, roundedCorner(isLandNE, isLandSE, dNE, dSE));

    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float beachT = smoothstep(e0, 1.0, clamp(coastal, 0.0, 1.0));

    vec2 worldXZ = offset + position.xz;
    vec3 hs = waveHeightAndSlope(worldXZ, uTime);

    // Unseen (fog of war, see FogOfWar.ts): freeze the waves AND raise the
    // tile to land's rest height (y=0). A tile that kept animating - or even
    // just sat visibly lower than its land neighbors - would still read as
    // "there is water here" through fog that is supposed to hide everything.
    float fogVisible = fogState < 0.5 ? 0.0 : 1.0;

    // damp the wave out towards the shore (beachT -> 1) instead of a purely
    // radial falloff - a radial one shrinks towards *every* corner regardless
    // of what's actually next door, flattening/"rounding" corners between
    // three water tiles too where nothing should change at all.
    float damp = (1.0 - beachT) * fogVisible;
    float waveY = hs.x * damp;
    vec2 slope = hs.yz * damp;

    // Water rises *half* the way up towards land's own rest height (0) as it
    // nears the shore - land sinks the other half towards waterLevel (see
    // terrain.vertex.ts's sinkY) - so the total drop between the two tiles is
    // evenly split instead of the water side staying flat at waterLevel while
    // land does all the work alone. waterLevel is negative, so -waterLevel*0.5
    // is a positive lift.
    float riseY = beachT * (-waterLevel * 0.5);

    vec3 pos = vec3(offset.x + position.x, mix(0.0, waterLevel + waveY + riseY, fogVisible), offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));
    vWorldPos = pos;

    // Rim distance for the grid line - see terrain.vertex.ts's rimFactor
    // comment: radial distance from center is wrong for a hexagon (it dips to
    // the apothem at edge midpoints instead of staying 1.0 along the whole
    // edge), which fragments the grid line into corner-only blobs once the
    // geometry is subdivided. The edge factors already computed above are the
    // correct, constant-along-the-edge metric.
    float rimFactor = max(max(max(vEdgeFactorsA.x, vEdgeFactorsA.y), max(vEdgeFactorsA.z, vEdgeFactorsB.x)), max(vEdgeFactorsB.y, vEdgeFactorsB.z));

    vUV = uv;
    vBorder = clamp(rimFactor, 0.0, 1.0);
    vPriority = style.z;
    vBeachT = beachT;
    vShoreT = clamp(coastal, 0.0, 1.0);
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;
    vFogState = fogState;
    // Same upright-for-the-camera mapping as terrain.vertex.ts's vFogUV -
    // u along world -Z, v along world -X - so land and water sample the fog
    // texture identically and it stays continuous across the two layers.
    vFogUV = vec2(-worldXZ.y, -worldXZ.x) / fogTextureSize;
}
`;
