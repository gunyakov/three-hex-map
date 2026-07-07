import { Vector3, BufferGeometry, BufferAttribute } from "three";

//----------------------------------------------------------------------------------
//Builds the geometry for a single flat-top hexagon tile, used as the shared
//per-instance geometry of TerrainMesh's InstancedBufferGeometry. Adapted from the
//reference project's hexagon.ts (createHexagon), modernized to three.js's current
//BufferGeometry API (setAttribute instead of the removed addAttribute) and to this
//project's ground plane convention: X/Z is the ground plane, Y is up (the
//reference used X/Y as ground plane with Z up).
//
//`numSubdivisions` keeps the door open for future height-displaced layers (hills,
//mountains - see project plan) that need extra interior vertices to bend smoothly;
//flat terrain uses 0.
//
//Grid-line/rim distance used to be a per-vertex "border" attribute (1.0 at the
//rim, 0.0 elsewhere), but since it's only ever 0 or 1 at actual vertices, the
//GPU-interpolated value across a triangle depends on that triangle's size - a
//subdivided mesh (more, smaller triangles near the rim) produced a visibly
//thinner grid line than a non-subdivided one for the same shader threshold.
//Vertex shaders now compute rim distance analytically from `position` and
//`hexSize` instead (continuous, subdivision-independent), so no such attribute
//is stored in the geometry any more.
//----------------------------------------------------------------------------------
function subdivideTriangle(a: Vector3, b: Vector3, c: Vector3, numSubdivisions: number): Vector3[] {
    if ((numSubdivisions || 0) <= 0) return [a, b, c];

    const ba = b.clone().sub(a);
    const ah = a.clone().add(ba.setLength(ba.length() / 2));

    const cb = c.clone().sub(b);
    const bh = b.clone().add(cb.setLength(cb.length() / 2));

    const ac = a.clone().sub(c);
    const ch = c.clone().add(ac.setLength(ac.length() / 2));

    return ([] as Vector3[]).concat(
        subdivideTriangle(ah, bh, ch, numSubdivisions - 1),
        subdivideTriangle(ch, bh, c, numSubdivisions - 1),
        subdivideTriangle(ah, ch, a, numSubdivisions - 1),
        subdivideTriangle(bh, ah, b, numSubdivisions - 1)
    );
}

export function createHexagonGeometry(radius: number, numSubdivisions: number = 0): BufferGeometry {
    const numFaces = 6 * Math.pow(4, numSubdivisions);
    const positions = new Float32Array(numFaces * 3 * 3);
    const texcoords = new Float32Array(numFaces * 3 * 2);
    let p = 0, t = 0;

    //Flat-top hexagon corners in the X/Z ground plane (angles 0/60/.../300deg,
    //matching HEXPolygon()/pointy_hex_corner() in helpers/helpers.ts).
    const points = [0, 1, 2, 3, 4, 5]
        .map(i => {
            const angle = (Math.PI / 180) * (60 * i);
            return new Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
        })
        .concat([new Vector3(0, 0, 0)]);

    const faces = [0, 6, 1, 1, 6, 2, 2, 6, 3, 3, 6, 4, 4, 6, 5, 5, 6, 0];
    let vertices: Vector3[] = [];
    for (let i = 0; i < faces.length; i += 3) {
        const a = points[faces[i]], b = points[faces[i + 1]], c = points[faces[i + 2]];
        vertices = vertices.concat(subdivideTriangle(a, b, c, numSubdivisions));
    }

    for (let i = 0; i < vertices.length; i++) {
        positions[p++] = vertices[i].x;
        positions[p++] = vertices[i].y;
        positions[p++] = vertices[i].z;

        texcoords[t++] = 0.02 + 0.96 * ((vertices[i].x + radius) / (radius * 2));
        texcoords[t++] = 0.02 + 0.96 * ((vertices[i].z + radius) / (radius * 2));
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(texcoords, 2));

    return geometry;
}
