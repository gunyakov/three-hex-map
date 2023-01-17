import * as THREE from "three";
import { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { getKeyframeOrder } from "three/src/animation/AnimationUtils";
import { Grid } from "./Grid";
import * as dat from 'dat.gui';

export class HexMap {
    private scene: Scene;
    private renderer: WebGLRenderer;
    private camera: PerspectiveCamera;

    construct() {
        
    }

    async render(containerID: string):Promise<void> {
        // create a scene, that will hold all our elements such as objects, cameras and lights.
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x7799ff);

        // create a camera, which defines where we're looking at.
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

        // create a render and set the size
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setClearColor(new THREE.Color(0xEEEEEE));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // show axes in the screen
        var axes = new THREE.AxesHelper(20);
        this.scene.add(axes);

        let grid = new Grid();
        let groupGrid = grid.getGrid();
        //groupGrid.rotation.x = -0.5 * Math.PI;
        // add the sphere to the scene
        this.scene.add(groupGrid);
        // position and point the camera to the center of the scene
        this.camera.position.x = 14;
        this.camera.position.y = 12;
        this.camera.position.z = 100;
        this.camera.lookAt(0,0,0);

        var controls = {
            positionX: 14,
            positionY: -51,
            positionZ: 66,
            rotateX: 15,
            rotateY: 64,
            rotateZ: -20
        };

        var gui = new dat.GUI();
        gui.add(controls, 'positionX', -100, 100);
        gui.add(controls, 'positionY', -100, 100);
        gui.add(controls, 'positionZ', -100, 100);
        gui.add(controls, 'rotateX', -90, 90);
        gui.add(controls, 'rotateY', -90, 90);
        gui.add(controls, 'rotateZ', -90, 90);

        //this.camera.lookAt(0, 0, 0);
        // add the output of the renderer to the html element
        document.getElementById(containerID).appendChild(this.renderer.domElement);

        // render the scene
        this.renderer.render(this.scene, this.camera);

        
        let camera = this.camera;
        
        let renderer = this.renderer;
        let scene = this.scene;
        render();
        function render() {
            
            // rotate the cube around its axes
            camera.position.x = controls.positionX;
            camera.position.y = controls.positionY;
            camera.position.z = controls.positionZ;
            camera.lookAt(controls.rotateX, controls.rotateY, controls.rotateZ);
            //
            // render using requestAnimationFrame
            requestAnimationFrame(render);
            renderer.render(scene, camera);
        }
    }
}