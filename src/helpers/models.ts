import { Group, Matrix4, Vector3, Quaternion, Euler, MathUtils } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

//----------------------------------------------------------------------------------
//Per-model fine-tuning, stored as info.json next to model.glb in the model's own
//folder (see loadModel() below) - a model's authored offset/rotation/scale is
//arbitrary and different assets need different fixes, but that fix is a property
//of the *asset*, not of any particular map's use of it. Keeping it in the asset's
//own folder means swapping which model a tile points to (map.json's city.model/
//TileInfo.treeModel) is a one-line path change that just works, with no per-tile
//retuning. rotation is in degrees (friendlier to hand-edit than radians).
//----------------------------------------------------------------------------------
export interface ModelInfo {
    offset: { x: number, y: number, z: number };
    rotation: { x: number, y: number, z: number };
    scale: number;
}

export interface LoadedModel {
    scene: Group;
    info: ModelInfo;
    fixup: Matrix4; // offset/rotation/scale above, composed once as a matrix
}

const DEFAULT_INFO: ModelInfo = {
    offset: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1
};

function loadGLTF(url: string): Promise<Group> {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(url, gltf => resolve(gltf.scene), undefined, reject);
    });
}

async function loadInfo(url: string): Promise<ModelInfo> {
    try {
        const response = await fetch(url);
        if (!response.ok) return DEFAULT_INFO;
        return { ...DEFAULT_INFO, ...(await response.json()) };
    } catch {
        return DEFAULT_INFO;
    }
}

function fixupMatrix(info: ModelInfo): Matrix4 {
    const rotation = new Euler(
        MathUtils.degToRad(info.rotation.x),
        MathUtils.degToRad(info.rotation.y),
        MathUtils.degToRad(info.rotation.z)
    );
    return new Matrix4().compose(
        new Vector3(info.offset.x, info.offset.y, info.offset.z),
        new Quaternion().setFromEuler(rotation),
        new Vector3(info.scale, info.scale, info.scale)
    );
}

const cache = new Map<string, Promise<LoadedModel>>();

//----------------------------------------------------------------------------------
//Loads (and caches by folder path) a model - `path` is a folder containing
//model.glb + info.json (e.g. "Assets/models/monument"), not a bare filename.
//The cached scene/fixup are shared/read-only: Forest.ts bakes the fixup into
//InstancedMesh geometry once, TerrainMesh's cities clone the scene and apply
//the fixup as a normal transform per clone.
//----------------------------------------------------------------------------------
export function loadModel(path: string): Promise<LoadedModel> {
    let promise = cache.get(path);
    if (!promise) {
        promise = (async () => {
            const [scene, info] = await Promise.all([
                loadGLTF(`${path}/model.glb`),
                loadInfo(`${path}/info.json`)
            ]);
            scene.updateMatrixWorld(true);
            return { scene, info, fixup: fixupMatrix(info) };
        })();
        cache.set(path, promise);
    }
    return promise;
}
