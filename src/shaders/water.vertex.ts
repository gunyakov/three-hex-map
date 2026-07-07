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

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;
attribute vec3 style;        // x = atlas cell index (unused here), y = modifiers, z = priority (0 = sea, 1 = shore)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 shore
attribute vec3 neighborsKindB; // NW/N/NE

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

void main() {
    vec2 worldXZ = offset + position.xz;
    vec3 hs = waveHeightAndSlope(worldXZ, uTime);

    // fade the wave out towards each tile's own rim so it never overlaps the
    // land mesh's beach slope at the coastline (no continuous ocean across
    // tiles, but no cracks/z-fighting against the shore either).
    float rim = clamp(length(position.xz) / hexSize, 0.0, 1.0);
    float damp = 1.0 - smoothstep(0.6, 1.0, rim);

    float waveY = hs.x * damp;
    vec2 slope = hs.yz * damp;

    vec3 pos = vec3(offset.x + position.x, waterLevel + waveY, offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));
    vWorldPos = pos;

    vUV = uv;
    vBorder = clamp(length(position.xz) / hexSize, 0.0, 1.0);
    vPriority = style.z;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;

    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;
    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;
}
`;
