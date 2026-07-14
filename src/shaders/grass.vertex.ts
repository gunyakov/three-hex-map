export const GRASS_VERTEX_SHADER = `
precision mediump float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform float uTime;
uniform float windStrength;
uniform float windSpeed;

// Blade shape authored once in local space (see Grass.ts buildBladeGeometry):
// x spans [-0.5, 0.5] at the root and tapers to 0 at the tip, y is a plain
// [0, 1] height factor (0 = root, 1 = tip) - not a world-unit height, that's
// what the per-instance "scale" attribute is for.
attribute vec3 position;

attribute vec2 offset;  // world XZ position of this blade's root
attribute float angle;  // random Y rotation, radians - so blades don't all face the same way
attribute vec2 scale;   // x = width multiplier, y = height multiplier (world units)
attribute float phase;  // random wind phase offset, see wave below
attribute float shade;  // random per-blade brightness multiplier (clump variation)
attribute float fogState; // 0 = unseen (blade hidden), 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying float vHeightFactor;
varying float vShade;
varying float vFogState;

void main() {
    float heightFactor = position.y;
    vec3 p = vec3(position.x * scale.x, position.y * scale.y, position.z * scale.x);

    float s = sin(angle);
    float c = cos(angle);
    vec3 rotated = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);

    // Wind bends the blade towards its tip only (heightFactor^2 keeps the root
    // planted) - phase is offset by world position so a gust visibly travels
    // across the field instead of every blade swaying in lockstep.
    float wave = sin(uTime * windSpeed + phase + (offset.x + offset.y) * 0.015);
    float bend = wave * windStrength * heightFactor * heightFactor;
    rotated.x += bend;
    rotated.z += bend * 0.4;

    vec3 worldPos = vec3(offset.x + rotated.x, rotated.y, offset.y + rotated.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);

    vHeightFactor = heightFactor;
    vShade = shade;
    vFogState = fogState;
}
`;
