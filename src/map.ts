import * as THREE from 'three';

import * as dat from 'dat.gui';

import { MapControls } from "three/examples/jsm/controls/OrbitControls";

import { Grid } from "./Grid";
import { MapCallbackType, myCallbackType } from './interfaces';
let { setOptions } = require( "./setoptions.js");

export class HexMap {
    //private camera = new GameCamera();
    private camera:THREE.PerspectiveCamera;
    private controls:MapControls;
    private scene:THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private selector:THREE.Object3D;
    private pointer:THREE.Object3D;
    private Callback:{ [key: string]: myCallbackType } = {};
    private grid:Grid = new Grid();

    private options = {
        gridVisible: true,
        gridColor: 0x42322b,
        pointerVisible: true,
        pointerColor: 0xeeeeee,
        selectorVisible: true,
        selectorColor: 0xffff00
    };

    constructor(options:object = {}) {
        setOptions(this, options);
        console.log(this.options);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color( 0xcccccc );
        //scene.fog = new THREE.FogExp2( 0xcccccc, 0.002 );

        this.renderer = new THREE.WebGLRenderer( { antialias: true } );
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        document.body.appendChild( this.renderer.domElement );

        this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );
        this.camera.position.set( 400, 200, 0 );

        // controls

        this.controls = new MapControls( this.camera, this.renderer.domElement );

        //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

        this.controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        this.controls.dampingFactor = 0.05;

        this.controls.screenSpacePanning = false;

        this.controls.minDistance = 100;
        this.controls.maxDistance = 500;

        this.controls.maxPolarAngle = Math.PI / 2;
        // lights

        const dirLight1 = new THREE.DirectionalLight( 0xffffff );
        dirLight1.position.set( 1, 1, 1 );
        this.scene.add( dirLight1 );

        const dirLight2 = new THREE.DirectionalLight( 0x002288 );
        dirLight2.position.set( - 1, - 1, - 1 );
        this.scene.add( dirLight2 );

        const ambientLight = new THREE.AmbientLight( 0x222222 );
        this.scene.add( ambientLight );

        const gui = new dat.GUI();
        gui.add( this.controls, 'screenSpacePanning' );
        
        // show axes in the screen
        var axes = new THREE.AxesHelper(400);
        this.scene.add(axes);

        // controls
        let gridHex = new Grid(20, 20, 20);

        gridHex.addTo(this.scene);

        this.grid = new Grid(20, 20, 20, true, this.options.gridColor);
        this.grid.visible = this.options.gridVisible;
        this.grid.addTo(this.scene);
        gui.add( this.grid, "visible");
    }

    private makeSelector():void {

        const geometry = new THREE.RingGeometry(19, 20, 6, 2);
        const material = new THREE.MeshBasicMaterial({
            color: this.options.selectorColor
        });

        this.selector = new THREE.Mesh(geometry, material);
        this.selector.rotateX(-90 * (Math.PI/180));
        this.selector.position.setY(0.01);
        this.scene.add(this.selector);
        this.selector.visible = false;
    }

    private makePointer():void {

        const geometry = new THREE.RingGeometry(19, 20, 6, 2);
        const material = new THREE.MeshBasicMaterial({
            color: this.options.pointerColor
        });

        this.pointer = new THREE.Mesh(geometry, material);
        this.pointer.rotateX(-90 * (Math.PI/180));
        this.pointer.position.setY(0.01);
        this.scene.add(this.pointer);
        this.pointer.visible = false;
    }

    public init() {
        this.makeSelector();
        this.makePointer();
        let controls = this.controls;
        let camera = this.camera;
        let scene = this.scene;
        let renderer = this.renderer;
        let selector = this.selector;
        let pointer = this.pointer;
        let Callback = this.Callback;

        let onWindowResize = function():void {

            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
    
            renderer.setSize( window.innerWidth, window.innerHeight );
    
        }
    
        let onPointerMove = function( event:MouseEvent ):void {
            // calculate pointer position in normalized device coordinates
            // (-1 to +1) for both components
            const raycaster = new THREE.Raycaster();
            const pointerVector = new THREE.Vector2();
    
            pointerVector.x = ( event.clientX / window.innerWidth ) * 2 - 1;
            pointerVector.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
            // update the picking ray with the camera and pointer position
            raycaster.setFromCamera( pointerVector, camera );
            // calculate objects intersecting the picking ray
            const intersects = raycaster.intersectObjects( scene.children );
            for ( let i = 0; i < intersects.length; i ++ ) {
                let tile = intersects[ i ].object;
                if(tile.userData?.type == "tile") {
                    selector.visible = true;
                    selector.position.set(tile.position.x, tile.position.y + 0.005, tile.position.z);
                    //@ts-ignore
                    //tile.material.color.set( 0x84aa53 );
                    if(event.type == "click") {
                        Callback[MapCallbackType.cellClick](tile.userData);
                        pointer.position.set(tile.position.x, pointer.position.y, tile.position.z);
                        pointer.visible = true;
                    }
                }
            }
        }
        window.addEventListener( 'resize', onWindowResize );
        window.addEventListener("click", onPointerMove);
        window.addEventListener( 'pointermove', onPointerMove );
        

        let animate = function():void {

            requestAnimationFrame( animate );
    
            controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true
    
            renderer.render( scene, camera );
    
        }
        animate();
    }

    public on(index:string, callback:myCallbackType):void {
        this.Callback[index] = callback;
    }
}