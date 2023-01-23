import * as THREE from 'three'
import { Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MapCallbackType, myCallbackType } from './interfaces';

export class Scene {
  private canvas:Element;
  private renderer:THREE.WebGLRenderer;
  private scene:THREE.Scene;
  private camera:THREE.PerspectiveCamera;
  private controls:MapControls;
  private width:number;
  private height:number;
  private _axesVisible:boolean = false;
  private axes:THREE.AxesHelper;
  private Callback:{ [key: string]: myCallbackType } = {};

  constructor(el:Element) {
    this.Callback[MapCallbackType.mousemove] = function() {};
    this.Callback[MapCallbackType.cellClick] = function() {};
    this.canvas = el;

    this.setScene();
    this.setRender();
    this.setCamera();
    this.setLights();
    this.setControls();
    this.setAxes();
    this.handleResize();

    // start RAF
    this.events();
  }

  /**
   * This is our scene, we'll add any object
   * https://threejs.org/docs/?q=scene#api/en/scenes/Scene
   */

  getScene():THREE.Scene {
    return this.scene;
  }

  getCamera():THREE.PerspectiveCamera {
    return this.camera;
  }

  setAxes():void {
    // show axes in the screen
    this.axes = new THREE.AxesHelper(400);
    this.axes.visible = this._axesVisible;
    this.scene.add(this.axes);
  }

  public get axesVisible():boolean {
    return this._axesVisible;
  }

  public set axesVisible(newValue:boolean) {
    this._axesVisible = newValue;
    this.axes.visible = newValue;
  }

  setScene():void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color( 0xcccccc );
    //this.scene.fog = new THREE.FogExp2( 0xcccccc, 0.002 );
  }

  /**
   * Our Webgl renderer, an object that will draw everything in our canvas
   * https://threejs.org/docs/?q=rend#api/en/renderers/WebGLRenderer
   */
  setRender():void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
  }

  setLights():void {
    // lights
    const dirLight1 = new THREE.DirectionalLight( 0xffffff );
    dirLight1.position.set( 1, 1, 1 );
    this.scene.add( dirLight1 );

    const dirLight2 = new THREE.DirectionalLight( 0x002288 );
    dirLight2.position.set( - 1, - 1, - 1 );
    this.scene.add( dirLight2 );

    const ambientLight = new THREE.AmbientLight( 0x222222 );
    this.scene.add( ambientLight );
  }

  /**
   * Our Perspective camera, this is the point of view that we'll have
   * of our scene.
   * A perscpective camera is mimicing the human eyes so something far we'll
   * look smaller than something close
   * https://threejs.org/docs/?q=pers#api/en/cameras/PerspectiveCamera
   */
  setCamera():void {
    const aspectRatio = this.width / this.height
    const fieldOfView = 60
    const nearPlane = 10
    const farPlane = 2000

    this.camera = new THREE.PerspectiveCamera(
      fieldOfView,
      aspectRatio,
      nearPlane,
      farPlane
    )
    //this.camera.position.set(400, 200, 0);
    this.camera.position.set(900, 500, 1000);
    
    this.scene.add(this.camera)
  }

  /**
   * Threejs controls to have controls on our scene
   * https://threejs.org/docs/?q=orbi#examples/en/controls/OrbitControls
   */
  setControls():void {
    // controls

    this.controls = new MapControls( this.camera, this.renderer.domElement );

    //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

    this.controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    this.controls.dampingFactor = 0.05;

    this.controls.screenSpacePanning = false;

    this.controls.minDistance = 100;
    this.controls.maxDistance = 800;
    this.controls.minAzimuthAngle = 90 * (Math.PI / 180);
    this.controls.maxAzimuthAngle = 90 * (Math.PI / 180);
    this.controls.minPolarAngle = 0
    this.controls.maxPolarAngle = 15 * (Math.PI / 180);

    //this.controls.enableRotate = false;
    this.draw(0);
  }

  /**
   * List of events
   */
  events() {
    window.addEventListener( 'resize', this.handleResize, { passive: true });
    window.addEventListener( "click", (event) => this.onPointerMove(event, this.camera, this.scene));
    window.addEventListener( 'pointermove', (event) => this.onPointerMove(event, this.camera, this.scene));
  }

  /**
   * Request animation frame function
   * This function is called 60/time per seconds with no performance issue
   * Everything that happens in the scene is drawed here
   * @param {Number} now
   */
  draw = (now:number) => {
    // now: time in ms
    // if (this.controls) this.controls.update() // for damping
    this.renderer.render(this.scene, this.camera);

    window.requestAnimationFrame(this.draw);
  }

  /**
   * On resize, we need to adapt our camera based
   * on the new window width and height and the renderer
   */
  handleResize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Update camera
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.width, this.height);
  }

  private onPointerMove = function( event:MouseEvent, camera:THREE.PerspectiveCamera, scene:THREE.Scene):void {
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
        this.Callback[MapCallbackType.mousemove](tile);
          if(event.type == "click") {
              this.Callback[MapCallbackType.cellClick](tile);
          }
      }
    }
  };

  add = (element:any) => {
    this.scene.add(element);
  }

  //----------------------------------------------------------------------------------------------------
  // CALLBACKS REGISTRATION
  //----------------------------------------------------------------------------------------------------
  public on(index:string, callback:myCallbackType):void {
    this.Callback[index] = callback;
  }

}
