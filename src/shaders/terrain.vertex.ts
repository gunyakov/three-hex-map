export const TERRAIN_VERTEX_SHADER = `
// highp to match terrain.fragment.ts (see its precision comment) - vWorldXZ /
// vLocal feed the river noise there, and varyings shouldn't lose precision on
// the vertex side of the interpolation.
precision highp float;

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

// Mountains (Land.mountain tiles - style.x == mountainAtlasIndex): the whole
// tile rises to a craggy peak. The height is a pure function of the tile-local
// position (mountainHeightAt below) so the lighting normal can be derived from
// it by finite differences - an analytic chain rule through the noise octaves
// would be far messier than two extra evaluations. mountainHeight is the peak
// height in world units.
uniform float mountainAtlasIndex;
uniform float mountainHeight;

// Rivers/lakes (tiles with the "river"/"lake" modifier - see helpers/rivers.ts
// and terrain.fragment.ts). The vertex stage only carves the bed: a smooth
// sink towards -riverDepth around a river's channel centerline / across a
// lake's body. Widths are fractions of the tile radius (hexSize); the sink
// reaches slightly past the painted waterline so the fragment stage's
// noise-bent banks always lie on sloped ground.
uniform float riverWidth;
uniform float riverBankWidth;
uniform float riverDepth;
uniform float lakeShoreWidth; // grass rim inset from a lake's shored edges

// World units one repeat of the war-fog texture spans. Fog UVs are computed
// from world position (not per-tile local UVs) so one copy of the texture
// flows continuously across every fogged tile - the image tiles seamlessly on
// each side, so neighboring repeats merge with no visible hex-shaped seams.
uniform float fogTextureSize;

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;       // world-space (x,z) offset of this tile instance
attribute vec3 style;        // x = atlas cell index, y = modifier bitmask (reserved for hill/etc.), z = edge-blend priority
attribute vec3 neighborsA;   // atlas cell index of SE/S/SW neighbor (-1 = none)
attribute vec3 neighborsB;   // atlas cell index of NW/N/NE neighbor (-1 = none)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
// -1 = no water; 0..63 = river (connected-edge bitmask, bit order SE,S,SW,NW,
// N,NE); 4096 + openMask*64 + channelMask = lake - see helpers/rivers.ts's
// waterEdgeValue() for the authoritative encoding.
attribute float riverEdges;
attribute float riverSeaMouthEdges;
attribute float riverLakeMouthEdges;
attribute float lakeNeighborEdges;
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts

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
varying float vFogState;
varying vec2 vFogUV; // world-space fog texture coords, continuous across tiles
varying float vRiverEdges; // riverEdges passed through (flat per tile - every vertex of an instance carries the same value)
varying float vRiverSeaMouthEdges;
varying float vRiverLakeMouthEdges;
varying float vLakeNeighborEdges;
varying vec2 vLocal;       // tile-local (x,z), for the fragment stage's channel distance
varying vec2 vWorldXZ;     // world (x,z), for the fragment stage's world-space bank/ripple noise
varying vec3 vNeighborsKindA; // passed through for the fragment stage's per-pixel curved coastline
varying vec3 vNeighborsKindB;
varying float vElevation;  // normalized mountain elevation (0 flat .. ~1 peak), for snowcap tinting

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

// Same cheap value noise as the fragment stages - the mountain relief has to
// be world-space so adjacent mountain tiles' crags line up across the shared
// edge exactly like the river banks do.
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

// Saddle corner taper - a ridge saddle's height at an edge CORNER must agree
// across all three tiles meeting there, or the surfaces crack open (visible
// as background-colored triangular holes). If the corner's third tile is a
// mountain too, all three raise it to the same saddle height (no taper); if
// it isn't, the saddle fades to 0 towards that corner - the flat third tile
// stays at 0 there, and both mountain tiles taper symmetrically (the
// adjacent-edge factor measures the same corner distance from either side).
float saddleTaper(float adjIsMountain, float adjFactor) {
    return adjIsMountain > 0.5 ? 1.0 : 1.0 - smoothstep(0.6, 1.0, adjFactor);
}

// Normalized mountain height (0..~1.2) at a tile-local point p. Three parts:
//  - a central peak: (1 - rim)^1.2, 1 at the tile center, 0 on the rim;
//  - ridge saddles: towards every edge whose neighbor is also a mountain, the
//    height only falls to 0.55 at the shared edge instead of 0. Both tiles
//    compute the same 0.55 * edgeFactor there (each side's factor is 1.0 on
//    the edge), so adjacent mountains connect into a continuous ridgeline;
//  - two octaves of world-space noise multiplying the whole profile into
//    irregular crags (world-space: continuous across the shared edges too).
// Kept a pure function of p so main() can finite-difference it for normals.
float mountainHeightAt(vec2 p) {
    float apothem = hexSize * 0.8660254;
    vec3 efA = vec3(dot(p, DIR_SE), dot(p, DIR_S), dot(p, DIR_SW)) / apothem;
    vec3 efB = vec3(dot(p, DIR_NW), dot(p, DIR_N), dot(p, DIR_NE)) / apothem;
    float rim = max(max(max(efA.x, efA.y), max(efA.z, efB.x)), max(efB.y, efB.z));
    float h = pow(clamp(1.0 - rim, 0.0, 1.0), 1.2);

    float mSE = abs(neighborsA.x - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mS  = abs(neighborsA.y - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mSW = abs(neighborsA.z - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mNW = abs(neighborsB.x - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mN  = abs(neighborsB.y - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mNE = abs(neighborsB.z - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;

    // ring adjacency: SE-S-SW-NW-N-NE-SE (see the DIR_* constants' angles)
    float ridge = 0.0;
    if (mSE > 0.5) ridge = max(ridge, efA.x * saddleTaper(mNE, efB.z) * saddleTaper(mS,  efA.y));
    if (mS  > 0.5) ridge = max(ridge, efA.y * saddleTaper(mSE, efA.x) * saddleTaper(mSW, efA.z));
    if (mSW > 0.5) ridge = max(ridge, efA.z * saddleTaper(mS,  efA.y) * saddleTaper(mNW, efB.x));
    if (mNW > 0.5) ridge = max(ridge, efB.x * saddleTaper(mSW, efA.z) * saddleTaper(mN,  efB.y));
    if (mN  > 0.5) ridge = max(ridge, efB.y * saddleTaper(mNW, efB.x) * saddleTaper(mNE, efB.z));
    if (mNE > 0.5) ridge = max(ridge, efB.z * saddleTaper(mN,  efB.y) * saddleTaper(mSE, efA.x));
    h = max(h, clamp(ridge, 0.0, 1.0) * 0.55);

    // Shore flattening - a coastal mountain still gets its beach. Done here
    // per water-adjacent direction (not by multiplying with the vertex's own
    // beachT in main()) so it stays a symmetric function of the corner
    // distance: a mountain NEIGHBOR at the shared corner of a water tile
    // computes the same falloff from its own side, keeping the saddle heights
    // crack-free (same reasoning as saddleTaper above - the water tile at
    // such a corner is a direct neighbor of both mountain tiles).
    if (neighborsKindA.x >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efA.x);
    if (neighborsKindA.y >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efA.y);
    if (neighborsKindA.z >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efA.z);
    if (neighborsKindB.x >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efB.x);
    if (neighborsKindB.y >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efB.y);
    if (neighborsKindB.z >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efB.z);

    vec2 w = offset + p;
    float n = valueNoise(w * (1.6 / hexSize));
    n = 0.65 * n + 0.35 * valueNoise(w * (4.0 / hexSize));
    return h * (0.72 + 1.1 * (n - 0.5));
}

// Tracks the strongest "closeness to a water-adjacent edge" (see
// vEdgeFactorsA/B) together with the direction it came from, so both the
// height (sink towards waterLevel) and its slope (for lighting normals) can be
// derived from the same single dominant edge.
vec3 strongestWaterEdge(vec3 best, float kind, float factor, vec2 dir) {
    if (kind >= 1.0 && factor > best.x) return vec3(factor, dir);
    return best;
}

// Distance from a tile-local point to the segment running from the hex center
// to the midpoint of the edge in direction dir (at the apothem) - one straight
// piece of the river channel's centerline.
float riverSegDist(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return length(p - dir * t);
}

// Distance to the river channel centerline: the min over every *connected*
// edge's center-to-edge-midpoint segment (bit i of mask, order SE,S,SW,NW,N,NE
// - decoded with mod/floor, GLSL ES 1.0 has no bitwise ops). A mask of 0 (a
// river tile with no connections) falls back to distance-to-center: a pond.
// Mirrors riverChannelDistance() in helpers/rivers.ts - keep the two in sync.
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

float riverMouthBedT(vec2 p, float mask, float apothem) {
    float bedT = 0.0;
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
        // 0.4 half-width = 0.8 full outlet width relative to one hex side.
        float mouthWidth = mix(riverWidth, 0.4, smoothstep(0.0, 1.0, seg.y));
        float d = seg.x / hexSize;
        bedT = max(bedT, 1.0 - smoothstep(mouthWidth * 0.5, mouthWidth + riverBankWidth, d));
    }
    return bedT;
}

float edgeFieldFromMask(float mask, vec3 efA, vec3 efB) {
    float f = 0.0;
    if (mod(floor(mask /  1.0), 2.0) > 0.5) f = max(f, efA.x);
    if (mod(floor(mask /  2.0), 2.0) > 0.5) f = max(f, efA.y);
    if (mod(floor(mask /  4.0), 2.0) > 0.5) f = max(f, efA.z);
    if (mod(floor(mask /  8.0), 2.0) > 0.5) f = max(f, efB.x);
    if (mod(floor(mask / 16.0), 2.0) > 0.5) f = max(f, efB.y);
    if (mod(floor(mask / 32.0), 2.0) > 0.5) f = max(f, efB.z);
    return f;
}

// Lake shore factor: how far this point sits towards the nearest *shored* edge
// (one NOT in openMask) - 1.0 exactly on such an edge, falling off towards the
// far side. 0 on a fully-open tile (lake interior: all water). Mirrors
// isInTileWater() in helpers/rivers.ts - keep the two in sync.
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

    // beachWidth is the *total* transition width shared with the water layer's
    // own mirrored slope (see water.vertex.ts) - each side only covers half of
    // it, so the two meet in the middle of the shared edge instead of the
    // whole transition being crammed into the land tile alone.
    float waterEdge = clamp(best.x, 0.0, 1.0);
    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float beachT = smoothstep(e0, 1.0, waterEdge);

    // Unseen (fog of war): keep the tile perfectly flat - a coastal land
    // tile's sunken beach rim would betray that water sits next door, which
    // the fog is supposed to hide.
    float fogVisible = fogState < 0.5 ? 0.0 : 1.0;

    // Land only sinks *half* the way down to waterLevel - the water layer
    // rises to meet it the other half (see water.vertex.ts's riseY), so the
    // two tiles' fall is evenly split instead of the whole drop happening on
    // the land side alone. The extra *1.2 nudges land slightly past that
    // midpoint (rather than exactly onto it) so the two meshes' edges don't
    // end up perfectly coincident and z-fight (flickery dark patches).
    float sinkY = beachT * (waterLevel * 0.5) * 1.2 * fogVisible;

    // River/lake bed: sink smoothly towards -riverDepth around a river's
    // channel centerline / across a lake's body. Undistorted distances only -
    // the fragment stage's noise-bent waterline stays within the carved area,
    // and per-vertex noise would be too coarse at this subdivision level
    // anyway. min() with the beach sink (both are <= 0) so a mouth next to
    // the sea takes the deeper of the two carves instead of stacking them.
    float riverSink = 0.0;
    if (riverEdges >= 0.0) {
        float bedT = 0.0;
        if (riverEdges >= 2048.0) {
            float openMask = floor((riverEdges - 4096.0) / 64.0);
            float channelMask = riverEdges - 4096.0 - openMask * 64.0;
            bedT = 1.0;
            if (channelMask > 0.5) {
                bedT = max(bedT, riverMouthBedT(local, channelMask, apothem));
            }
        } else {
            float dRiver = riverChannelDist(local, riverEdges, apothem) / hexSize;
            bedT = 1.0 - smoothstep(riverWidth * 0.5, riverWidth + riverBankWidth, dRiver);
            bedT = max(bedT, riverMouthBedT(local, floor(riverSeaMouthEdges + 0.5), apothem));
            bedT = max(bedT, riverMouthBedT(local, floor(riverLakeMouthEdges + 0.5), apothem));
        }
        riverSink = -riverDepth * bedT * fogVisible;
    }
    float lakeEdge = edgeFieldFromMask(floor(lakeNeighborEdges + 0.5), vEdgeFactorsA, vEdgeFactorsB);
    if (lakeEdge > 0.0) {
        float s0Lake = 1.0 - clamp(lakeShoreWidth, 0.001, 1.0);
        float lakeSinkT = smoothstep(s0Lake, 1.0, lakeEdge);
        riverSink = min(riverSink, -riverDepth * lakeSinkT * fogVisible);
    }
    sinkY = min(sinkY, riverSink);

    // Mountain elevation - flattened towards water edges inside
    // mountainHeightAt itself (so a coastal mountain still gets a shore),
    // gated to 0 on river/lake tiles (the carved bed wins - rivers stay
    // exactly as they were; don't combine the river/lake modifiers with
    // mountain tiles) and under unseen fog (same reasoning as the beach
    // sink above: relief betrays what's there).
    float raiseY = 0.0;
    vec2 mountainSlope = vec2(0.0);
    float elevation = 0.0;
    if (abs(style.x - mountainAtlasIndex) < 0.5) {
        float gate = fogVisible * (riverEdges >= 0.0 ? 0.0 : 1.0);
        if (gate > 0.0) {
            float eps = hexSize * 0.08;
            float h0 = mountainHeightAt(local);
            float hx = mountainHeightAt(local + vec2(eps, 0.0));
            float hz = mountainHeightAt(local + vec2(0.0, eps));
            elevation = h0 * gate;
            raiseY = elevation * mountainHeight;
            mountainSlope = vec2(hx - h0, hz - h0) / eps * mountainHeight * gate;
        }
    }

    vec3 pos = vec3(offset.x + position.x, position.y + sinkY + raiseY, offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // analytic slope of sinkY w.r.t. local (x,z), via the chain rule through
    // smoothstep, for lighting - see water.vertex.ts for the same idea applied
    // to waves. Only the single dominant edge direction is considered, which is
    // exact away from corners and a reasonable approximation right at them.
    // The mountain raise's finite-difference slope just adds on top.
    float xN = clamp((waterEdge - e0) / (1.0 - e0), 0.0, 1.0);
    float dSmooth = waterEdge > 0.0 ? 6.0 * xN * (1.0 - xN) / (1.0 - e0) : 0.0;
    vec2 slope = (waterLevel * 0.5) * 1.2 * dSmooth * (best.yz / apothem) * fogVisible + mountainSlope;
    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));

    // Rim distance for the grid line - NOT radial distance from center
    // (length(local)/hexSize): that only reaches 1.0 exactly at the 6 corners
    // and dips to ~0.866 (the apothem) at an edge's midpoint, since a hexagon's
    // boundary is 6 straight chords, not a circle. That went unnoticed while
    // this geometry had 0 subdivisions (both rim vertices of every wedge sat
    // exactly at a corner, so linear interpolation between two 1.0s stayed
    // 1.0 the whole edge) - once subdivided, the new mid-edge vertices' lower
    // radial value made the grid line threshold fail there, fragmenting a
    // continuous hex outline into isolated blobs at each corner. The edge
    // factors above are already exactly 1.0 along an entire straight edge
    // (not just at its endpoints), so reusing their max is the correct metric.
    float rimFactor = max(max(max(vEdgeFactorsA.x, vEdgeFactorsA.y), max(vEdgeFactorsA.z, vEdgeFactorsB.x)), max(vEdgeFactorsB.y, vEdgeFactorsB.z));

    vUV = uv;
    vBorder = clamp(rimFactor, 0.0, 1.0);
    vTerrain = style.x;
    vModifiers = style.y;
    vPriority = style.z;
    vBeachT = beachT;
    vTexCoord = cellIndexToUV(style.x);
    vNeighborsA = neighborsA;
    vNeighborsB = neighborsB;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;
    vElevation = elevation;
    vFogState = fogState;
    vRiverEdges = riverEdges;
    vRiverSeaMouthEdges = riverSeaMouthEdges;
    vRiverLakeMouthEdges = riverLakeMouthEdges;
    vLakeNeighborEdges = lakeNeighborEdges;
    vLocal = local;
    vWorldXZ = pos.xz;
    // Axes swapped/negated (not a plain pos.xz mapping) so the image reads
    // upright from this map's camera: the camera's azimuth is locked to ~90deg
    // (see HexMap's setupControls), which puts screen-right along world -Z and
    // screen-up along world -X - mapping u to -z and v to -x orients the
    // texture to the screen and keeps it un-mirrored when viewed from above.
    // Negation is free for a seamlessly wrapping texture (just a phase shift).
    vFogUV = vec2(-pos.z, -pos.x) / fogTextureSize;
}
`;
