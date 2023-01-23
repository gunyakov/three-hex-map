export enum MapCallbackType {
    cellClick = "cellClick",
    unitMove = "unitMove",
    geometryAdd = "geometryAdd",
    mousemove = "mousemove"
}

export interface myCallbackType { (myArgument: object): void }