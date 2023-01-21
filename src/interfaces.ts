export enum TOP {flat, point};

export enum MapCallbackType {
    cellClick = "cellClick",
    unitMove = "unitMove"
}

export interface myCallbackType { (myArgument: object): void }