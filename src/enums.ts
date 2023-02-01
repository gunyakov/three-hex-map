import { ColorRepresentation } from "three";

export enum MapCallbackType {
    cellClick = "cellClick",
    unitClick = "unitClick",
    cellMove = "cellMove",
    unitMove = "unitMove",
    geometryAdd = "geometryAdd",
    mousemove = "mousemove",
    animate = "animate"
}

export enum Land {
    sea = "sea",
    shore = "shore",
    land = "land",
    sand = "sand",
    tundra = "tundra",
    snow = "snow"
}

export let LandColor: { [key in Land]: ColorRepresentation} =  {
    [Land.land]: 0x84aa53,
    [Land.shore]: 0x4f6c80,
    [Land.sea]: 0x2a368c,
    [Land.sand]: 0xaea765,
    [Land.tundra]: 0xffffff,
    [Land.snow]: 0xffffff
}

export enum UnitActions {
    attack = "attack",
    walk = "walk",
    distanceAttack = "distanceAttack",
    death = "death",
    idle = "idle",
    defence = "defence"
}