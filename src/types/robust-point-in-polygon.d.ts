declare module "robust-point-in-polygon" {
    // Returns -1 if the point is inside the polygon, 1 if outside, 0 if on the boundary.
    export default function pointInPolygon(polygon: number[][], point: number[]): number;
}
