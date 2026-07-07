export const WATER_FRAGMENT_SHADER = `
precision highp float;

uniform vec4 textureAtlasMeta;

uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;

uniform vec3 lightDir;
uniform vec3 cameraPosition; // auto-provided by three.js each frame

uniform vec3 waterColorDeep;
uniform vec3 waterColorShallow;
uniform float sparkleIntensity;
uniform float fresnelIntensity;

varying vec2 vUV;
varying float vBorder;
varying float vPriority;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying vec3 vNormal;
varying vec3 vWorldPos;

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);
const vec3 sparkleColor = vec3(1.0, 0.97, 0.85);
const vec3 skyTint = vec3(0.85, 0.95, 1.0);

// Picks the single strongest edge among the 6 whose neighbor both passes the
// one-directional priority gate and is itself water (a sea tile bordering a
// shallower shore tile), returning (bestFactor, kind). Mirrors the land
// shader's strongestWaterEdge() (see terrain.vertex.ts).
//
// Water deliberately does NOT also blend towards a "sand" color near land
// neighbors: the land layer already draws that transition itself (a real 3D
// beach slope down to waterLevel, see terrain.vertex.ts/fragment.ts's vBeachT) -
// water only needs to render its own flat shallow/deep color underneath it.
// An earlier version of this shader tried to *also* fade the water side to a
// sand tone at the coast, which reproducibly rendered as dark blotches right
// at the shoreline; the root cause wasn't pinned down despite ruling out the
// blend order, texture vs. flat color, specular/fresnel/grid, and mediump vs.
// highp precision - dropping the redundant blend sidesteps it entirely, and
// the land-side beach slope already covers this visually.
vec2 strongestWaterEdge(vec2 best, float kind, float priority, float factor) {
    if (kind < 0.5 || priority <= vPriority) return best;
    if (factor > best.x) return vec2(factor, kind);
    return best;
}

void main() {
    // self color: this mesh only ever contains sea (priority 0) / shore
    // (priority 1) tiles (see TerrainMesh's WATER_TYPES split), so vPriority
    // alone is enough to tell which one a given instance is.
    vec4 texColor = vec4(vPriority < 0.5 ? waterColorDeep : waterColorShallow, 1.0);

    // water-to-water (e.g. sea blending towards a shallower shore): blend once,
    // towards the single closest higher-priority water edge.
    vec2 water = vec2(0.0);
    water = strongestWaterEdge(water, vNeighborsKindA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x);
    water = strongestWaterEdge(water, vNeighborsKindA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y);
    water = strongestWaterEdge(water, vNeighborsKindA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z);
    water = strongestWaterEdge(water, vNeighborsKindB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x);
    water = strongestWaterEdge(water, vNeighborsKindB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y);
    water = strongestWaterEdge(water, vNeighborsKindB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z);
    if (water.x > 0.0) {
        vec3 otherColor = water.y > 1.5 ? waterColorShallow : waterColorDeep;
        texColor = mix(texColor, vec4(otherColor, 1.0), clamp(water.x, 0.0, 1.0));
    }

    vec3 normal = normalize(vNormal);
    vec3 light = normalize(lightDir);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float ndotl = max(dot(normal, light), 0.0);
    vec3 color = lightAmbient * texColor.rgb + ndotl * lightDiffuse * texColor.rgb;

    // sun glitter: sharp specular highlight off the wave-perturbed normal
    vec3 halfDir = normalize(light + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 60.0);
    color += spec * sparkleColor * sparkleIntensity;

    // cheap fresnel: brighten towards a fixed sky tint at grazing angles,
    // instead of a real planar reflection render target.
    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
    color = mix(color, skyTint, fresnel * 0.5 * fresnelIntensity);

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;
