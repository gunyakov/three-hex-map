import { PerspectiveCamera, Scene} from "three";

export class GameCamera<PerspectiveCamera> {

    private _camera = new PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );

    constructor() {
        this._camera.position.set( 400, 200, 0 );
    }

    public get camera() {
        return this._camera;
    }

} 