(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three')) :
	typeof define === 'function' && define.amd ? define(['exports', 'three'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.HexMap = {}, global.THREE));
})(this, (function (exports, three) { 'use strict';

	/**
	 * Fires when the camera has been transformed by the controls.
	 *
	 * @event OrbitControls#change
	 * @type {Object}
	 */
	const _changeEvent = { type: 'change' };

	/**
	 * Fires when an interaction was initiated.
	 *
	 * @event OrbitControls#start
	 * @type {Object}
	 */
	const _startEvent = { type: 'start' };

	/**
	 * Fires when an interaction has finished.
	 *
	 * @event OrbitControls#end
	 * @type {Object}
	 */
	const _endEvent = { type: 'end' };

	const _ray = new three.Ray();
	const _plane = new three.Plane();
	const _TILT_LIMIT = Math.cos( 70 * three.MathUtils.DEG2RAD );

	const _v = new three.Vector3();
	const _twoPI = 2 * Math.PI;

	const _STATE = {
		NONE: -1,
		ROTATE: 0,
		DOLLY: 1,
		PAN: 2,
		TOUCH_ROTATE: 3,
		TOUCH_PAN: 4,
		TOUCH_DOLLY_PAN: 5,
		TOUCH_DOLLY_ROTATE: 6
	};
	const _EPS = 0.000001;


	/**
	 * Orbit controls allow the camera to orbit around a target.
	 *
	 * OrbitControls performs orbiting, dollying (zooming), and panning. Unlike {@link TrackballControls},
	 * it maintains the "up" direction `object.up` (+Y by default).
	 *
	 * - Orbit: Left mouse / touch: one-finger move.
	 * - Zoom: Middle mouse, or mousewheel / touch: two-finger spread or squish.
	 * - Pan: Right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move.
	 *
	 * ```js
	 * const controls = new OrbitControls( camera, renderer.domElement );
	 *
	 * // controls.update() must be called after any manual changes to the camera's transform
	 * camera.position.set( 0, 20, 100 );
	 * controls.update();
	 *
	 * function animate() {
	 *
	 * 	// required if controls.enableDamping or controls.autoRotate are set to true
	 * 	controls.update();
	 *
	 * 	renderer.render( scene, camera );
	 *
	 * }
	 * ```
	 *
	 * @augments Controls
	 * @three_import import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	 */
	class OrbitControls extends three.Controls {

		/**
		 * Constructs a new controls instance.
		 *
		 * @param {Object3D} object - The object that is managed by the controls.
		 * @param {?HTMLElement} domElement - The HTML element used for event listeners.
		 */
		constructor( object, domElement = null ) {

			super( object, domElement );

			this.state = _STATE.NONE;

			/**
			 * The focus point of the controls, the `object` orbits around this.
			 * It can be updated manually at any point to change the focus of the controls.
			 *
			 * @type {Vector3}
			 */
			this.target = new three.Vector3();

			/**
			 * The focus point of the `minTargetRadius` and `maxTargetRadius` limits.
			 * It can be updated manually at any point to change the center of interest
			 * for the `target`.
			 *
			 * @type {Vector3}
			 */
			this.cursor = new three.Vector3();

			/**
			 * How far you can dolly in (perspective camera only).
			 *
			 * @type {number}
			 * @default 0
			 */
			this.minDistance = 0;

			/**
			 * How far you can dolly out (perspective camera only).
			 *
			 * @type {number}
			 * @default Infinity
			 */
			this.maxDistance = Infinity;

			/**
			 * How far you can zoom in (orthographic camera only).
			 *
			 * @type {number}
			 * @default 0
			 */
			this.minZoom = 0;

			/**
			 * How far you can zoom out (orthographic camera only).
			 *
			 * @type {number}
			 * @default Infinity
			 */
			this.maxZoom = Infinity;

			/**
			 * How close you can get the target to the 3D `cursor`.
			 *
			 * @type {number}
			 * @default 0
			 */
			this.minTargetRadius = 0;

			/**
			 * How far you can move the target from the 3D `cursor`.
			 *
			 * @type {number}
			 * @default Infinity
			 */
			this.maxTargetRadius = Infinity;

			/**
			 * How far you can orbit vertically, lower limit. Range is `[0, Math.PI]` radians.
			 *
			 * @type {number}
			 * @default 0
			 */
			this.minPolarAngle = 0;

			/**
			 * How far you can orbit vertically, upper limit. Range is `[0, Math.PI]` radians.
			 *
			 * @type {number}
			 * @default Math.PI
			 */
			this.maxPolarAngle = Math.PI;

			/**
			 * How far you can orbit horizontally, lower limit. If set, the interval `[ min, max ]`
			 * must be a sub-interval of `[ - 2 PI, 2 PI ]`, with `( max - min < 2 PI )`.
			 *
			 * @type {number}
			 * @default -Infinity
			 */
			this.minAzimuthAngle = - Infinity;

			/**
			 * How far you can orbit horizontally, upper limit. If set, the interval `[ min, max ]`
			 * must be a sub-interval of `[ - 2 PI, 2 PI ]`, with `( max - min < 2 PI )`.
			 *
			 * @type {number}
			 * @default -Infinity
			 */
			this.maxAzimuthAngle = Infinity;

			/**
			 * Set to `true` to enable damping (inertia), which can be used to give a sense of weight
			 * to the controls. Note that if this is enabled, you must call `update()` in your animation
			 * loop.
			 *
			 * @type {boolean}
			 * @default false
			 */
			this.enableDamping = false;

			/**
			 * The damping inertia used if `enableDamping` is set to `true`.
			 *
			 * Note that for this to work, you must call `update()` in your animation loop.
			 *
			 * @type {number}
			 * @default 0.05
			 */
			this.dampingFactor = 0.05;

			/**
			 * Enable or disable zooming (dollying) of the camera.
			 *
			 * @type {boolean}
			 * @default true
			 */
			this.enableZoom = true;

			/**
			 * Speed of zooming / dollying.
			 *
			 * @type {number}
			 * @default 1
			 */
			this.zoomSpeed = 1.0;

			/**
			 * Enable or disable horizontal and vertical rotation of the camera.
			 *
			 * Note that it is possible to disable a single axis by setting the min and max of the
			 * `minPolarAngle` or `minAzimuthAngle` to the same value, which will cause the vertical
			 * or horizontal rotation to be fixed at that value.
			 *
			 * @type {boolean}
			 * @default true
			 */
			this.enableRotate = true;

			/**
			 * Speed of rotation.
			 *
			 * @type {number}
			 * @default 1
			 */
			this.rotateSpeed = 1.0;

			/**
			 * How fast to rotate the camera when the keyboard is used.
			 *
			 * @type {number}
			 * @default 1
			 */
			this.keyRotateSpeed = 1.0;

			/**
			 * Enable or disable camera panning.
			 *
			 * @type {boolean}
			 * @default true
			 */
			this.enablePan = true;

			/**
			 * Speed of panning.
			 *
			 * @type {number}
			 * @default 1
			 */
			this.panSpeed = 1.0;

			/**
			 * Defines how the camera's position is translated when panning. If `true`, the camera pans
			 * in screen space. Otherwise, the camera pans in the plane orthogonal to the camera's up
			 * direction.
			 *
			 * @type {boolean}
			 * @default true
			 */
			this.screenSpacePanning = true;

			/**
			 * How fast to pan the camera when the keyboard is used in
			 * pixels per keypress.
			 *
			 * @type {number}
			 * @default 7
			 */
			this.keyPanSpeed = 7.0;

			/**
			 * Setting this property to `true` allows to zoom to the cursor's position.
			 *
			 * @type {boolean}
			 * @default false
			 */
			this.zoomToCursor = false;

			/**
			 * Set to true to automatically rotate around the target
			 *
			 * Note that if this is enabled, you must call `update()` in your animation loop.
			 * If you want the auto-rotate speed to be independent of the frame rate (the refresh
			 * rate of the display), you must pass the time `deltaTime`, in seconds, to `update()`.
			 *
			 * @type {boolean}
			 * @default false
			 */
			this.autoRotate = false;

			/**
			 * How fast to rotate around the target if `autoRotate` is `true`. The default  equates to 30 seconds
			 * per orbit at 60fps.
			 *
			 * Note that if `autoRotate` is enabled, you must call `update()` in your animation loop.
			 *
			 * @type {number}
			 * @default 2
			 */
			this.autoRotateSpeed = 2.0;

			/**
			 * This object contains references to the keycodes for controlling camera panning.
			 *
			 * ```js
			 * controls.keys = {
			 * 	LEFT: 'ArrowLeft', //left arrow
			 * 	UP: 'ArrowUp', // up arrow
			 * 	RIGHT: 'ArrowRight', // right arrow
			 * 	BOTTOM: 'ArrowDown' // down arrow
			 * }
			 * ```
			 * @type {Object}
			 */
			this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

			/**
			 * This object contains references to the mouse actions used by the controls.
			 *
			 * ```js
			 * controls.mouseButtons = {
			 * 	LEFT: THREE.MOUSE.ROTATE,
			 * 	MIDDLE: THREE.MOUSE.DOLLY,
			 * 	RIGHT: THREE.MOUSE.PAN
			 * }
			 * ```
			 * @type {Object}
			 */
			this.mouseButtons = { LEFT: three.MOUSE.ROTATE, MIDDLE: three.MOUSE.DOLLY, RIGHT: three.MOUSE.PAN };

			/**
			 * This object contains references to the touch actions used by the controls.
			 *
			 * ```js
			 * controls.mouseButtons = {
			 * 	ONE: THREE.TOUCH.ROTATE,
			 * 	TWO: THREE.TOUCH.DOLLY_PAN
			 * }
			 * ```
			 * @type {Object}
			 */
			this.touches = { ONE: three.TOUCH.ROTATE, TWO: three.TOUCH.DOLLY_PAN };

			/**
			 * Used internally by `saveState()` and `reset()`.
			 *
			 * @type {Vector3}
			 */
			this.target0 = this.target.clone();

			/**
			 * Used internally by `saveState()` and `reset()`.
			 *
			 * @type {Vector3}
			 */
			this.position0 = this.object.position.clone();

			/**
			 * Used internally by `saveState()` and `reset()`.
			 *
			 * @type {number}
			 */
			this.zoom0 = this.object.zoom;

			this._cursorStyle = 'auto';

			// the target DOM element for key events
			this._domElementKeyEvents = null;

			// internals

			this._lastPosition = new three.Vector3();
			this._lastQuaternion = new three.Quaternion();
			this._lastTargetPosition = new three.Vector3();

			// so camera.up is the orbit axis
			this._quat = new three.Quaternion().setFromUnitVectors( object.up, new three.Vector3( 0, 1, 0 ) );
			this._quatInverse = this._quat.clone().invert();

			// current position in spherical coordinates
			this._spherical = new three.Spherical();
			this._sphericalDelta = new three.Spherical();

			this._scale = 1;
			this._panOffset = new three.Vector3();

			this._rotateStart = new three.Vector2();
			this._rotateEnd = new three.Vector2();
			this._rotateDelta = new three.Vector2();

			this._panStart = new three.Vector2();
			this._panEnd = new three.Vector2();
			this._panDelta = new three.Vector2();

			this._dollyStart = new three.Vector2();
			this._dollyEnd = new three.Vector2();
			this._dollyDelta = new three.Vector2();

			this._dollyDirection = new three.Vector3();
			this._mouse = new three.Vector2();
			this._performCursorZoom = false;

			this._pointers = [];
			this._pointerPositions = {};

			this._controlActive = false;

			// event listeners

			this._onPointerMove = onPointerMove.bind( this );
			this._onPointerDown = onPointerDown.bind( this );
			this._onPointerUp = onPointerUp.bind( this );
			this._onContextMenu = onContextMenu.bind( this );
			this._onMouseWheel = onMouseWheel.bind( this );
			this._onKeyDown = onKeyDown.bind( this );

			this._onTouchStart = onTouchStart.bind( this );
			this._onTouchMove = onTouchMove.bind( this );

			this._onMouseDown = onMouseDown.bind( this );
			this._onMouseMove = onMouseMove.bind( this );

			this._interceptControlDown = interceptControlDown.bind( this );
			this._interceptControlUp = interceptControlUp.bind( this );

			//

			if ( this.domElement !== null ) {

				this.connect( this.domElement );

			}

			this.update();

		}

		/**
		 * Defines the visual representation of the cursor.
		 *
		 * @type {('auto'|'grab')}
		 * @default 'auto'
		 */
		set cursorStyle( type ) {

			this._cursorStyle = type;

			if ( type === 'grab' ) {

				this.domElement.style.cursor = 'grab';

			} else {

				this.domElement.style.cursor = 'auto';

			}

		}

		get cursorStyle() {

			return this._cursorStyle;

		}

		connect( element ) {

			super.connect( element );

			this.domElement.addEventListener( 'pointerdown', this._onPointerDown );
			this.domElement.addEventListener( 'pointercancel', this._onPointerUp );

			this.domElement.addEventListener( 'contextmenu', this._onContextMenu );
			this.domElement.addEventListener( 'wheel', this._onMouseWheel, { passive: false } );

			const document = this.domElement.getRootNode(); // offscreen canvas compatibility
			document.addEventListener( 'keydown', this._interceptControlDown, { passive: true, capture: true } );

			this.domElement.style.touchAction = 'none'; // Disable touch scroll

		}

		disconnect() {

			this.domElement.removeEventListener( 'pointerdown', this._onPointerDown );
			this.domElement.ownerDocument.removeEventListener( 'pointermove', this._onPointerMove );
			this.domElement.ownerDocument.removeEventListener( 'pointerup', this._onPointerUp );
			this.domElement.removeEventListener( 'pointercancel', this._onPointerUp );

			this.domElement.removeEventListener( 'wheel', this._onMouseWheel );
			this.domElement.removeEventListener( 'contextmenu', this._onContextMenu );

			this.stopListenToKeyEvents();

			const document = this.domElement.getRootNode(); // offscreen canvas compatibility
			document.removeEventListener( 'keydown', this._interceptControlDown, { capture: true } );

			this.domElement.style.touchAction = ''; // Restore touch scroll

		}

		dispose() {

			this.disconnect();

		}

		/**
		 * Get the current vertical rotation, in radians.
		 *
		 * @return {number} The current vertical rotation, in radians.
		 */
		getPolarAngle() {

			return this._spherical.phi;

		}

		/**
		 * Get the current horizontal rotation, in radians.
		 *
		 * @return {number} The current horizontal rotation, in radians.
		 */
		getAzimuthalAngle() {

			return this._spherical.theta;

		}

		/**
		 * Returns the distance from the camera to the target.
		 *
		 * @return {number} The distance from the camera to the target.
		 */
		getDistance() {

			return this.object.position.distanceTo( this.target );

		}

		/**
		 * Adds key event listeners to the given DOM element.
		 * `window` is a recommended argument for using this method.
		 *
		 * @param {HTMLElement} domElement - The DOM element
		 */
		listenToKeyEvents( domElement ) {

			domElement.addEventListener( 'keydown', this._onKeyDown );
			this._domElementKeyEvents = domElement;

		}

		/**
		 * Removes the key event listener previously defined with `listenToKeyEvents()`.
		 */
		stopListenToKeyEvents() {

			if ( this._domElementKeyEvents !== null ) {

				this._domElementKeyEvents.removeEventListener( 'keydown', this._onKeyDown );
				this._domElementKeyEvents = null;

			}

		}

		/**
		 * Save the current state of the controls. This can later be recovered with `reset()`.
		 */
		saveState() {

			this.target0.copy( this.target );
			this.position0.copy( this.object.position );
			this.zoom0 = this.object.zoom;

		}

		/**
		 * Reset the controls to their state from either the last time the `saveState()`
		 * was called, or the initial state.
		 */
		reset() {

			this.target.copy( this.target0 );
			this.object.position.copy( this.position0 );
			this.object.zoom = this.zoom0;

			this.object.updateProjectionMatrix();
			this.dispatchEvent( _changeEvent );

			this.update();

			this.state = _STATE.NONE;

		}

		/**
		 * Programmatically pan the camera.
		 *
		 * @param {number} deltaX - The horizontal pan amount in pixels.
		 * @param {number} deltaY - The vertical pan amount in pixels.
		 */
		pan( deltaX, deltaY ) {

			this._pan( deltaX, deltaY );
			this.update();

		}

		/**
		 * Programmatically dolly in (zoom in for perspective camera).
		 *
		 * @param {number} dollyScale - The dolly scale factor.
		 */
		dollyIn( dollyScale ) {

			this._dollyIn( dollyScale );
			this.update();

		}

		/**
		 * Programmatically dolly out (zoom out for perspective camera).
		 *
		 * @param {number} dollyScale - The dolly scale factor.
		 */
		dollyOut( dollyScale ) {

			this._dollyOut( dollyScale );
			this.update();

		}

		/**
		 * Programmatically rotate the camera left (around the vertical axis).
		 *
		 * @param {number} angle - The rotation angle in radians.
		 */
		rotateLeft( angle ) {

			this._rotateLeft( angle );
			this.update();

		}

		/**
		 * Programmatically rotate the camera up (around the horizontal axis).
		 *
		 * @param {number} angle - The rotation angle in radians.
		 */
		rotateUp( angle ) {

			this._rotateUp( angle );
			this.update();

		}

		update( deltaTime = null ) {

			const position = this.object.position;

			_v.copy( position ).sub( this.target );

			// rotate offset to "y-axis-is-up" space
			_v.applyQuaternion( this._quat );

			// angle from z-axis around y-axis
			this._spherical.setFromVector3( _v );

			if ( this.autoRotate && this.state === _STATE.NONE ) {

				this._rotateLeft( this._getAutoRotationAngle( deltaTime ) );

			}

			if ( this.enableDamping ) {

				this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
				this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;

			} else {

				this._spherical.theta += this._sphericalDelta.theta;
				this._spherical.phi += this._sphericalDelta.phi;

			}

			// restrict theta to be between desired limits

			let min = this.minAzimuthAngle;
			let max = this.maxAzimuthAngle;

			if ( isFinite( min ) && isFinite( max ) ) {

				if ( min < - Math.PI ) min += _twoPI; else if ( min > Math.PI ) min -= _twoPI;

				if ( max < - Math.PI ) max += _twoPI; else if ( max > Math.PI ) max -= _twoPI;

				if ( min <= max ) {

					this._spherical.theta = Math.max( min, Math.min( max, this._spherical.theta ) );

				} else {

					this._spherical.theta = ( this._spherical.theta > ( min + max ) / 2 ) ?
						Math.max( min, this._spherical.theta ) :
						Math.min( max, this._spherical.theta );

				}

			}

			// restrict phi to be between desired limits
			this._spherical.phi = Math.max( this.minPolarAngle, Math.min( this.maxPolarAngle, this._spherical.phi ) );

			this._spherical.makeSafe();


			// move target to panned location

			if ( this.enableDamping === true ) {

				this.target.addScaledVector( this._panOffset, this.dampingFactor );

			} else {

				this.target.add( this._panOffset );

			}

			// Limit the target distance from the cursor to create a sphere around the center of interest
			this.target.sub( this.cursor );
			this.target.clampLength( this.minTargetRadius, this.maxTargetRadius );
			this.target.add( this.cursor );

			let zoomChanged = false;
			// adjust the camera position based on zoom only if we're not zooming to the cursor or if it's an ortho camera
			// we adjust zoom later in these cases
			if ( this.zoomToCursor && this._performCursorZoom || this.object.isOrthographicCamera ) {

				this._spherical.radius = this._clampDistance( this._spherical.radius );

			} else {

				const prevRadius = this._spherical.radius;
				this._spherical.radius = this._clampDistance( this._spherical.radius * this._scale );
				zoomChanged = prevRadius != this._spherical.radius;

			}

			_v.setFromSpherical( this._spherical );

			// rotate offset back to "camera-up-vector-is-up" space
			_v.applyQuaternion( this._quatInverse );

			position.copy( this.target ).add( _v );

			this.object.lookAt( this.target );

			if ( this.enableDamping === true ) {

				this._sphericalDelta.theta *= ( 1 - this.dampingFactor );
				this._sphericalDelta.phi *= ( 1 - this.dampingFactor );

				this._panOffset.multiplyScalar( 1 - this.dampingFactor );

			} else {

				this._sphericalDelta.set( 0, 0, 0 );

				this._panOffset.set( 0, 0, 0 );

			}

			// adjust camera position
			if ( this.zoomToCursor && this._performCursorZoom ) {

				let newRadius = null;
				if ( this.object.isPerspectiveCamera ) {

					// move the camera down the pointer ray
					// this method avoids floating point error
					const prevRadius = _v.length();
					newRadius = this._clampDistance( prevRadius * this._scale );

					const radiusDelta = prevRadius - newRadius;
					this.object.position.addScaledVector( this._dollyDirection, radiusDelta );
					this.object.updateMatrixWorld();

					zoomChanged = !! radiusDelta;

				} else if ( this.object.isOrthographicCamera ) {

					// adjust the ortho camera position based on zoom changes
					const mouseBefore = new three.Vector3( this._mouse.x, this._mouse.y, 0 );
					mouseBefore.unproject( this.object );

					const prevZoom = this.object.zoom;
					this.object.zoom = Math.max( this.minZoom, Math.min( this.maxZoom, this.object.zoom / this._scale ) );
					this.object.updateProjectionMatrix();

					zoomChanged = prevZoom !== this.object.zoom;

					const mouseAfter = new three.Vector3( this._mouse.x, this._mouse.y, 0 );
					mouseAfter.unproject( this.object );

					this.object.position.sub( mouseAfter ).add( mouseBefore );
					this.object.updateMatrixWorld();

					newRadius = _v.length();

				} else {

					console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.' );
					this.zoomToCursor = false;

				}

				// handle the placement of the target
				if ( newRadius !== null ) {

					if ( this.screenSpacePanning ) {

						// position the orbit target in front of the new camera position
						this.target.set( 0, 0, -1 )
							.transformDirection( this.object.matrix )
							.multiplyScalar( newRadius )
							.add( this.object.position );

					} else {

						// get the ray and translation plane to compute target
						_ray.origin.copy( this.object.position );
						_ray.direction.set( 0, 0, -1 ).transformDirection( this.object.matrix );

						// if the camera is 20 degrees above the horizon then don't adjust the focus target to avoid
						// extremely large values
						if ( Math.abs( this.object.up.dot( _ray.direction ) ) < _TILT_LIMIT ) {

							this.object.lookAt( this.target );

						} else {

							_plane.setFromNormalAndCoplanarPoint( this.object.up, this.target );
							_ray.intersectPlane( _plane, this.target );

						}

					}

				}

			} else if ( this.object.isOrthographicCamera ) {

				const prevZoom = this.object.zoom;
				this.object.zoom = Math.max( this.minZoom, Math.min( this.maxZoom, this.object.zoom / this._scale ) );

				if ( prevZoom !== this.object.zoom ) {

					this.object.updateProjectionMatrix();
					zoomChanged = true;

				}

			}

			this._scale = 1;
			this._performCursorZoom = false;

			// update condition is:
			// min(camera displacement, camera rotation in radians)^2 > EPS
			// using small-angle approximation cos(x/2) = 1 - x^2 / 8

			if ( zoomChanged ||
				this._lastPosition.distanceToSquared( this.object.position ) > _EPS ||
				8 * ( 1 - this._lastQuaternion.dot( this.object.quaternion ) ) > _EPS ||
				this._lastTargetPosition.distanceToSquared( this.target ) > _EPS ) {

				this.dispatchEvent( _changeEvent );

				this._lastPosition.copy( this.object.position );
				this._lastQuaternion.copy( this.object.quaternion );
				this._lastTargetPosition.copy( this.target );

				return true;

			}

			return false;

		}

		_getAutoRotationAngle( deltaTime ) {

			if ( deltaTime !== null ) {

				return ( _twoPI / 60 * this.autoRotateSpeed ) * deltaTime;

			} else {

				return _twoPI / 60 / 60 * this.autoRotateSpeed;

			}

		}

		_getZoomScale( delta ) {

			const normalizedDelta = Math.abs( delta * 0.01 );
			return Math.pow( 0.95, this.zoomSpeed * normalizedDelta );

		}

		_rotateLeft( angle ) {

			this._sphericalDelta.theta -= angle;

		}

		_rotateUp( angle ) {

			this._sphericalDelta.phi -= angle;

		}

		_panLeft( distance, objectMatrix ) {

			_v.setFromMatrixColumn( objectMatrix, 0 ); // get X column of objectMatrix
			_v.multiplyScalar( - distance );

			this._panOffset.add( _v );

		}

		_panUp( distance, objectMatrix ) {

			if ( this.screenSpacePanning === true ) {

				_v.setFromMatrixColumn( objectMatrix, 1 );

			} else {

				_v.setFromMatrixColumn( objectMatrix, 0 );
				_v.crossVectors( this.object.up, _v );

			}

			_v.multiplyScalar( distance );

			this._panOffset.add( _v );

		}

		// deltaX and deltaY are in pixels; right and down are positive
		_pan( deltaX, deltaY ) {

			const element = this.domElement;

			if ( this.object.isPerspectiveCamera ) {

				// perspective
				const position = this.object.position;
				_v.copy( position ).sub( this.target );
				let targetDistance = _v.length();

				// half of the fov is center to top of screen
				targetDistance *= Math.tan( ( this.object.fov / 2 ) * Math.PI / 180.0 );

				// we use only clientHeight here so aspect ratio does not distort speed
				this._panLeft( 2 * deltaX * targetDistance / element.clientHeight, this.object.matrix );
				this._panUp( 2 * deltaY * targetDistance / element.clientHeight, this.object.matrix );

			} else if ( this.object.isOrthographicCamera ) {

				// orthographic
				this._panLeft( deltaX * ( this.object.right - this.object.left ) / this.object.zoom / element.clientWidth, this.object.matrix );
				this._panUp( deltaY * ( this.object.top - this.object.bottom ) / this.object.zoom / element.clientHeight, this.object.matrix );

			} else {

				// camera neither orthographic nor perspective
				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
				this.enablePan = false;

			}

		}

		_dollyOut( dollyScale ) {

			if ( this.object.isPerspectiveCamera || this.object.isOrthographicCamera ) {

				this._scale /= dollyScale;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				this.enableZoom = false;

			}

		}

		_dollyIn( dollyScale ) {

			if ( this.object.isPerspectiveCamera || this.object.isOrthographicCamera ) {

				this._scale *= dollyScale;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				this.enableZoom = false;

			}

		}

		_updateZoomParameters( x, y ) {

			if ( ! this.zoomToCursor ) {

				return;

			}

			this._performCursorZoom = true;

			const rect = this.domElement.getBoundingClientRect();
			const dx = x - rect.left;
			const dy = y - rect.top;
			const w = rect.width;
			const h = rect.height;

			this._mouse.x = ( dx / w ) * 2 - 1;
			this._mouse.y = - ( dy / h ) * 2 + 1;

			this._dollyDirection.set( this._mouse.x, this._mouse.y, 1 ).unproject( this.object ).sub( this.object.position ).normalize();

		}

		_clampDistance( dist ) {

			return Math.max( this.minDistance, Math.min( this.maxDistance, dist ) );

		}

		//
		// event callbacks - update the object state
		//

		_handleMouseDownRotate( event ) {

			this._rotateStart.set( event.clientX, event.clientY );

		}

		_handleMouseDownDolly( event ) {

			this._updateZoomParameters( event.clientX, event.clientX );
			this._dollyStart.set( event.clientX, event.clientY );

		}

		_handleMouseDownPan( event ) {

			this._panStart.set( event.clientX, event.clientY );

		}

		_handleMouseMoveRotate( event ) {

			this._rotateEnd.set( event.clientX, event.clientY );

			this._rotateDelta.subVectors( this._rotateEnd, this._rotateStart ).multiplyScalar( this.rotateSpeed );

			const element = this.domElement;

			this._rotateLeft( _twoPI * this._rotateDelta.x / element.clientHeight ); // yes, height

			this._rotateUp( _twoPI * this._rotateDelta.y / element.clientHeight );

			this._rotateStart.copy( this._rotateEnd );

			this.update();

		}

		_handleMouseMoveDolly( event ) {

			this._dollyEnd.set( event.clientX, event.clientY );

			this._dollyDelta.subVectors( this._dollyEnd, this._dollyStart );

			if ( this._dollyDelta.y > 0 ) {

				this._dollyOut( this._getZoomScale( this._dollyDelta.y ) );

			} else if ( this._dollyDelta.y < 0 ) {

				this._dollyIn( this._getZoomScale( this._dollyDelta.y ) );

			}

			this._dollyStart.copy( this._dollyEnd );

			this.update();

		}

		_handleMouseMovePan( event ) {

			this._panEnd.set( event.clientX, event.clientY );

			this._panDelta.subVectors( this._panEnd, this._panStart ).multiplyScalar( this.panSpeed );

			this._pan( this._panDelta.x, this._panDelta.y );

			this._panStart.copy( this._panEnd );

			this.update();

		}

		_handleMouseWheel( event ) {

			this._updateZoomParameters( event.clientX, event.clientY );

			if ( event.deltaY < 0 ) {

				this._dollyIn( this._getZoomScale( event.deltaY ) );

			} else if ( event.deltaY > 0 ) {

				this._dollyOut( this._getZoomScale( event.deltaY ) );

			}

			this.update();

		}

		_handleKeyDown( event ) {

			let needsUpdate = false;

			switch ( event.code ) {

				case this.keys.UP:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( this.enableRotate ) {

							this._rotateUp( _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

						}

					} else {

						if ( this.enablePan ) {

							this._pan( 0, this.keyPanSpeed );

						}

					}

					needsUpdate = true;
					break;

				case this.keys.BOTTOM:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( this.enableRotate ) {

							this._rotateUp( - _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

						}

					} else {

						if ( this.enablePan ) {

							this._pan( 0, - this.keyPanSpeed );

						}

					}

					needsUpdate = true;
					break;

				case this.keys.LEFT:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( this.enableRotate ) {

							this._rotateLeft( _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

						}

					} else {

						if ( this.enablePan ) {

							this._pan( this.keyPanSpeed, 0 );

						}

					}

					needsUpdate = true;
					break;

				case this.keys.RIGHT:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( this.enableRotate ) {

							this._rotateLeft( - _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

						}

					} else {

						if ( this.enablePan ) {

							this._pan( - this.keyPanSpeed, 0 );

						}

					}

					needsUpdate = true;
					break;

			}

			if ( needsUpdate ) {

				// prevent the browser from scrolling on cursor keys
				event.preventDefault();

				this.update();

			}


		}

		_handleTouchStartRotate( event ) {

			if ( this._pointers.length === 1 ) {

				this._rotateStart.set( event.pageX, event.pageY );

			} else {

				const position = this._getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				this._rotateStart.set( x, y );

			}

		}

		_handleTouchStartPan( event ) {

			if ( this._pointers.length === 1 ) {

				this._panStart.set( event.pageX, event.pageY );

			} else {

				const position = this._getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				this._panStart.set( x, y );

			}

		}

		_handleTouchStartDolly( event ) {

			const position = this._getSecondPointerPosition( event );

			const dx = event.pageX - position.x;
			const dy = event.pageY - position.y;

			const distance = Math.sqrt( dx * dx + dy * dy );

			this._dollyStart.set( 0, distance );

		}

		_handleTouchStartDollyPan( event ) {

			if ( this.enableZoom ) this._handleTouchStartDolly( event );

			if ( this.enablePan ) this._handleTouchStartPan( event );

		}

		_handleTouchStartDollyRotate( event ) {

			if ( this.enableZoom ) this._handleTouchStartDolly( event );

			if ( this.enableRotate ) this._handleTouchStartRotate( event );

		}

		_handleTouchMoveRotate( event ) {

			if ( this._pointers.length == 1 ) {

				this._rotateEnd.set( event.pageX, event.pageY );

			} else {

				const position = this._getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				this._rotateEnd.set( x, y );

			}

			this._rotateDelta.subVectors( this._rotateEnd, this._rotateStart ).multiplyScalar( this.rotateSpeed );

			const element = this.domElement;

			this._rotateLeft( _twoPI * this._rotateDelta.x / element.clientHeight ); // yes, height

			this._rotateUp( _twoPI * this._rotateDelta.y / element.clientHeight );

			this._rotateStart.copy( this._rotateEnd );

		}

		_handleTouchMovePan( event ) {

			if ( this._pointers.length === 1 ) {

				this._panEnd.set( event.pageX, event.pageY );

			} else {

				const position = this._getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				this._panEnd.set( x, y );

			}

			this._panDelta.subVectors( this._panEnd, this._panStart ).multiplyScalar( this.panSpeed );

			this._pan( this._panDelta.x, this._panDelta.y );

			this._panStart.copy( this._panEnd );

		}

		_handleTouchMoveDolly( event ) {

			const position = this._getSecondPointerPosition( event );

			const dx = event.pageX - position.x;
			const dy = event.pageY - position.y;

			const distance = Math.sqrt( dx * dx + dy * dy );

			this._dollyEnd.set( 0, distance );

			this._dollyDelta.set( 0, Math.pow( this._dollyEnd.y / this._dollyStart.y, this.zoomSpeed ) );

			this._dollyOut( this._dollyDelta.y );

			this._dollyStart.copy( this._dollyEnd );

			const centerX = ( event.pageX + position.x ) * 0.5;
			const centerY = ( event.pageY + position.y ) * 0.5;

			this._updateZoomParameters( centerX, centerY );

		}

		_handleTouchMoveDollyPan( event ) {

			if ( this.enableZoom ) this._handleTouchMoveDolly( event );

			if ( this.enablePan ) this._handleTouchMovePan( event );

		}

		_handleTouchMoveDollyRotate( event ) {

			if ( this.enableZoom ) this._handleTouchMoveDolly( event );

			if ( this.enableRotate ) this._handleTouchMoveRotate( event );

		}

		// pointers

		_addPointer( event ) {

			this._pointers.push( event.pointerId );

		}

		_removePointer( event ) {

			delete this._pointerPositions[ event.pointerId ];

			for ( let i = 0; i < this._pointers.length; i ++ ) {

				if ( this._pointers[ i ] == event.pointerId ) {

					this._pointers.splice( i, 1 );
					return;

				}

			}

		}

		_isTrackingPointer( event ) {

			for ( let i = 0; i < this._pointers.length; i ++ ) {

				if ( this._pointers[ i ] == event.pointerId ) return true;

			}

			return false;

		}

		_trackPointer( event ) {

			let position = this._pointerPositions[ event.pointerId ];

			if ( position === undefined ) {

				position = new three.Vector2();
				this._pointerPositions[ event.pointerId ] = position;

			}

			position.set( event.pageX, event.pageY );

		}

		_getSecondPointerPosition( event ) {

			const pointerId = ( event.pointerId === this._pointers[ 0 ] ) ? this._pointers[ 1 ] : this._pointers[ 0 ];

			return this._pointerPositions[ pointerId ];

		}

		//

		_customWheelEvent( event ) {

			const mode = event.deltaMode;

			// minimal wheel event altered to meet delta-zoom demand
			const newEvent = {
				clientX: event.clientX,
				clientY: event.clientY,
				deltaY: event.deltaY,
			};

			switch ( mode ) {

				case 1: // LINE_MODE
					newEvent.deltaY *= 16;
					break;

				case 2: // PAGE_MODE
					newEvent.deltaY *= 100;
					break;

			}

			// detect if event was triggered by pinching
			if ( event.ctrlKey && ! this._controlActive ) {

				newEvent.deltaY *= 10;

			}

			return newEvent;

		}

	}

	function onPointerDown( event ) {

		if ( this.enabled === false ) return;

		if ( this._pointers.length === 0 ) {

			this.domElement.setPointerCapture( event.pointerId );

			this.domElement.ownerDocument.addEventListener( 'pointermove', this._onPointerMove );
			this.domElement.ownerDocument.addEventListener( 'pointerup', this._onPointerUp );

		}

		//

		if ( this._isTrackingPointer( event ) ) return;

		//

		this._addPointer( event );

		if ( event.pointerType === 'touch' ) {

			this._onTouchStart( event );

		} else {

			this._onMouseDown( event );

		}

		if ( this._cursorStyle === 'grab' ) {

			this.domElement.style.cursor = 'grabbing';

		}

	}

	function onPointerMove( event ) {

		if ( this.enabled === false ) return;

		if ( event.pointerType === 'touch' ) {

			this._onTouchMove( event );

		} else {

			this._onMouseMove( event );

		}

	}

	function onPointerUp( event ) {

		this._removePointer( event );

		switch ( this._pointers.length ) {

			case 0:

				this.domElement.releasePointerCapture( event.pointerId );

				this.domElement.ownerDocument.removeEventListener( 'pointermove', this._onPointerMove );
				this.domElement.ownerDocument.removeEventListener( 'pointerup', this._onPointerUp );

				this.dispatchEvent( _endEvent );

				this.state = _STATE.NONE;

				if ( this._cursorStyle === 'grab' ) {

					this.domElement.style.cursor = 'grab';

				}

				break;

			case 1:

				const pointerId = this._pointers[ 0 ];
				const position = this._pointerPositions[ pointerId ];

				// minimal placeholder event - allows state correction on pointer-up
				this._onTouchStart( { pointerId: pointerId, pageX: position.x, pageY: position.y } );

				break;

		}

	}

	function onMouseDown( event ) {

		let mouseAction;

		switch ( event.button ) {

			case 0:

				mouseAction = this.mouseButtons.LEFT;
				break;

			case 1:

				mouseAction = this.mouseButtons.MIDDLE;
				break;

			case 2:

				mouseAction = this.mouseButtons.RIGHT;
				break;

			default:

				mouseAction = -1;

		}

		switch ( mouseAction ) {

			case three.MOUSE.DOLLY:

				if ( this.enableZoom === false ) return;

				this._handleMouseDownDolly( event );

				this.state = _STATE.DOLLY;

				break;

			case three.MOUSE.ROTATE:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( this.enablePan === false ) return;

					this._handleMouseDownPan( event );

					this.state = _STATE.PAN;

				} else {

					if ( this.enableRotate === false ) return;

					this._handleMouseDownRotate( event );

					this.state = _STATE.ROTATE;

				}

				break;

			case three.MOUSE.PAN:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( this.enableRotate === false ) return;

					this._handleMouseDownRotate( event );

					this.state = _STATE.ROTATE;

				} else {

					if ( this.enablePan === false ) return;

					this._handleMouseDownPan( event );

					this.state = _STATE.PAN;

				}

				break;

			default:

				this.state = _STATE.NONE;

		}

		if ( this.state !== _STATE.NONE ) {

			this.dispatchEvent( _startEvent );

		}

	}

	function onMouseMove( event ) {

		switch ( this.state ) {

			case _STATE.ROTATE:

				if ( this.enableRotate === false ) return;

				this._handleMouseMoveRotate( event );

				break;

			case _STATE.DOLLY:

				if ( this.enableZoom === false ) return;

				this._handleMouseMoveDolly( event );

				break;

			case _STATE.PAN:

				if ( this.enablePan === false ) return;

				this._handleMouseMovePan( event );

				break;

		}

	}

	function onMouseWheel( event ) {

		if ( this.enabled === false || this.enableZoom === false || this.state !== _STATE.NONE ) return;

		event.preventDefault();

		this.dispatchEvent( _startEvent );

		this._handleMouseWheel( this._customWheelEvent( event ) );

		this.dispatchEvent( _endEvent );

	}

	function onKeyDown( event ) {

		if ( this.enabled === false ) return;

		this._handleKeyDown( event );

	}

	function onTouchStart( event ) {

		this._trackPointer( event );

		switch ( this._pointers.length ) {

			case 1:

				switch ( this.touches.ONE ) {

					case three.TOUCH.ROTATE:

						if ( this.enableRotate === false ) return;

						this._handleTouchStartRotate( event );

						this.state = _STATE.TOUCH_ROTATE;

						break;

					case three.TOUCH.PAN:

						if ( this.enablePan === false ) return;

						this._handleTouchStartPan( event );

						this.state = _STATE.TOUCH_PAN;

						break;

					default:

						this.state = _STATE.NONE;

				}

				break;

			case 2:

				switch ( this.touches.TWO ) {

					case three.TOUCH.DOLLY_PAN:

						if ( this.enableZoom === false && this.enablePan === false ) return;

						this._handleTouchStartDollyPan( event );

						this.state = _STATE.TOUCH_DOLLY_PAN;

						break;

					case three.TOUCH.DOLLY_ROTATE:

						if ( this.enableZoom === false && this.enableRotate === false ) return;

						this._handleTouchStartDollyRotate( event );

						this.state = _STATE.TOUCH_DOLLY_ROTATE;

						break;

					default:

						this.state = _STATE.NONE;

				}

				break;

			default:

				this.state = _STATE.NONE;

		}

		if ( this.state !== _STATE.NONE ) {

			this.dispatchEvent( _startEvent );

		}

	}

	function onTouchMove( event ) {

		this._trackPointer( event );

		switch ( this.state ) {

			case _STATE.TOUCH_ROTATE:

				if ( this.enableRotate === false ) return;

				this._handleTouchMoveRotate( event );

				this.update();

				break;

			case _STATE.TOUCH_PAN:

				if ( this.enablePan === false ) return;

				this._handleTouchMovePan( event );

				this.update();

				break;

			case _STATE.TOUCH_DOLLY_PAN:

				if ( this.enableZoom === false && this.enablePan === false ) return;

				this._handleTouchMoveDollyPan( event );

				this.update();

				break;

			case _STATE.TOUCH_DOLLY_ROTATE:

				if ( this.enableZoom === false && this.enableRotate === false ) return;

				this._handleTouchMoveDollyRotate( event );

				this.update();

				break;

			default:

				this.state = _STATE.NONE;

		}

	}

	function onContextMenu( event ) {

		if ( this.enabled === false ) return;

		event.preventDefault();

	}

	function interceptControlDown( event ) {

		if ( event.key === 'Control' ) {

			this._controlActive = true;

			const document = this.domElement.getRootNode(); // offscreen canvas compatibility

			document.addEventListener( 'keyup', this._interceptControlUp, { passive: true, capture: true } );

		}

	}

	function interceptControlUp( event ) {

		if ( event.key === 'Control' ) {

			this._controlActive = false;

			const document = this.domElement.getRootNode(); // offscreen canvas compatibility

			document.removeEventListener( 'keyup', this._interceptControlUp, { passive: true, capture: true } );

		}

	}

	/**
	 * Returns a new indexed geometry based on `TrianglesDrawMode` draw mode.
	 * This mode corresponds to the `gl.TRIANGLES` primitive in WebGL.
	 *
	 * @param {BufferGeometry} geometry - The geometry to convert.
	 * @param {number} drawMode - The current draw mode.
	 * @return {BufferGeometry} The new geometry using `TrianglesDrawMode`.
	 */
	function toTrianglesDrawMode( geometry, drawMode ) {

		if ( drawMode === three.TrianglesDrawMode ) {

			console.warn( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.' );
			return geometry;

		}

		if ( drawMode === three.TriangleFanDrawMode || drawMode === three.TriangleStripDrawMode ) {

			let index = geometry.getIndex();

			// generate index if not present

			if ( index === null ) {

				const indices = [];

				const position = geometry.getAttribute( 'position' );

				if ( position !== undefined ) {

					for ( let i = 0; i < position.count; i ++ ) {

						indices.push( i );

					}

					geometry.setIndex( indices );
					index = geometry.getIndex();

				} else {

					console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.' );
					return geometry;

				}

			}

			//

			const numberOfTriangles = index.count - 2;
			const newIndices = [];

			if ( drawMode === three.TriangleFanDrawMode ) {

				// gl.TRIANGLE_FAN

				for ( let i = 1; i <= numberOfTriangles; i ++ ) {

					newIndices.push( index.getX( 0 ) );
					newIndices.push( index.getX( i ) );
					newIndices.push( index.getX( i + 1 ) );

				}

			} else {

				// gl.TRIANGLE_STRIP

				for ( let i = 0; i < numberOfTriangles; i ++ ) {

					if ( i % 2 === 0 ) {

						newIndices.push( index.getX( i ) );
						newIndices.push( index.getX( i + 1 ) );
						newIndices.push( index.getX( i + 2 ) );

					} else {

						newIndices.push( index.getX( i + 2 ) );
						newIndices.push( index.getX( i + 1 ) );
						newIndices.push( index.getX( i ) );

					}

				}

			}

			if ( ( newIndices.length / 3 ) !== numberOfTriangles ) {

				console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

			}

			// build final geometry

			const newGeometry = geometry.clone();
			newGeometry.setIndex( newIndices );
			newGeometry.clearGroups();

			return newGeometry;

		} else {

			console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
			return geometry;

		}

	}

	/**
	 * Clones the given 3D object and its descendants, ensuring that any `SkinnedMesh` instances are
	 * correctly associated with their bones. Bones are also cloned, and must be descendants of the
	 * object passed to this method. Other data, like geometries and materials, are reused by reference.
	 *
	 * @param {Object3D} source - The 3D object to clone.
	 * @return {Object3D} The cloned 3D object.
	 */
	function clone( source ) {

		const sourceLookup = new Map();
		const cloneLookup = new Map();

		const clone = source.clone();

		parallelTraverse( source, clone, function ( sourceNode, clonedNode ) {

			sourceLookup.set( clonedNode, sourceNode );
			cloneLookup.set( sourceNode, clonedNode );

		} );

		clone.traverse( function ( node ) {

			if ( ! node.isSkinnedMesh ) return;

			const clonedMesh = node;
			const sourceMesh = sourceLookup.get( node );
			const sourceBones = sourceMesh.skeleton.bones;

			clonedMesh.skeleton = sourceMesh.skeleton.clone();
			clonedMesh.bindMatrix.copy( sourceMesh.bindMatrix );

			clonedMesh.skeleton.bones = sourceBones.map( function ( bone ) {

				return cloneLookup.get( bone );

			} );

			clonedMesh.bind( clonedMesh.skeleton, clonedMesh.bindMatrix );

		} );

		return clone;

	}

	function parallelTraverse( a, b, callback ) {

		callback( a, b );

		for ( let i = 0; i < a.children.length; i ++ ) {

			parallelTraverse( a.children[ i ], b.children[ i ], callback );

		}

	}

	/**
	 * A loader for the glTF 2.0 format.
	 *
	 * [glTF](https://www.khronos.org/gltf/) (GL Transmission Format) is an [open format specification]{@link https://github.com/KhronosGroup/glTF/tree/main/specification/2.0)
	 * for efficient delivery and loading of 3D content. Assets may be provided either in JSON (.gltf) or binary (.glb)
	 * format. External files store textures (.jpg, .png) and additional binary data (.bin). A glTF asset may deliver
	 * one or more scenes, including meshes, materials, textures, skins, skeletons, morph targets, animations, lights,
	 * and/or cameras.
	 *
	 * `GLTFLoader` uses {@link ImageBitmapLoader} whenever possible. Be advised that image bitmaps are not
	 * automatically GC-collected when they are no longer referenced, and they require special handling during
	 * the disposal process.
	 *
	 * `GLTFLoader` supports the following glTF 2.0 extensions:
	 * - KHR_draco_mesh_compression
	 * - KHR_lights_punctual
	 * - KHR_materials_anisotropy
	 * - KHR_materials_clearcoat
	 * - KHR_materials_dispersion
	 * - KHR_materials_emissive_strength
	 * - KHR_materials_ior
	 * - KHR_materials_specular
	 * - KHR_materials_transmission
	 * - KHR_materials_iridescence
	 * - KHR_materials_unlit
	 * - KHR_materials_volume
	 * - KHR_mesh_quantization
	 * - KHR_meshopt_compression
	 * - KHR_texture_basisu
	 * - KHR_texture_transform
	 * - EXT_materials_bump
	 * - EXT_meshopt_compression
	 * - EXT_mesh_gpu_instancing
	 * - EXT_texture_avif
	 * - EXT_texture_webp
	 *
	 * The following glTF 2.0 extension is supported by an external user plugin:
	 * - [KHR_materials_variants](https://github.com/takahirox/three-gltf-extensions)
	 * - [MSFT_texture_dds](https://github.com/takahirox/three-gltf-extensions)
	 * - [KHR_animation_pointer](https://github.com/needle-tools/three-animation-pointer)
	 * - [NEEDLE_progressive](https://github.com/needle-tools/gltf-progressive)
	 *
	 * ```js
	 * const loader = new GLTFLoader();
	 *
	 * // Optional: Provide a DRACOLoader instance to decode compressed mesh data
	 * const dracoLoader = new DRACOLoader();
	 * dracoLoader.setDecoderPath( '/examples/jsm/libs/draco/' );
	 * loader.setDRACOLoader( dracoLoader );
	 *
	 * const gltf = await loader.loadAsync( 'models/gltf/duck/duck.gltf' );
	 * scene.add( gltf.scene );
	 * ```
	 *
	 * @augments Loader
	 * @three_import import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	 */
	class GLTFLoader extends three.Loader {

		/**
		 * Constructs a new glTF loader.
		 *
		 * @param {LoadingManager} [manager] - The loading manager.
		 */
		constructor( manager ) {

			super( manager );

			this.dracoLoader = null;
			this.ktx2Loader = null;
			this.meshoptDecoder = null;

			this.pluginCallbacks = [];

			this.register( function ( parser ) {

				return new GLTFMaterialsClearcoatExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsDispersionExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFTextureBasisUExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFTextureWebPExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFTextureAVIFExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsSheenExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsTransmissionExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsVolumeExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsIorExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsEmissiveStrengthExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsSpecularExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsIridescenceExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsAnisotropyExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMaterialsBumpExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFLightsExtension( parser );

			} );

			this.register( function ( parser ) {

				return new GLTFMeshoptCompression( parser, EXTENSIONS.EXT_MESHOPT_COMPRESSION );

			} );

			this.register( function ( parser ) {

				return new GLTFMeshoptCompression( parser, EXTENSIONS.KHR_MESHOPT_COMPRESSION );

			} );

			this.register( function ( parser ) {

				return new GLTFMeshGpuInstancing( parser );

			} );

		}

		/**
		 * Starts loading from the given URL and passes the loaded glTF asset
		 * to the `onLoad()` callback.
		 *
		 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
		 * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
		 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
		 * @param {onErrorCallback} onError - Executed when errors occur.
		 */
		load( url, onLoad, onProgress, onError ) {

			const scope = this;

			let resourcePath;

			if ( this.resourcePath !== '' ) {

				resourcePath = this.resourcePath;

			} else if ( this.path !== '' ) {

				// If a base path is set, resources will be relative paths from that plus the relative path of the gltf file
				// Example  path = 'https://my-cnd-server.com/', url = 'assets/models/model.gltf'
				// resourcePath = 'https://my-cnd-server.com/assets/models/'
				// referenced resource 'model.bin' will be loaded from 'https://my-cnd-server.com/assets/models/model.bin'
				// referenced resource '../textures/texture.png' will be loaded from 'https://my-cnd-server.com/assets/textures/texture.png'
				const relativeUrl = three.LoaderUtils.extractUrlBase( url );
				resourcePath = three.LoaderUtils.resolveURL( relativeUrl, this.path );

			} else {

				resourcePath = three.LoaderUtils.extractUrlBase( url );

			}

			// Tells the LoadingManager to track an extra item, which resolves after
			// the model is fully loaded. This means the count of items loaded will
			// be incorrect, but ensures manager.onLoad() does not fire early.
			this.manager.itemStart( url );

			const _onError = function ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );
				scope.manager.itemEnd( url );

			};

			const loader = new three.FileLoader( this.manager );

			loader.setPath( this.path );
			loader.setResponseType( 'arraybuffer' );
			loader.setRequestHeader( this.requestHeader );
			loader.setWithCredentials( this.withCredentials );

			loader.load( url, function ( data ) {

				try {

					scope.parse( data, resourcePath, function ( gltf ) {

						onLoad( gltf );

						scope.manager.itemEnd( url );

					}, _onError );

				} catch ( e ) {

					_onError( e );

				}

			}, onProgress, _onError );

		}

		/**
		 * Sets the given Draco loader to this loader. Required for decoding assets
		 * compressed with the `KHR_draco_mesh_compression` extension.
		 *
		 * @param {DRACOLoader} dracoLoader - The Draco loader to set.
		 * @return {GLTFLoader} A reference to this loader.
		 */
		setDRACOLoader( dracoLoader ) {

			this.dracoLoader = dracoLoader;
			return this;

		}

		/**
		 * Sets the given KTX2 loader to this loader. Required for loading KTX2
		 * compressed textures.
		 *
		 * @param {KTX2Loader} ktx2Loader - The KTX2 loader to set.
		 * @return {GLTFLoader} A reference to this loader.
		 */
		setKTX2Loader( ktx2Loader ) {

			this.ktx2Loader = ktx2Loader;
			return this;

		}

		/**
		 * Sets the given meshopt decoder. Required for decoding assets
		 * compressed with the `EXT_meshopt_compression` extension.
		 *
		 * @param {Object} meshoptDecoder - The meshopt decoder to set.
		 * @return {GLTFLoader} A reference to this loader.
		 */
		setMeshoptDecoder( meshoptDecoder ) {

			this.meshoptDecoder = meshoptDecoder;
			return this;

		}

		/**
		 * Registers a plugin callback. This API is internally used to implement the various
		 * glTF extensions but can also used by third-party code to add additional logic
		 * to the loader.
		 *
		 * @param {function(parser:GLTFParser)} callback - The callback function to register.
		 * @return {GLTFLoader} A reference to this loader.
		 */
		register( callback ) {

			if ( this.pluginCallbacks.indexOf( callback ) === -1 ) {

				this.pluginCallbacks.push( callback );

			}

			return this;

		}

		/**
		 * Unregisters a plugin callback.
		 *
		 * @param {Function} callback - The callback function to unregister.
		 * @return {GLTFLoader} A reference to this loader.
		 */
		unregister( callback ) {

			if ( this.pluginCallbacks.indexOf( callback ) !== -1 ) {

				this.pluginCallbacks.splice( this.pluginCallbacks.indexOf( callback ), 1 );

			}

			return this;

		}

		/**
		 * Parses the given glTF data and returns the resulting group.
		 *
		 * @param {string|ArrayBuffer} data - The raw glTF data.
		 * @param {string} path - The URL base path.
		 * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
		 * @param {onErrorCallback} onError - Executed when errors occur.
		 */
		parse( data, path, onLoad, onError ) {

			let json;
			const extensions = {};
			const plugins = {};
			const textDecoder = new TextDecoder();

			if ( typeof data === 'string' ) {

				json = JSON.parse( data );

			} else if ( data instanceof ArrayBuffer ) {

				const magic = textDecoder.decode( new Uint8Array( data, 0, 4 ) );

				if ( magic === BINARY_EXTENSION_HEADER_MAGIC ) {

					try {

						extensions[ EXTENSIONS.KHR_BINARY_GLTF ] = new GLTFBinaryExtension( data );

					} catch ( error ) {

						if ( onError ) onError( error );
						return;

					}

					json = JSON.parse( extensions[ EXTENSIONS.KHR_BINARY_GLTF ].content );

				} else {

					json = JSON.parse( textDecoder.decode( data ) );

				}

			} else {

				json = data;

			}

			if ( json.asset === undefined || json.asset.version[ 0 ] < 2 ) {

				if ( onError ) onError( new Error( 'THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.' ) );
				return;

			}

			const parser = new GLTFParser( json, {

				path: path || this.resourcePath || '',
				crossOrigin: this.crossOrigin,
				requestHeader: this.requestHeader,
				manager: this.manager,
				ktx2Loader: this.ktx2Loader,
				meshoptDecoder: this.meshoptDecoder

			} );

			parser.fileLoader.setRequestHeader( this.requestHeader );

			for ( let i = 0; i < this.pluginCallbacks.length; i ++ ) {

				const plugin = this.pluginCallbacks[ i ]( parser );

				if ( ! plugin.name ) console.error( 'THREE.GLTFLoader: Invalid plugin found: missing name' );

				plugins[ plugin.name ] = plugin;

				// Workaround to avoid determining as unknown extension
				// in addUnknownExtensionsToUserData().
				// Remove this workaround if we move all the existing
				// extension handlers to plugin system
				extensions[ plugin.name ] = true;

			}

			if ( json.extensionsUsed ) {

				for ( let i = 0; i < json.extensionsUsed.length; ++ i ) {

					const extensionName = json.extensionsUsed[ i ];
					const extensionsRequired = json.extensionsRequired || [];

					switch ( extensionName ) {

						case EXTENSIONS.KHR_MATERIALS_UNLIT:
							extensions[ extensionName ] = new GLTFMaterialsUnlitExtension();
							break;

						case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
							extensions[ extensionName ] = new GLTFDracoMeshCompressionExtension( json, this.dracoLoader );
							break;

						case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
							extensions[ extensionName ] = new GLTFTextureTransformExtension();
							break;

						case EXTENSIONS.KHR_MESH_QUANTIZATION:
							extensions[ extensionName ] = new GLTFMeshQuantizationExtension();
							break;

						default:

							if ( extensionsRequired.indexOf( extensionName ) >= 0 && plugins[ extensionName ] === undefined ) {

								console.warn( 'THREE.GLTFLoader: Unknown extension "' + extensionName + '".' );

							}

					}

				}

			}

			parser.setExtensions( extensions );
			parser.setPlugins( plugins );
			parser.parse( onLoad, onError );

		}

		/**
		 * Async version of {@link GLTFLoader#parse}.
		 *
		 * @async
		 * @param {string|ArrayBuffer} data - The raw glTF data.
		 * @param {string} path - The URL base path.
		 * @return {Promise<GLTFLoader~LoadObject>} A Promise that resolves with the loaded glTF when the parsing has been finished.
		 */
		parseAsync( data, path ) {

			const scope = this;

			return new Promise( function ( resolve, reject ) {

				scope.parse( data, path, resolve, reject );

			} );

		}

	}

	/* GLTFREGISTRY */

	function GLTFRegistry() {

		let objects = {};

		return	{

			get: function ( key ) {

				return objects[ key ];

			},

			add: function ( key, object ) {

				objects[ key ] = object;

			},

			remove: function ( key ) {

				delete objects[ key ];

			},

			removeAll: function () {

				objects = {};

			}

		};

	}

	/*********************************/
	/********** EXTENSIONS ***********/
	/*********************************/

	function getMaterialExtension( parser, materialIndex, extensionName ) {

		const materialDef = parser.json.materials[ materialIndex ];

		if ( materialDef.extensions && materialDef.extensions[ extensionName ] ) {

			return materialDef.extensions[ extensionName ];

		}

		return null;

	}

	const EXTENSIONS = {
		KHR_BINARY_GLTF: 'KHR_binary_glTF',
		KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
		KHR_LIGHTS_PUNCTUAL: 'KHR_lights_punctual',
		KHR_MATERIALS_CLEARCOAT: 'KHR_materials_clearcoat',
		KHR_MATERIALS_DISPERSION: 'KHR_materials_dispersion',
		KHR_MATERIALS_IOR: 'KHR_materials_ior',
		KHR_MATERIALS_SHEEN: 'KHR_materials_sheen',
		KHR_MATERIALS_SPECULAR: 'KHR_materials_specular',
		KHR_MATERIALS_TRANSMISSION: 'KHR_materials_transmission',
		KHR_MATERIALS_IRIDESCENCE: 'KHR_materials_iridescence',
		KHR_MATERIALS_ANISOTROPY: 'KHR_materials_anisotropy',
		KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
		KHR_MATERIALS_VOLUME: 'KHR_materials_volume',
		KHR_TEXTURE_BASISU: 'KHR_texture_basisu',
		KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
		KHR_MESH_QUANTIZATION: 'KHR_mesh_quantization',
		KHR_MATERIALS_EMISSIVE_STRENGTH: 'KHR_materials_emissive_strength',
		EXT_MATERIALS_BUMP: 'EXT_materials_bump',
		EXT_TEXTURE_WEBP: 'EXT_texture_webp',
		EXT_TEXTURE_AVIF: 'EXT_texture_avif',
		EXT_MESHOPT_COMPRESSION: 'EXT_meshopt_compression',
		KHR_MESHOPT_COMPRESSION: 'KHR_meshopt_compression',
		EXT_MESH_GPU_INSTANCING: 'EXT_mesh_gpu_instancing'
	};

	/**
	 * Punctual Lights Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_lights_punctual
	 *
	 * @private
	 */
	class GLTFLightsExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_LIGHTS_PUNCTUAL;

			// Object3D instance caches
			this.cache = { refs: {}, uses: {} };

		}

		_markDefs() {

			const parser = this.parser;
			const nodeDefs = this.parser.json.nodes || [];

			for ( let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex ++ ) {

				const nodeDef = nodeDefs[ nodeIndex ];

				if ( nodeDef.extensions
						&& nodeDef.extensions[ this.name ]
						&& nodeDef.extensions[ this.name ].light !== undefined ) {

					parser._addNodeRef( this.cache, nodeDef.extensions[ this.name ].light );

				}

			}

		}

		_loadLight( lightIndex ) {

			const parser = this.parser;
			const cacheKey = 'light:' + lightIndex;
			let dependency = parser.cache.get( cacheKey );

			if ( dependency ) return dependency;

			const json = parser.json;
			const extensions = ( json.extensions && json.extensions[ this.name ] ) || {};
			const lightDefs = extensions.lights || [];
			const lightDef = lightDefs[ lightIndex ];
			let lightNode;

			const color = new three.Color( 0xffffff );

			if ( lightDef.color !== undefined ) color.setRGB( lightDef.color[ 0 ], lightDef.color[ 1 ], lightDef.color[ 2 ], three.LinearSRGBColorSpace );

			const range = lightDef.range !== undefined ? lightDef.range : 0;

			switch ( lightDef.type ) {

				case 'directional':
					lightNode = new three.DirectionalLight( color );
					lightNode.target.position.set( 0, 0, -1 );
					lightNode.add( lightNode.target );
					break;

				case 'point':
					lightNode = new three.PointLight( color );
					lightNode.distance = range;
					break;

				case 'spot':
					lightNode = new three.SpotLight( color );
					lightNode.distance = range;
					// Handle spotlight properties.
					lightDef.spot = lightDef.spot || {};
					lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== undefined ? lightDef.spot.innerConeAngle : 0;
					lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== undefined ? lightDef.spot.outerConeAngle : Math.PI / 4.0;
					lightNode.angle = lightDef.spot.outerConeAngle;
					lightNode.penumbra = 1.0 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
					lightNode.target.position.set( 0, 0, -1 );
					lightNode.add( lightNode.target );
					break;

				default:
					throw new Error( 'THREE.GLTFLoader: Unexpected light type: ' + lightDef.type );

			}

			// Some lights (e.g. spot) default to a position other than the origin. Reset the position
			// here, because node-level parsing will only override position if explicitly specified.
			lightNode.position.set( 0, 0, 0 );

			assignExtrasToUserData( lightNode, lightDef );

			if ( lightDef.intensity !== undefined ) lightNode.intensity = lightDef.intensity;

			lightNode.name = parser.createUniqueName( lightDef.name || ( 'light_' + lightIndex ) );

			dependency = Promise.resolve( lightNode );

			parser.cache.add( cacheKey, dependency );

			return dependency;

		}

		getDependency( type, index ) {

			if ( type !== 'light' ) return;

			return this._loadLight( index );

		}

		createNodeAttachment( nodeIndex ) {

			const self = this;
			const parser = this.parser;
			const json = parser.json;
			const nodeDef = json.nodes[ nodeIndex ];
			const lightDef = ( nodeDef.extensions && nodeDef.extensions[ this.name ] ) || {};
			const lightIndex = lightDef.light;

			if ( lightIndex === undefined ) return null;

			return this._loadLight( lightIndex ).then( function ( light ) {

				return parser._getNodeRef( self.cache, lightIndex, light );

			} );

		}

	}

	/**
	 * Unlit Materials Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_unlit
	 *
	 * @private
	 */
	class GLTFMaterialsUnlitExtension {

		constructor() {

			this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;

		}

		getMaterialType() {

			return three.MeshBasicMaterial;

		}

		extendParams( materialParams, materialDef, parser ) {

			const pending = [];

			materialParams.color = new three.Color( 1.0, 1.0, 1.0 );
			materialParams.opacity = 1.0;

			const metallicRoughness = materialDef.pbrMetallicRoughness;

			if ( metallicRoughness ) {

				if ( Array.isArray( metallicRoughness.baseColorFactor ) ) {

					const array = metallicRoughness.baseColorFactor;

					materialParams.color.setRGB( array[ 0 ], array[ 1 ], array[ 2 ], three.LinearSRGBColorSpace );
					materialParams.opacity = array[ 3 ];

				}

				if ( metallicRoughness.baseColorTexture !== undefined ) {

					pending.push( parser.assignTexture( materialParams, 'map', metallicRoughness.baseColorTexture, three.SRGBColorSpace ) );

				}

			}

			return Promise.all( pending );

		}

	}

	/**
	 * Materials Emissive Strength Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/blob/5768b3ce0ef32bc39cdf1bef10b948586635ead3/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md
	 *
	 * @private
	 */
	class GLTFMaterialsEmissiveStrengthExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_EMISSIVE_STRENGTH;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			if ( extension.emissiveStrength !== undefined ) {

				materialParams.emissiveIntensity = extension.emissiveStrength;

			}

			return Promise.resolve();

		}

	}

	/**
	 * Clearcoat Materials Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_clearcoat
	 *
	 * @private
	 */
	class GLTFMaterialsClearcoatExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_CLEARCOAT;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			if ( extension.clearcoatFactor !== undefined ) {

				materialParams.clearcoat = extension.clearcoatFactor;

			}

			if ( extension.clearcoatTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'clearcoatMap', extension.clearcoatTexture ) );

			}

			if ( extension.clearcoatRoughnessFactor !== undefined ) {

				materialParams.clearcoatRoughness = extension.clearcoatRoughnessFactor;

			}

			if ( extension.clearcoatRoughnessTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'clearcoatRoughnessMap', extension.clearcoatRoughnessTexture ) );

			}

			if ( extension.clearcoatNormalTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'clearcoatNormalMap', extension.clearcoatNormalTexture ) );

				if ( extension.clearcoatNormalTexture.scale !== undefined ) {

					const scale = extension.clearcoatNormalTexture.scale;

					materialParams.clearcoatNormalScale = new three.Vector2( scale, scale );

				}

			}

			return Promise.all( pending );

		}

	}

	/**
	 * Materials dispersion Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_dispersion
	 *
	 * @private
	 */
	class GLTFMaterialsDispersionExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_DISPERSION;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			materialParams.dispersion = extension.dispersion !== undefined ? extension.dispersion : 0;

			return Promise.resolve();

		}

	}

	/**
	 * Iridescence Materials Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_iridescence
	 *
	 * @private
	 */
	class GLTFMaterialsIridescenceExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_IRIDESCENCE;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			if ( extension.iridescenceFactor !== undefined ) {

				materialParams.iridescence = extension.iridescenceFactor;

			}

			if ( extension.iridescenceTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'iridescenceMap', extension.iridescenceTexture ) );

			}

			if ( extension.iridescenceIor !== undefined ) {

				materialParams.iridescenceIOR = extension.iridescenceIor;

			}

			if ( materialParams.iridescenceThicknessRange === undefined ) {

				materialParams.iridescenceThicknessRange = [ 100, 400 ];

			}

			if ( extension.iridescenceThicknessMinimum !== undefined ) {

				materialParams.iridescenceThicknessRange[ 0 ] = extension.iridescenceThicknessMinimum;

			}

			if ( extension.iridescenceThicknessMaximum !== undefined ) {

				materialParams.iridescenceThicknessRange[ 1 ] = extension.iridescenceThicknessMaximum;

			}

			if ( extension.iridescenceThicknessTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'iridescenceThicknessMap', extension.iridescenceThicknessTexture ) );

			}

			return Promise.all( pending );

		}

	}

	/**
	 * Sheen Materials Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen
	 *
	 * @private
	 */
	class GLTFMaterialsSheenExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_SHEEN;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			materialParams.sheenColor = new three.Color( 0, 0, 0 );
			materialParams.sheenRoughness = 0;
			materialParams.sheen = 1;

			if ( extension.sheenColorFactor !== undefined ) {

				const colorFactor = extension.sheenColorFactor;
				materialParams.sheenColor.setRGB( colorFactor[ 0 ], colorFactor[ 1 ], colorFactor[ 2 ], three.LinearSRGBColorSpace );

			}

			if ( extension.sheenRoughnessFactor !== undefined ) {

				materialParams.sheenRoughness = extension.sheenRoughnessFactor;

			}

			if ( extension.sheenColorTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'sheenColorMap', extension.sheenColorTexture, three.SRGBColorSpace ) );

			}

			if ( extension.sheenRoughnessTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'sheenRoughnessMap', extension.sheenRoughnessTexture ) );

			}

			return Promise.all( pending );

		}

	}

	/**
	 * Transmission Materials Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_transmission
	 * Draft: https://github.com/KhronosGroup/glTF/pull/1698
	 *
	 * @private
	 */
	class GLTFMaterialsTransmissionExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_TRANSMISSION;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			if ( extension.transmissionFactor !== undefined ) {

				materialParams.transmission = extension.transmissionFactor;

			}

			if ( extension.transmissionTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'transmissionMap', extension.transmissionTexture ) );

			}

			return Promise.all( pending );

		}

	}

	/**
	 * Materials Volume Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_volume
	 *
	 * @private
	 */
	class GLTFMaterialsVolumeExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_VOLUME;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			materialParams.thickness = extension.thicknessFactor !== undefined ? extension.thicknessFactor : 0;

			if ( extension.thicknessTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'thicknessMap', extension.thicknessTexture ) );

			}

			materialParams.attenuationDistance = extension.attenuationDistance || Infinity;

			const colorArray = extension.attenuationColor || [ 1, 1, 1 ];
			materialParams.attenuationColor = new three.Color().setRGB( colorArray[ 0 ], colorArray[ 1 ], colorArray[ 2 ], three.LinearSRGBColorSpace );

			return Promise.all( pending );

		}

	}

	/**
	 * Materials ior Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_ior
	 *
	 * @private
	 */
	class GLTFMaterialsIorExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_IOR;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			materialParams.ior = extension.ior !== undefined ? extension.ior : 1.5;

			if ( materialParams.ior === 0 ) materialParams.ior = 1000; // see #26167

			return Promise.resolve();

		}

	}

	/**
	 * Materials specular Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_specular
	 *
	 * @private
	 */
	class GLTFMaterialsSpecularExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_SPECULAR;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			materialParams.specularIntensity = extension.specularFactor !== undefined ? extension.specularFactor : 1.0;

			if ( extension.specularTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'specularIntensityMap', extension.specularTexture ) );

			}

			const colorArray = extension.specularColorFactor || [ 1, 1, 1 ];
			materialParams.specularColor = new three.Color().setRGB( colorArray[ 0 ], colorArray[ 1 ], colorArray[ 2 ], three.LinearSRGBColorSpace );

			if ( extension.specularColorTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'specularColorMap', extension.specularColorTexture, three.SRGBColorSpace ) );

			}

			return Promise.all( pending );

		}

	}


	/**
	 * Materials bump Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/EXT_materials_bump
	 *
	 * @private
	 */
	class GLTFMaterialsBumpExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.EXT_MATERIALS_BUMP;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			materialParams.bumpScale = extension.bumpFactor !== undefined ? extension.bumpFactor : 1.0;

			if ( extension.bumpTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'bumpMap', extension.bumpTexture ) );

			}

			return Promise.all( pending );

		}

	}

	/**
	 * Materials anisotropy Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_anisotropy
	 *
	 * @private
	 */
	class GLTFMaterialsAnisotropyExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_MATERIALS_ANISOTROPY;

		}

		getMaterialType( materialIndex ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			return extension !== null ? three.MeshPhysicalMaterial : null;

		}

		extendMaterialParams( materialIndex, materialParams ) {

			const extension = getMaterialExtension( this.parser, materialIndex, this.name );

			if ( extension === null ) return Promise.resolve();

			const pending = [];

			if ( extension.anisotropyStrength !== undefined ) {

				materialParams.anisotropy = extension.anisotropyStrength;

			}

			if ( extension.anisotropyRotation !== undefined ) {

				materialParams.anisotropyRotation = extension.anisotropyRotation;

			}

			if ( extension.anisotropyTexture !== undefined ) {

				pending.push( this.parser.assignTexture( materialParams, 'anisotropyMap', extension.anisotropyTexture ) );

			}

			return Promise.all( pending );

		}

	}

	/**
	 * BasisU Texture Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_texture_basisu
	 *
	 * @private
	 */
	class GLTFTextureBasisUExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.KHR_TEXTURE_BASISU;

		}

		loadTexture( textureIndex ) {

			const parser = this.parser;
			const json = parser.json;

			const textureDef = json.textures[ textureIndex ];

			if ( ! textureDef.extensions || ! textureDef.extensions[ this.name ] ) {

				return null;

			}

			const extension = textureDef.extensions[ this.name ];
			const loader = parser.options.ktx2Loader;

			if ( ! loader ) {

				if ( json.extensionsRequired && json.extensionsRequired.indexOf( this.name ) >= 0 ) {

					throw new Error( 'THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures' );

				} else {

					// Assumes that the extension is optional and that a fallback texture is present
					return null;

				}

			}

			return parser.loadTextureImage( textureIndex, extension.source, loader );

		}

	}

	/**
	 * WebP Texture Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_texture_webp
	 *
	 * @private
	 */
	class GLTFTextureWebPExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.EXT_TEXTURE_WEBP;

		}

		loadTexture( textureIndex ) {

			const name = this.name;
			const parser = this.parser;
			const json = parser.json;

			const textureDef = json.textures[ textureIndex ];

			if ( ! textureDef.extensions || ! textureDef.extensions[ name ] ) {

				return null;

			}

			const extension = textureDef.extensions[ name ];
			const source = json.images[ extension.source ];

			let loader = parser.textureLoader;
			if ( source.uri ) {

				const handler = parser.options.manager.getHandler( source.uri );
				if ( handler !== null ) loader = handler;

			}

			return parser.loadTextureImage( textureIndex, extension.source, loader );

		}

	}

	/**
	 * AVIF Texture Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_texture_avif
	 *
	 * @private
	 */
	class GLTFTextureAVIFExtension {

		constructor( parser ) {

			this.parser = parser;
			this.name = EXTENSIONS.EXT_TEXTURE_AVIF;

		}

		loadTexture( textureIndex ) {

			const name = this.name;
			const parser = this.parser;
			const json = parser.json;

			const textureDef = json.textures[ textureIndex ];

			if ( ! textureDef.extensions || ! textureDef.extensions[ name ] ) {

				return null;

			}

			const extension = textureDef.extensions[ name ];
			const source = json.images[ extension.source ];

			let loader = parser.textureLoader;
			if ( source.uri ) {

				const handler = parser.options.manager.getHandler( source.uri );
				if ( handler !== null ) loader = handler;

			}

			return parser.loadTextureImage( textureIndex, extension.source, loader );

		}

	}

	/**
	 * meshopt BufferView Compression Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_meshopt_compression
	 *
	 * @private
	 */
	class GLTFMeshoptCompression {

		constructor( parser, name ) {

			this.name = name;
			this.parser = parser;

		}

		loadBufferView( index ) {

			const json = this.parser.json;
			const bufferView = json.bufferViews[ index ];

			if ( bufferView.extensions && bufferView.extensions[ this.name ] ) {

				const extensionDef = bufferView.extensions[ this.name ];

				const buffer = this.parser.getDependency( 'buffer', extensionDef.buffer );
				const decoder = this.parser.options.meshoptDecoder;

				if ( ! decoder || ! decoder.supported ) {

					if ( json.extensionsRequired && json.extensionsRequired.indexOf( this.name ) >= 0 ) {

						throw new Error( 'THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files' );

					} else {

						// Assumes that the extension is optional and that fallback buffer data is present
						return null;

					}

				}

				return buffer.then( function ( res ) {

					const byteOffset = extensionDef.byteOffset || 0;
					const byteLength = extensionDef.byteLength || 0;

					const count = extensionDef.count;
					const stride = extensionDef.byteStride;

					const source = new Uint8Array( res, byteOffset, byteLength );

					if ( decoder.decodeGltfBufferAsync ) {

						return decoder.decodeGltfBufferAsync( count, stride, source, extensionDef.mode, extensionDef.filter ).then( function ( res ) {

							return res.buffer;

						} );

					} else {

						// Support for MeshoptDecoder 0.18 or earlier, without decodeGltfBufferAsync
						return decoder.ready.then( function () {

							const result = new ArrayBuffer( count * stride );
							decoder.decodeGltfBuffer( new Uint8Array( result ), count, stride, source, extensionDef.mode, extensionDef.filter );
							return result;

						} );

					}

				} );

			} else {

				return null;

			}

		}

	}

	/**
	 * GPU Instancing Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_mesh_gpu_instancing
	 *
	 * @private
	 */
	class GLTFMeshGpuInstancing {

		constructor( parser ) {

			this.name = EXTENSIONS.EXT_MESH_GPU_INSTANCING;
			this.parser = parser;

		}

		createNodeMesh( nodeIndex ) {

			const json = this.parser.json;
			const nodeDef = json.nodes[ nodeIndex ];

			if ( ! nodeDef.extensions || ! nodeDef.extensions[ this.name ] ||
				nodeDef.mesh === undefined ) {

				return null;

			}

			const meshDef = json.meshes[ nodeDef.mesh ];

			// No Points or Lines + Instancing support yet

			for ( const primitive of meshDef.primitives ) {

				if ( primitive.mode !== WEBGL_CONSTANTS.TRIANGLES &&
					 primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_STRIP &&
					 primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_FAN &&
					 primitive.mode !== undefined ) {

					return null;

				}

			}

			const extensionDef = nodeDef.extensions[ this.name ];
			const attributesDef = extensionDef.attributes;

			// @TODO: Can we support InstancedMesh + SkinnedMesh?

			const pending = [];
			const attributes = {};

			for ( const key in attributesDef ) {

				pending.push( this.parser.getDependency( 'accessor', attributesDef[ key ] ).then( accessor => {

					attributes[ key ] = accessor;
					return attributes[ key ];

				} ) );

			}

			if ( pending.length < 1 ) {

				return null;

			}

			pending.push( this.parser.createNodeMesh( nodeIndex ) );

			return Promise.all( pending ).then( results => {

				const nodeObject = results.pop();
				const meshes = nodeObject.isGroup ? nodeObject.children : [ nodeObject ];
				const count = results[ 0 ].count; // All attribute counts should be same
				const instancedMeshes = [];

				for ( const mesh of meshes ) {

					// Temporal variables
					const m = new three.Matrix4();
					const p = new three.Vector3();
					const q = new three.Quaternion();
					const s = new three.Vector3( 1, 1, 1 );

					const instancedMesh = new three.InstancedMesh( mesh.geometry, mesh.material, count );

					for ( let i = 0; i < count; i ++ ) {

						if ( attributes.TRANSLATION ) {

							p.fromBufferAttribute( attributes.TRANSLATION, i );

						}

						if ( attributes.ROTATION ) {

							q.fromBufferAttribute( attributes.ROTATION, i );

						}

						if ( attributes.SCALE ) {

							s.fromBufferAttribute( attributes.SCALE, i );

						}

						instancedMesh.setMatrixAt( i, m.compose( p, q, s ) );

					}

					// Add instance attributes to the geometry, excluding TRS.
					for ( const attributeName in attributes ) {

						if ( attributeName === '_COLOR_0' ) {

							const attr = attributes[ attributeName ];
							instancedMesh.instanceColor = new three.InstancedBufferAttribute( attr.array, attr.itemSize, attr.normalized );

						} else if ( attributeName !== 'TRANSLATION' &&
							 attributeName !== 'ROTATION' &&
							 attributeName !== 'SCALE' ) {

							mesh.geometry.setAttribute( attributeName, attributes[ attributeName ] );

						}

					}

					// Just in case
					three.Object3D.prototype.copy.call( instancedMesh, mesh );

					this.parser.assignFinalMaterial( instancedMesh );

					instancedMeshes.push( instancedMesh );

				}

				if ( nodeObject.isGroup ) {

					nodeObject.clear();

					nodeObject.add( ... instancedMeshes );

					return nodeObject;

				}

				return instancedMeshes[ 0 ];

			} );

		}

	}

	/* BINARY EXTENSION */
	const BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
	const BINARY_EXTENSION_HEADER_LENGTH = 12;
	const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4E4F534A, BIN: 0x004E4942 };

	class GLTFBinaryExtension {

		constructor( data ) {

			this.name = EXTENSIONS.KHR_BINARY_GLTF;
			this.content = null;
			this.body = null;

			const headerView = new DataView( data, 0, BINARY_EXTENSION_HEADER_LENGTH );
			const textDecoder = new TextDecoder();

			this.header = {
				magic: textDecoder.decode( new Uint8Array( data.slice( 0, 4 ) ) ),
				version: headerView.getUint32( 4, true ),
				length: headerView.getUint32( 8, true )
			};

			if ( this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC ) {

				throw new Error( 'THREE.GLTFLoader: Unsupported glTF-Binary header.' );

			} else if ( this.header.version < 2.0 ) {

				throw new Error( 'THREE.GLTFLoader: Legacy binary file detected.' );

			}

			const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
			const chunkView = new DataView( data, BINARY_EXTENSION_HEADER_LENGTH );
			let chunkIndex = 0;

			while ( chunkIndex < chunkContentsLength ) {

				const chunkLength = chunkView.getUint32( chunkIndex, true );
				chunkIndex += 4;

				const chunkType = chunkView.getUint32( chunkIndex, true );
				chunkIndex += 4;

				if ( chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON ) {

					const contentArray = new Uint8Array( data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength );
					this.content = textDecoder.decode( contentArray );

				} else if ( chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN ) {

					const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
					this.body = data.slice( byteOffset, byteOffset + chunkLength );

				}

				// Clients must ignore chunks with unknown types.

				chunkIndex += chunkLength;

			}

			if ( this.content === null ) {

				throw new Error( 'THREE.GLTFLoader: JSON content not found.' );

			}

		}

	}

	/**
	 * DRACO Mesh Compression Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_draco_mesh_compression
	 *
	 * @private
	 */
	class GLTFDracoMeshCompressionExtension {

		constructor( json, dracoLoader ) {

			if ( ! dracoLoader ) {

				throw new Error( 'THREE.GLTFLoader: No DRACOLoader instance provided.' );

			}

			this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
			this.json = json;
			this.dracoLoader = dracoLoader;
			this.dracoLoader.preload();

		}

		decodePrimitive( primitive, parser ) {

			const json = this.json;
			const dracoLoader = this.dracoLoader;
			const bufferViewIndex = primitive.extensions[ this.name ].bufferView;
			const gltfAttributeMap = primitive.extensions[ this.name ].attributes;
			const threeAttributeMap = {};
			const attributeNormalizedMap = {};
			const attributeTypeMap = {};

			for ( const attributeName in gltfAttributeMap ) {

				const threeAttributeName = ATTRIBUTES[ attributeName ] || attributeName.toLowerCase();

				threeAttributeMap[ threeAttributeName ] = gltfAttributeMap[ attributeName ];

			}

			for ( const attributeName in primitive.attributes ) {

				const threeAttributeName = ATTRIBUTES[ attributeName ] || attributeName.toLowerCase();

				if ( gltfAttributeMap[ attributeName ] !== undefined ) {

					const accessorDef = json.accessors[ primitive.attributes[ attributeName ] ];
					const componentType = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];

					attributeTypeMap[ threeAttributeName ] = componentType.name;
					attributeNormalizedMap[ threeAttributeName ] = accessorDef.normalized === true;

				}

			}

			return parser.getDependency( 'bufferView', bufferViewIndex ).then( function ( bufferView ) {

				return new Promise( function ( resolve, reject ) {

					dracoLoader.decodeDracoFile( bufferView, function ( geometry ) {

						for ( const attributeName in geometry.attributes ) {

							const attribute = geometry.attributes[ attributeName ];
							const normalized = attributeNormalizedMap[ attributeName ];

							if ( normalized !== undefined ) attribute.normalized = normalized;

						}

						resolve( geometry );

					}, threeAttributeMap, attributeTypeMap, three.LinearSRGBColorSpace, reject );

				} );

			} );

		}

	}

	/**
	 * Texture Transform Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_texture_transform
	 *
	 * @private
	 */
	class GLTFTextureTransformExtension {

		constructor() {

			this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;

		}

		extendTexture( texture, transform ) {

			if ( ( transform.texCoord === undefined || transform.texCoord === texture.channel )
				&& transform.offset === undefined
				&& transform.rotation === undefined
				&& transform.scale === undefined ) {

				// See https://github.com/mrdoob/three.js/issues/21819.
				return texture;

			}

			texture = texture.clone();

			if ( transform.texCoord !== undefined ) {

				texture.channel = transform.texCoord;

			}

			if ( transform.offset !== undefined ) {

				texture.offset.fromArray( transform.offset );

			}

			if ( transform.rotation !== undefined ) {

				texture.rotation = transform.rotation;

			}

			if ( transform.scale !== undefined ) {

				texture.repeat.fromArray( transform.scale );

			}

			texture.needsUpdate = true;

			return texture;

		}

	}

	/**
	 * Mesh Quantization Extension
	 *
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization
	 *
	 * @private
	 */
	class GLTFMeshQuantizationExtension {

		constructor() {

			this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;

		}

	}

	/*********************************/
	/********** INTERPOLATION ********/
	/*********************************/

	// Spline Interpolation
	// Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#appendix-c-spline-interpolation
	class GLTFCubicSplineInterpolant extends three.Interpolant {

		constructor( parameterPositions, sampleValues, sampleSize, resultBuffer ) {

			super( parameterPositions, sampleValues, sampleSize, resultBuffer );

		}

		copySampleValue_( index ) {

			// Copies a sample value to the result buffer. See description of glTF
			// CUBICSPLINE values layout in interpolate_() function below.

			const result = this.resultBuffer,
				values = this.sampleValues,
				valueSize = this.valueSize,
				offset = index * valueSize * 3 + valueSize;

			for ( let i = 0; i !== valueSize; i ++ ) {

				result[ i ] = values[ offset + i ];

			}

			return result;

		}

		interpolate_( i1, t0, t, t1 ) {

			const result = this.resultBuffer;
			const values = this.sampleValues;
			const stride = this.valueSize;

			const stride2 = stride * 2;
			const stride3 = stride * 3;

			const td = t1 - t0;

			const p = ( t - t0 ) / td;
			const pp = p * p;
			const ppp = pp * p;

			const offset1 = i1 * stride3;
			const offset0 = offset1 - stride3;

			const s2 = -2 * ppp + 3 * pp;
			const s3 = ppp - pp;
			const s0 = 1 - s2;
			const s1 = s3 - pp + p;

			// Layout of keyframe output values for CUBICSPLINE animations:
			//   [ inTangent_1, splineVertex_1, outTangent_1, inTangent_2, splineVertex_2, ... ]
			for ( let i = 0; i !== stride; i ++ ) {

				const p0 = values[ offset0 + i + stride ]; // splineVertex_k
				const m0 = values[ offset0 + i + stride2 ] * td; // outTangent_k * (t_k+1 - t_k)
				const p1 = values[ offset1 + i + stride ]; // splineVertex_k+1
				const m1 = values[ offset1 + i ] * td; // inTangent_k+1 * (t_k+1 - t_k)

				result[ i ] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;

			}

			return result;

		}

	}

	const _quaternion = new three.Quaternion();

	class GLTFCubicSplineQuaternionInterpolant extends GLTFCubicSplineInterpolant {

		interpolate_( i1, t0, t, t1 ) {

			const result = super.interpolate_( i1, t0, t, t1 );

			_quaternion.fromArray( result ).normalize().toArray( result );

			return result;

		}

	}


	/*********************************/
	/********** INTERNALS ************/
	/*********************************/

	/* CONSTANTS */

	const WEBGL_CONSTANTS = {
		POINTS: 0,
		LINES: 1,
		LINE_LOOP: 2,
		LINE_STRIP: 3,
		TRIANGLES: 4,
		TRIANGLE_STRIP: 5,
		TRIANGLE_FAN: 6};

	const WEBGL_COMPONENT_TYPES = {
		5120: Int8Array,
		5121: Uint8Array,
		5122: Int16Array,
		5123: Uint16Array,
		5125: Uint32Array,
		5126: Float32Array
	};

	const WEBGL_FILTERS = {
		9728: three.NearestFilter,
		9729: three.LinearFilter,
		9984: three.NearestMipmapNearestFilter,
		9985: three.LinearMipmapNearestFilter,
		9986: three.NearestMipmapLinearFilter,
		9987: three.LinearMipmapLinearFilter
	};

	const WEBGL_WRAPPINGS = {
		33071: three.ClampToEdgeWrapping,
		33648: three.MirroredRepeatWrapping,
		10497: three.RepeatWrapping
	};

	const WEBGL_TYPE_SIZES = {
		'SCALAR': 1,
		'VEC2': 2,
		'VEC3': 3,
		'VEC4': 4,
		'MAT2': 4,
		'MAT3': 9,
		'MAT4': 16
	};

	const ATTRIBUTES = {
		POSITION: 'position',
		NORMAL: 'normal',
		TANGENT: 'tangent',
		TEXCOORD_0: 'uv',
		TEXCOORD_1: 'uv1',
		TEXCOORD_2: 'uv2',
		TEXCOORD_3: 'uv3',
		COLOR_0: 'color',
		WEIGHTS_0: 'skinWeight',
		JOINTS_0: 'skinIndex',
	};

	const PATH_PROPERTIES = {
		scale: 'scale',
		translation: 'position',
		rotation: 'quaternion',
		weights: 'morphTargetInfluences'
	};

	const INTERPOLATION = {
		CUBICSPLINE: undefined, // We use a custom interpolant (GLTFCubicSplineInterpolation) for CUBICSPLINE tracks. Each
			                        // keyframe track will be initialized with a default interpolation type, then modified.
		LINEAR: three.InterpolateLinear,
		STEP: three.InterpolateDiscrete
	};

	const ALPHA_MODES = {
		OPAQUE: 'OPAQUE',
		MASK: 'MASK',
		BLEND: 'BLEND'
	};

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#default-material
	 *
	 * @private
	 * @param {Object<string, Material>} cache
	 * @return {Material}
	 */
	function createDefaultMaterial( cache ) {

		if ( cache[ 'DefaultMaterial' ] === undefined ) {

			cache[ 'DefaultMaterial' ] = new three.MeshStandardMaterial( {
				color: 0xFFFFFF,
				emissive: 0x000000,
				metalness: 1,
				roughness: 1,
				transparent: false,
				depthTest: true,
				side: three.FrontSide
			} );

		}

		return cache[ 'DefaultMaterial' ];

	}

	function addUnknownExtensionsToUserData( knownExtensions, object, objectDef ) {

		// Add unknown glTF extensions to an object's userData.

		for ( const name in objectDef.extensions ) {

			if ( knownExtensions[ name ] === undefined ) {

				object.userData.gltfExtensions = object.userData.gltfExtensions || {};
				object.userData.gltfExtensions[ name ] = objectDef.extensions[ name ];

			}

		}

	}

	/**
	 *
	 * @private
	 * @param {Object3D|Material|BufferGeometry|Object|AnimationClip} object
	 * @param {GLTF.definition} gltfDef
	 */
	function assignExtrasToUserData( object, gltfDef ) {

		if ( gltfDef.extras !== undefined ) {

			if ( typeof gltfDef.extras === 'object' ) {

				Object.assign( object.userData, gltfDef.extras );

			} else {

				console.warn( 'THREE.GLTFLoader: Ignoring primitive type .extras, ' + gltfDef.extras );

			}

		}

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#morph-targets
	 *
	 * @private
	 * @param {BufferGeometry} geometry
	 * @param {Array<GLTF.Target>} targets
	 * @param {GLTFParser} parser
	 * @return {Promise<BufferGeometry>}
	 */
	function addMorphTargets( geometry, targets, parser ) {

		let hasMorphPosition = false;
		let hasMorphNormal = false;
		let hasMorphColor = false;

		for ( let i = 0, il = targets.length; i < il; i ++ ) {

			const target = targets[ i ];

			if ( target.POSITION !== undefined ) hasMorphPosition = true;
			if ( target.NORMAL !== undefined ) hasMorphNormal = true;
			if ( target.COLOR_0 !== undefined ) hasMorphColor = true;

			if ( hasMorphPosition && hasMorphNormal && hasMorphColor ) break;

		}

		if ( ! hasMorphPosition && ! hasMorphNormal && ! hasMorphColor ) return Promise.resolve( geometry );

		const pendingPositionAccessors = [];
		const pendingNormalAccessors = [];
		const pendingColorAccessors = [];

		for ( let i = 0, il = targets.length; i < il; i ++ ) {

			const target = targets[ i ];

			if ( hasMorphPosition ) {

				const pendingAccessor = target.POSITION !== undefined
					? parser.getDependency( 'accessor', target.POSITION )
					: geometry.attributes.position;

				pendingPositionAccessors.push( pendingAccessor );

			}

			if ( hasMorphNormal ) {

				const pendingAccessor = target.NORMAL !== undefined
					? parser.getDependency( 'accessor', target.NORMAL )
					: geometry.attributes.normal;

				pendingNormalAccessors.push( pendingAccessor );

			}

			if ( hasMorphColor ) {

				const pendingAccessor = target.COLOR_0 !== undefined
					? parser.getDependency( 'accessor', target.COLOR_0 )
					: geometry.attributes.color;

				pendingColorAccessors.push( pendingAccessor );

			}

		}

		return Promise.all( [
			Promise.all( pendingPositionAccessors ),
			Promise.all( pendingNormalAccessors ),
			Promise.all( pendingColorAccessors )
		] ).then( function ( accessors ) {

			const morphPositions = accessors[ 0 ];
			const morphNormals = accessors[ 1 ];
			const morphColors = accessors[ 2 ];

			if ( hasMorphPosition ) geometry.morphAttributes.position = morphPositions;
			if ( hasMorphNormal ) geometry.morphAttributes.normal = morphNormals;
			if ( hasMorphColor ) geometry.morphAttributes.color = morphColors;
			geometry.morphTargetsRelative = true;

			return geometry;

		} );

	}

	/**
	 *
	 * @private
	 * @param {Mesh} mesh
	 * @param {GLTF.Mesh} meshDef
	 */
	function updateMorphTargets( mesh, meshDef ) {

		mesh.updateMorphTargets();

		if ( meshDef.weights !== undefined ) {

			for ( let i = 0, il = meshDef.weights.length; i < il; i ++ ) {

				mesh.morphTargetInfluences[ i ] = meshDef.weights[ i ];

			}

		}

		// .extras has user-defined data, so check that .extras.targetNames is an array.
		if ( meshDef.extras && Array.isArray( meshDef.extras.targetNames ) ) {

			const targetNames = meshDef.extras.targetNames;

			if ( mesh.morphTargetInfluences.length === targetNames.length ) {

				mesh.morphTargetDictionary = {};

				for ( let i = 0, il = targetNames.length; i < il; i ++ ) {

					mesh.morphTargetDictionary[ targetNames[ i ] ] = i;

				}

			} else {

				console.warn( 'THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.' );

			}

		}

	}

	function createPrimitiveKey( primitiveDef ) {

		let geometryKey;

		const dracoExtension = primitiveDef.extensions && primitiveDef.extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ];

		if ( dracoExtension ) {

			geometryKey = 'draco:' + dracoExtension.bufferView
					+ ':' + dracoExtension.indices
					+ ':' + createAttributesKey( dracoExtension.attributes );

		} else {

			geometryKey = primitiveDef.indices + ':' + createAttributesKey( primitiveDef.attributes ) + ':' + primitiveDef.mode;

		}

		if ( primitiveDef.targets !== undefined ) {

			for ( let i = 0, il = primitiveDef.targets.length; i < il; i ++ ) {

				geometryKey += ':' + createAttributesKey( primitiveDef.targets[ i ] );

			}

		}

		return geometryKey;

	}

	function createAttributesKey( attributes ) {

		let attributesKey = '';

		const keys = Object.keys( attributes ).sort();

		for ( let i = 0, il = keys.length; i < il; i ++ ) {

			attributesKey += keys[ i ] + ':' + attributes[ keys[ i ] ] + ';';

		}

		return attributesKey;

	}

	function getNormalizedComponentScale( constructor ) {

		// Reference:
		// https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#encoding-quantized-data

		switch ( constructor ) {

			case Int8Array:
				return 1 / 127;

			case Uint8Array:
				return 1 / 255;

			case Int16Array:
				return 1 / 32767;

			case Uint16Array:
				return 1 / 65535;

			default:
				throw new Error( 'THREE.GLTFLoader: Unsupported normalized accessor component type.' );

		}

	}

	function getImageURIMimeType( uri ) {

		if ( uri.search( /\.jpe?g($|\?)/i ) > 0 || uri.search( /^data\:image\/jpeg/ ) === 0 ) return 'image/jpeg';
		if ( uri.search( /\.webp($|\?)/i ) > 0 || uri.search( /^data\:image\/webp/ ) === 0 ) return 'image/webp';
		if ( uri.search( /\.ktx2($|\?)/i ) > 0 || uri.search( /^data\:image\/ktx2/ ) === 0 ) return 'image/ktx2';

		return 'image/png';

	}

	const _identityMatrix = new three.Matrix4();

	/* GLTF PARSER */

	class GLTFParser {

		constructor( json = {}, options = {} ) {

			this.json = json;
			this.extensions = {};
			this.plugins = {};
			this.options = options;

			// loader object cache
			this.cache = new GLTFRegistry();

			// associations between Three.js objects and glTF elements
			this.associations = new Map();

			// BufferGeometry caching
			this.primitiveCache = {};

			// Node cache
			this.nodeCache = {};

			// Object3D instance caches
			this.meshCache = { refs: {}, uses: {} };
			this.cameraCache = { refs: {}, uses: {} };
			this.lightCache = { refs: {}, uses: {} };

			this.sourceCache = {};
			this.textureCache = {};

			// Track node names, to ensure no duplicates
			this.nodeNamesUsed = {};

			// Use an ImageBitmapLoader if imageBitmaps are supported. Moves much of the
			// expensive work of uploading a texture to the GPU off the main thread.

			let isSafari = false;
			let safariVersion = -1;
			let isFirefox = false;
			let firefoxVersion = -1;

			if ( typeof navigator !== 'undefined' && typeof navigator.userAgent !== 'undefined' ) {

				const userAgent = navigator.userAgent;

				isSafari = /^((?!chrome|android).)*safari/i.test( userAgent ) === true;
				const safariMatch = userAgent.match( /Version\/(\d+)/ );
				safariVersion = isSafari && safariMatch ? parseInt( safariMatch[ 1 ], 10 ) : -1;

				isFirefox = userAgent.indexOf( 'Firefox' ) > -1;
				firefoxVersion = isFirefox ? userAgent.match( /Firefox\/([0-9]+)\./ )[ 1 ] : -1;

			}

			if ( typeof createImageBitmap === 'undefined' || ( isSafari && safariVersion < 17 ) || ( isFirefox && firefoxVersion < 98 ) ) {

				this.textureLoader = new three.TextureLoader( this.options.manager );

			} else {

				this.textureLoader = new three.ImageBitmapLoader( this.options.manager );

			}

			this.textureLoader.setCrossOrigin( this.options.crossOrigin );
			this.textureLoader.setRequestHeader( this.options.requestHeader );

			this.fileLoader = new three.FileLoader( this.options.manager );
			this.fileLoader.setResponseType( 'arraybuffer' );

			if ( this.options.crossOrigin === 'use-credentials' ) {

				this.fileLoader.setWithCredentials( true );

			}

		}

		setExtensions( extensions ) {

			this.extensions = extensions;

		}

		setPlugins( plugins ) {

			this.plugins = plugins;

		}

		parse( onLoad, onError ) {

			const parser = this;
			const json = this.json;
			const extensions = this.extensions;

			// Clear the loader cache
			this.cache.removeAll();
			this.nodeCache = {};

			// Mark the special nodes/meshes in json for efficient parse
			this._invokeAll( function ( ext ) {

				return ext._markDefs && ext._markDefs();

			} );

			Promise.all( this._invokeAll( function ( ext ) {

				return ext.beforeRoot && ext.beforeRoot();

			} ) ).then( function () {

				return Promise.all( [

					parser.getDependencies( 'scene' ),
					parser.getDependencies( 'animation' ),
					parser.getDependencies( 'camera' ),

				] );

			} ).then( function ( dependencies ) {

				const result = {
					scene: dependencies[ 0 ][ json.scene || 0 ],
					scenes: dependencies[ 0 ],
					animations: dependencies[ 1 ],
					cameras: dependencies[ 2 ],
					asset: json.asset,
					parser: parser,
					userData: {}
				};

				addUnknownExtensionsToUserData( extensions, result, json );

				assignExtrasToUserData( result, json );

				return Promise.all( parser._invokeAll( function ( ext ) {

					return ext.afterRoot && ext.afterRoot( result );

				} ) ).then( function () {

					for ( const scene of result.scenes ) {

						scene.updateMatrixWorld();

					}

					onLoad( result );

				} );

			} ).catch( onError );

		}

		/**
		 * Marks the special nodes/meshes in json for efficient parse.
		 *
		 * @private
		 */
		_markDefs() {

			const nodeDefs = this.json.nodes || [];
			const skinDefs = this.json.skins || [];
			const meshDefs = this.json.meshes || [];

			// Nothing in the node definition indicates whether it is a Bone or an
			// Object3D. Use the skins' joint references to mark bones.
			for ( let skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex ++ ) {

				const joints = skinDefs[ skinIndex ].joints;

				for ( let i = 0, il = joints.length; i < il; i ++ ) {

					nodeDefs[ joints[ i ] ].isBone = true;

				}

			}

			// Iterate over all nodes, marking references to shared resources,
			// as well as skeleton joints.
			for ( let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex ++ ) {

				const nodeDef = nodeDefs[ nodeIndex ];

				if ( nodeDef.mesh !== undefined ) {

					this._addNodeRef( this.meshCache, nodeDef.mesh );

					// Nothing in the mesh definition indicates whether it is
					// a SkinnedMesh or Mesh. Use the node's mesh reference
					// to mark SkinnedMesh if node has skin.
					if ( nodeDef.skin !== undefined ) {

						meshDefs[ nodeDef.mesh ].isSkinnedMesh = true;

					}

				}

				if ( nodeDef.camera !== undefined ) {

					this._addNodeRef( this.cameraCache, nodeDef.camera );

				}

			}

		}

		/**
		 * Counts references to shared node / Object3D resources. These resources
		 * can be reused, or "instantiated", at multiple nodes in the scene
		 * hierarchy. Mesh, Camera, and Light instances are instantiated and must
		 * be marked. Non-scenegraph resources (like Materials, Geometries, and
		 * Textures) can be reused directly and are not marked here.
		 *
		 * Example: CesiumMilkTruck sample model reuses "Wheel" meshes.
		 *
		 * @private
		 * @param {Object} cache
		 * @param {Object3D} index
		 */
		_addNodeRef( cache, index ) {

			if ( index === undefined ) return;

			if ( cache.refs[ index ] === undefined ) {

				cache.refs[ index ] = cache.uses[ index ] = 0;

			}

			cache.refs[ index ] ++;

		}

		/**
		 * Returns a reference to a shared resource, cloning it if necessary.
		 *
		 * @private
		 * @param {Object} cache
		 * @param {number} index
		 * @param {Object} object
		 * @return {Object}
		 */
		_getNodeRef( cache, index, object ) {

			if ( cache.refs[ index ] <= 1 ) return object;

			const ref = object.clone();

			// Propagates mappings to the cloned object, prevents mappings on the
			// original object from being lost.
			const updateMappings = ( original, clone ) => {

				const mappings = this.associations.get( original );
				if ( mappings != null ) {

					this.associations.set( clone, mappings );

				}

				for ( const [ i, child ] of original.children.entries() ) {

					updateMappings( child, clone.children[ i ] );

				}

			};

			updateMappings( object, ref );

			ref.name += '_instance_' + ( cache.uses[ index ] ++ );

			return ref;

		}

		_invokeOne( func ) {

			const extensions = Object.values( this.plugins );
			extensions.push( this );

			for ( let i = 0; i < extensions.length; i ++ ) {

				const result = func( extensions[ i ] );

				if ( result ) return result;

			}

			return null;

		}

		_invokeAll( func ) {

			const extensions = Object.values( this.plugins );
			extensions.unshift( this );

			const pending = [];

			for ( let i = 0; i < extensions.length; i ++ ) {

				const result = func( extensions[ i ] );

				if ( result ) pending.push( result );

			}

			return pending;

		}

		/**
		 * Requests the specified dependency asynchronously, with caching.
		 *
		 * @private
		 * @param {string} type
		 * @param {number} index
		 * @return {Promise<Object3D|Material|Texture|AnimationClip|ArrayBuffer|Object>}
		 */
		getDependency( type, index ) {

			const cacheKey = type + ':' + index;
			let dependency = this.cache.get( cacheKey );

			if ( ! dependency ) {

				switch ( type ) {

					case 'scene':
						dependency = this.loadScene( index );
						break;

					case 'node':
						dependency = this._invokeOne( function ( ext ) {

							return ext.loadNode && ext.loadNode( index );

						} );
						break;

					case 'mesh':
						dependency = this._invokeOne( function ( ext ) {

							return ext.loadMesh && ext.loadMesh( index );

						} );
						break;

					case 'accessor':
						dependency = this.loadAccessor( index );
						break;

					case 'bufferView':
						dependency = this._invokeOne( function ( ext ) {

							return ext.loadBufferView && ext.loadBufferView( index );

						} );
						break;

					case 'buffer':
						dependency = this.loadBuffer( index );
						break;

					case 'material':
						dependency = this._invokeOne( function ( ext ) {

							return ext.loadMaterial && ext.loadMaterial( index );

						} );
						break;

					case 'texture':
						dependency = this._invokeOne( function ( ext ) {

							return ext.loadTexture && ext.loadTexture( index );

						} );
						break;

					case 'skin':
						dependency = this.loadSkin( index );
						break;

					case 'animation':
						dependency = this._invokeOne( function ( ext ) {

							return ext.loadAnimation && ext.loadAnimation( index );

						} );
						break;

					case 'camera':
						dependency = this.loadCamera( index );
						break;

					default:
						dependency = this._invokeOne( function ( ext ) {

							return ext != this && ext.getDependency && ext.getDependency( type, index );

						} );

						if ( ! dependency ) {

							throw new Error( 'Unknown type: ' + type );

						}

						break;

				}

				this.cache.add( cacheKey, dependency );

			}

			return dependency;

		}

		/**
		 * Requests all dependencies of the specified type asynchronously, with caching.
		 *
		 * @private
		 * @param {string} type
		 * @return {Promise<Array<Object>>}
		 */
		getDependencies( type ) {

			let dependencies = this.cache.get( type );

			if ( ! dependencies ) {

				const parser = this;
				const defs = this.json[ type + ( type === 'mesh' ? 'es' : 's' ) ] || [];

				dependencies = Promise.all( defs.map( function ( def, index ) {

					return parser.getDependency( type, index );

				} ) );

				this.cache.add( type, dependencies );

			}

			return dependencies;

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
		 *
		 * @private
		 * @param {number} bufferIndex
		 * @return {Promise<ArrayBuffer>}
		 */
		loadBuffer( bufferIndex ) {

			const bufferDef = this.json.buffers[ bufferIndex ];
			const loader = this.fileLoader;

			if ( bufferDef.type && bufferDef.type !== 'arraybuffer' ) {

				throw new Error( 'THREE.GLTFLoader: ' + bufferDef.type + ' buffer type is not supported.' );

			}

			// If present, GLB container is required to be the first buffer.
			if ( bufferDef.uri === undefined && bufferIndex === 0 ) {

				return Promise.resolve( this.extensions[ EXTENSIONS.KHR_BINARY_GLTF ].body );

			}

			const options = this.options;

			return new Promise( function ( resolve, reject ) {

				loader.load( three.LoaderUtils.resolveURL( bufferDef.uri, options.path ), resolve, undefined, function () {

					reject( new Error( 'THREE.GLTFLoader: Failed to load buffer "' + bufferDef.uri + '".' ) );

				} );

			} );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
		 *
		 * @private
		 * @param {number} bufferViewIndex
		 * @return {Promise<ArrayBuffer>}
		 */
		loadBufferView( bufferViewIndex ) {

			const bufferViewDef = this.json.bufferViews[ bufferViewIndex ];

			return this.getDependency( 'buffer', bufferViewDef.buffer ).then( function ( buffer ) {

				const byteLength = bufferViewDef.byteLength || 0;
				const byteOffset = bufferViewDef.byteOffset || 0;
				return buffer.slice( byteOffset, byteOffset + byteLength );

			} );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#accessors
		 *
		 * @private
		 * @param {number} accessorIndex
		 * @return {Promise<BufferAttribute|InterleavedBufferAttribute>}
		 */
		loadAccessor( accessorIndex ) {

			const parser = this;
			const json = this.json;

			const accessorDef = this.json.accessors[ accessorIndex ];

			if ( accessorDef.bufferView === undefined && accessorDef.sparse === undefined ) {

				const itemSize = WEBGL_TYPE_SIZES[ accessorDef.type ];
				const TypedArray = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];
				const normalized = accessorDef.normalized === true;

				const array = new TypedArray( accessorDef.count * itemSize );
				return Promise.resolve( new three.BufferAttribute( array, itemSize, normalized ) );

			}

			const pendingBufferViews = [];

			if ( accessorDef.bufferView !== undefined ) {

				pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.bufferView ) );

			} else {

				pendingBufferViews.push( null );

			}

			if ( accessorDef.sparse !== undefined ) {

				pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.sparse.indices.bufferView ) );
				pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.sparse.values.bufferView ) );

			}

			return Promise.all( pendingBufferViews ).then( function ( bufferViews ) {

				const bufferView = bufferViews[ 0 ];

				const itemSize = WEBGL_TYPE_SIZES[ accessorDef.type ];
				const TypedArray = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];

				// For VEC3: itemSize is 3, elementBytes is 4, itemBytes is 12.
				const elementBytes = TypedArray.BYTES_PER_ELEMENT;
				const itemBytes = elementBytes * itemSize;
				const byteOffset = accessorDef.byteOffset || 0;
				const byteStride = accessorDef.bufferView !== undefined ? json.bufferViews[ accessorDef.bufferView ].byteStride : undefined;
				const normalized = accessorDef.normalized === true;
				let array, bufferAttribute;

				// The buffer is not interleaved if the stride is the item size in bytes.
				if ( byteStride && byteStride !== itemBytes ) {

					// Each "slice" of the buffer, as defined by 'count' elements of 'byteStride' bytes, gets its own InterleavedBuffer
					// This makes sure that IBA.count reflects accessor.count properly
					const ibSlice = Math.floor( byteOffset / byteStride );
					const ibCacheKey = 'InterleavedBuffer:' + accessorDef.bufferView + ':' + accessorDef.componentType + ':' + ibSlice + ':' + accessorDef.count;
					let ib = parser.cache.get( ibCacheKey );

					if ( ! ib ) {

						array = new TypedArray( bufferView, ibSlice * byteStride, accessorDef.count * byteStride / elementBytes );

						// Integer parameters to IB/IBA are in array elements, not bytes.
						ib = new three.InterleavedBuffer( array, byteStride / elementBytes );

						parser.cache.add( ibCacheKey, ib );

					}

					bufferAttribute = new three.InterleavedBufferAttribute( ib, itemSize, ( byteOffset % byteStride ) / elementBytes, normalized );

				} else {

					if ( bufferView === null ) {

						array = new TypedArray( accessorDef.count * itemSize );

					} else {

						array = new TypedArray( bufferView, byteOffset, accessorDef.count * itemSize );

					}

					bufferAttribute = new three.BufferAttribute( array, itemSize, normalized );

				}

				// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#sparse-accessors
				if ( accessorDef.sparse !== undefined ) {

					const itemSizeIndices = WEBGL_TYPE_SIZES.SCALAR;
					const TypedArrayIndices = WEBGL_COMPONENT_TYPES[ accessorDef.sparse.indices.componentType ];

					const byteOffsetIndices = accessorDef.sparse.indices.byteOffset || 0;
					const byteOffsetValues = accessorDef.sparse.values.byteOffset || 0;

					const sparseIndices = new TypedArrayIndices( bufferViews[ 1 ], byteOffsetIndices, accessorDef.sparse.count * itemSizeIndices );
					const sparseValues = new TypedArray( bufferViews[ 2 ], byteOffsetValues, accessorDef.sparse.count * itemSize );

					if ( bufferView !== null ) {

						// Avoid modifying the original ArrayBuffer, if the bufferView wasn't initialized with zeroes.
						bufferAttribute = new three.BufferAttribute( bufferAttribute.array.slice(), bufferAttribute.itemSize, bufferAttribute.normalized );

					}

					// Ignore normalized since we copy from sparse
					bufferAttribute.normalized = false;

					for ( let i = 0, il = sparseIndices.length; i < il; i ++ ) {

						const index = sparseIndices[ i ];

						bufferAttribute.setX( index, sparseValues[ i * itemSize ] );
						if ( itemSize >= 2 ) bufferAttribute.setY( index, sparseValues[ i * itemSize + 1 ] );
						if ( itemSize >= 3 ) bufferAttribute.setZ( index, sparseValues[ i * itemSize + 2 ] );
						if ( itemSize >= 4 ) bufferAttribute.setW( index, sparseValues[ i * itemSize + 3 ] );
						if ( itemSize >= 5 ) throw new Error( 'THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.' );

					}

					bufferAttribute.normalized = normalized;

				}

				return bufferAttribute;

			} );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#textures
		 *
		 * @private
		 * @param {number} textureIndex
		 * @return {Promise<?Texture>}
		 */
		loadTexture( textureIndex ) {

			const json = this.json;
			const options = this.options;
			const textureDef = json.textures[ textureIndex ];
			const sourceIndex = textureDef.source;
			const sourceDef = json.images[ sourceIndex ];

			let loader = this.textureLoader;

			if ( sourceDef.uri ) {

				const handler = options.manager.getHandler( sourceDef.uri );
				if ( handler !== null ) loader = handler;

			}

			return this.loadTextureImage( textureIndex, sourceIndex, loader );

		}

		loadTextureImage( textureIndex, sourceIndex, loader ) {

			const parser = this;
			const json = this.json;

			const textureDef = json.textures[ textureIndex ];
			const sourceDef = json.images[ sourceIndex ];

			const cacheKey = ( sourceDef.uri || sourceDef.bufferView ) + ':' + textureDef.sampler;

			if ( this.textureCache[ cacheKey ] ) {

				// See https://github.com/mrdoob/three.js/issues/21559.
				return this.textureCache[ cacheKey ];

			}

			const promise = this.loadImageSource( sourceIndex, loader ).then( function ( texture ) {

				texture.flipY = false;

				texture.name = textureDef.name || sourceDef.name || '';

				if ( texture.name === '' && typeof sourceDef.uri === 'string' && sourceDef.uri.startsWith( 'data:image/' ) === false ) {

					texture.name = sourceDef.uri;

				}

				const samplers = json.samplers || {};
				const sampler = samplers[ textureDef.sampler ] || {};

				texture.magFilter = WEBGL_FILTERS[ sampler.magFilter ] || three.LinearFilter;
				texture.minFilter = WEBGL_FILTERS[ sampler.minFilter ] || three.LinearMipmapLinearFilter;
				texture.wrapS = WEBGL_WRAPPINGS[ sampler.wrapS ] || three.RepeatWrapping;
				texture.wrapT = WEBGL_WRAPPINGS[ sampler.wrapT ] || three.RepeatWrapping;
				texture.generateMipmaps = ! texture.isCompressedTexture && texture.minFilter !== three.NearestFilter && texture.minFilter !== three.LinearFilter;

				parser.associations.set( texture, { textures: textureIndex } );

				return texture;

			} ).catch( function () {

				return null;

			} );

			this.textureCache[ cacheKey ] = promise;

			return promise;

		}

		loadImageSource( sourceIndex, loader ) {

			const parser = this;
			const json = this.json;
			const options = this.options;

			if ( this.sourceCache[ sourceIndex ] !== undefined ) {

				return this.sourceCache[ sourceIndex ].then( ( texture ) => texture.clone() );

			}

			const sourceDef = json.images[ sourceIndex ];

			const URL = self.URL || self.webkitURL;

			let sourceURI = sourceDef.uri || '';
			let isObjectURL = false;

			if ( sourceDef.bufferView !== undefined ) {

				// Load binary image data from bufferView, if provided.

				sourceURI = parser.getDependency( 'bufferView', sourceDef.bufferView ).then( function ( bufferView ) {

					isObjectURL = true;
					const blob = new Blob( [ bufferView ], { type: sourceDef.mimeType } );
					sourceURI = URL.createObjectURL( blob );
					return sourceURI;

				} );

			} else if ( sourceDef.uri === undefined ) {

				throw new Error( 'THREE.GLTFLoader: Image ' + sourceIndex + ' is missing URI and bufferView' );

			}

			const promise = Promise.resolve( sourceURI ).then( function ( sourceURI ) {

				return new Promise( function ( resolve, reject ) {

					let onLoad = resolve;

					if ( loader.isImageBitmapLoader === true ) {

						onLoad = function ( imageBitmap ) {

							const texture = new three.Texture( imageBitmap );
							texture.needsUpdate = true;

							resolve( texture );

						};

					}

					loader.load( three.LoaderUtils.resolveURL( sourceURI, options.path ), onLoad, undefined, reject );

				} );

			} ).then( function ( texture ) {

				// Clean up resources and configure Texture.

				if ( isObjectURL === true ) {

					URL.revokeObjectURL( sourceURI );

				}

				assignExtrasToUserData( texture, sourceDef );

				texture.userData.mimeType = sourceDef.mimeType || getImageURIMimeType( sourceDef.uri );

				return texture;

			} ).catch( function ( error ) {

				console.error( 'THREE.GLTFLoader: Couldn\'t load texture', sourceURI );
				throw error;

			} );

			this.sourceCache[ sourceIndex ] = promise;
			return promise;

		}

		/**
		 * Asynchronously assigns a texture to the given material parameters.
		 *
		 * @private
		 * @param {Object} materialParams
		 * @param {string} mapName
		 * @param {Object} mapDef
		 * @param {string} [colorSpace]
		 * @return {Promise<Texture>}
		 */
		assignTexture( materialParams, mapName, mapDef, colorSpace ) {

			const parser = this;

			return this.getDependency( 'texture', mapDef.index ).then( function ( texture ) {

				if ( ! texture ) return null;

				if ( mapDef.texCoord !== undefined && mapDef.texCoord > 0 ) {

					texture = texture.clone();
					texture.channel = mapDef.texCoord;

				}

				if ( parser.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ] ) {

					const transform = mapDef.extensions !== undefined ? mapDef.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ] : undefined;

					if ( transform ) {

						const gltfReference = parser.associations.get( texture );
						texture = parser.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ].extendTexture( texture, transform );
						parser.associations.set( texture, gltfReference );

					}

				}

				if ( colorSpace !== undefined ) {

					texture.colorSpace = colorSpace;

				}

				materialParams[ mapName ] = texture;

				return texture;

			} );

		}

		/**
		 * Assigns final material to a Mesh, Line, or Points instance. The instance
		 * already has a material (generated from the glTF material options alone)
		 * but reuse of the same glTF material may require multiple threejs materials
		 * to accommodate different primitive types, defines, etc. New materials will
		 * be created if necessary, and reused from a cache.
		 *
		 * @private
		 * @param {Object3D} mesh Mesh, Line, or Points instance.
		 */
		assignFinalMaterial( mesh ) {

			const geometry = mesh.geometry;
			let material = mesh.material;

			const useDerivativeTangents = geometry.attributes.tangent === undefined;
			const useVertexColors = geometry.attributes.color !== undefined;
			const useFlatShading = geometry.attributes.normal === undefined;

			if ( mesh.isPoints ) {

				const cacheKey = 'PointsMaterial:' + material.uuid;

				let pointsMaterial = this.cache.get( cacheKey );

				if ( ! pointsMaterial ) {

					pointsMaterial = new three.PointsMaterial();
					three.Material.prototype.copy.call( pointsMaterial, material );
					pointsMaterial.color.copy( material.color );
					pointsMaterial.map = material.map;
					pointsMaterial.sizeAttenuation = false; // glTF spec says points should be 1px

					this.cache.add( cacheKey, pointsMaterial );

				}

				material = pointsMaterial;

			} else if ( mesh.isLine ) {

				const cacheKey = 'LineBasicMaterial:' + material.uuid;

				let lineMaterial = this.cache.get( cacheKey );

				if ( ! lineMaterial ) {

					lineMaterial = new three.LineBasicMaterial();
					three.Material.prototype.copy.call( lineMaterial, material );
					lineMaterial.color.copy( material.color );
					lineMaterial.map = material.map;

					this.cache.add( cacheKey, lineMaterial );

				}

				material = lineMaterial;

			}

			// Clone the material if it will be modified
			if ( useDerivativeTangents || useVertexColors || useFlatShading ) {

				let cacheKey = 'ClonedMaterial:' + material.uuid + ':';

				if ( useDerivativeTangents ) cacheKey += 'derivative-tangents:';
				if ( useVertexColors ) cacheKey += 'vertex-colors:';
				if ( useFlatShading ) cacheKey += 'flat-shading:';

				let cachedMaterial = this.cache.get( cacheKey );

				if ( ! cachedMaterial ) {

					cachedMaterial = material.clone();

					if ( useVertexColors ) cachedMaterial.vertexColors = true;
					if ( useFlatShading ) cachedMaterial.flatShading = true;

					if ( useDerivativeTangents ) {

						// https://github.com/mrdoob/three.js/issues/11438#issuecomment-507003995
						if ( cachedMaterial.normalScale ) cachedMaterial.normalScale.y *= -1;
						if ( cachedMaterial.clearcoatNormalScale ) cachedMaterial.clearcoatNormalScale.y *= -1;

					}

					this.cache.add( cacheKey, cachedMaterial );

					this.associations.set( cachedMaterial, this.associations.get( material ) );

				}

				material = cachedMaterial;

			}

			mesh.material = material;

		}

		getMaterialType( /* materialIndex */ ) {

			return three.MeshStandardMaterial;

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#materials
		 *
		 * @private
		 * @param {number} materialIndex
		 * @return {Promise<Material>}
		 */
		loadMaterial( materialIndex ) {

			const parser = this;
			const json = this.json;
			const extensions = this.extensions;
			const materialDef = json.materials[ materialIndex ];

			let materialType;
			const materialParams = {};
			const materialExtensions = materialDef.extensions || {};

			const pending = [];

			if ( materialExtensions[ EXTENSIONS.KHR_MATERIALS_UNLIT ] ) {

				const kmuExtension = extensions[ EXTENSIONS.KHR_MATERIALS_UNLIT ];
				materialType = kmuExtension.getMaterialType();
				pending.push( kmuExtension.extendParams( materialParams, materialDef, parser ) );

			} else {

				// Specification:
				// https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#metallic-roughness-material

				const metallicRoughness = materialDef.pbrMetallicRoughness || {};

				materialParams.color = new three.Color( 1.0, 1.0, 1.0 );
				materialParams.opacity = 1.0;

				if ( Array.isArray( metallicRoughness.baseColorFactor ) ) {

					const array = metallicRoughness.baseColorFactor;

					materialParams.color.setRGB( array[ 0 ], array[ 1 ], array[ 2 ], three.LinearSRGBColorSpace );
					materialParams.opacity = array[ 3 ];

				}

				if ( metallicRoughness.baseColorTexture !== undefined ) {

					pending.push( parser.assignTexture( materialParams, 'map', metallicRoughness.baseColorTexture, three.SRGBColorSpace ) );

				}

				materialParams.metalness = metallicRoughness.metallicFactor !== undefined ? metallicRoughness.metallicFactor : 1.0;
				materialParams.roughness = metallicRoughness.roughnessFactor !== undefined ? metallicRoughness.roughnessFactor : 1.0;

				if ( metallicRoughness.metallicRoughnessTexture !== undefined ) {

					pending.push( parser.assignTexture( materialParams, 'metalnessMap', metallicRoughness.metallicRoughnessTexture ) );
					pending.push( parser.assignTexture( materialParams, 'roughnessMap', metallicRoughness.metallicRoughnessTexture ) );

				}

				materialType = this._invokeOne( function ( ext ) {

					return ext.getMaterialType && ext.getMaterialType( materialIndex );

				} );

				pending.push( Promise.all( this._invokeAll( function ( ext ) {

					return ext.extendMaterialParams && ext.extendMaterialParams( materialIndex, materialParams );

				} ) ) );

			}

			if ( materialDef.doubleSided === true ) {

				materialParams.side = three.DoubleSide;

			}

			const alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;

			if ( alphaMode === ALPHA_MODES.BLEND ) {

				materialParams.transparent = true;

				// See: https://github.com/mrdoob/three.js/issues/17706
				materialParams.depthWrite = false;

			} else {

				materialParams.transparent = false;

				if ( alphaMode === ALPHA_MODES.MASK ) {

					materialParams.alphaTest = materialDef.alphaCutoff !== undefined ? materialDef.alphaCutoff : 0.5;

				}

			}

			if ( materialDef.normalTexture !== undefined && materialType !== three.MeshBasicMaterial ) {

				pending.push( parser.assignTexture( materialParams, 'normalMap', materialDef.normalTexture ) );

				materialParams.normalScale = new three.Vector2( 1, 1 );

				if ( materialDef.normalTexture.scale !== undefined ) {

					const scale = materialDef.normalTexture.scale;

					materialParams.normalScale.set( scale, scale );

				}

			}

			if ( materialDef.occlusionTexture !== undefined && materialType !== three.MeshBasicMaterial ) {

				pending.push( parser.assignTexture( materialParams, 'aoMap', materialDef.occlusionTexture ) );

				if ( materialDef.occlusionTexture.strength !== undefined ) {

					materialParams.aoMapIntensity = materialDef.occlusionTexture.strength;

				}

			}

			if ( materialDef.emissiveFactor !== undefined && materialType !== three.MeshBasicMaterial ) {

				const emissiveFactor = materialDef.emissiveFactor;
				materialParams.emissive = new three.Color().setRGB( emissiveFactor[ 0 ], emissiveFactor[ 1 ], emissiveFactor[ 2 ], three.LinearSRGBColorSpace );

			}

			if ( materialDef.emissiveTexture !== undefined && materialType !== three.MeshBasicMaterial ) {

				pending.push( parser.assignTexture( materialParams, 'emissiveMap', materialDef.emissiveTexture, three.SRGBColorSpace ) );

			}

			return Promise.all( pending ).then( function () {

				const material = new materialType( materialParams );

				if ( materialDef.name ) material.name = materialDef.name;

				assignExtrasToUserData( material, materialDef );

				parser.associations.set( material, { materials: materialIndex } );

				if ( materialDef.extensions ) addUnknownExtensionsToUserData( extensions, material, materialDef );

				return material;

			} );

		}

		/**
		 * When Object3D instances are targeted by animation, they need unique names.
		 *
		 * @private
		 * @param {string} originalName
		 * @return {string}
		 */
		createUniqueName( originalName ) {

			const sanitizedName = three.PropertyBinding.sanitizeNodeName( originalName || '' );

			if ( sanitizedName in this.nodeNamesUsed ) {

				return sanitizedName + '_' + ( ++ this.nodeNamesUsed[ sanitizedName ] );

			} else {

				this.nodeNamesUsed[ sanitizedName ] = 0;

				return sanitizedName;

			}

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#geometry
		 *
		 * Creates BufferGeometries from primitives.
		 *
		 * @private
		 * @param {Array<GLTF.Primitive>} primitives
		 * @return {Promise<Array<BufferGeometry>>}
		 */
		loadGeometries( primitives ) {

			const parser = this;
			const extensions = this.extensions;
			const cache = this.primitiveCache;

			function createDracoPrimitive( primitive ) {

				return extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ]
					.decodePrimitive( primitive, parser )
					.then( function ( geometry ) {

						return addPrimitiveAttributes( geometry, primitive, parser );

					} );

			}

			const pending = [];

			for ( let i = 0, il = primitives.length; i < il; i ++ ) {

				const primitive = primitives[ i ];
				const cacheKey = createPrimitiveKey( primitive );

				// See if we've already created this geometry
				const cached = cache[ cacheKey ];

				if ( cached ) {

					// Use the cached geometry if it exists
					pending.push( cached.promise );

				} else {

					let geometryPromise;

					if ( primitive.extensions && primitive.extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ] ) {

						// Use DRACO geometry if available
						geometryPromise = createDracoPrimitive( primitive );

					} else {

						// Otherwise create a new geometry
						geometryPromise = addPrimitiveAttributes( new three.BufferGeometry(), primitive, parser );

					}

					// Cache this geometry
					cache[ cacheKey ] = { primitive: primitive, promise: geometryPromise };

					pending.push( geometryPromise );

				}

			}

			return Promise.all( pending );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes
		 *
		 * @private
		 * @param {number} meshIndex
		 * @return {Promise<Group|Mesh|SkinnedMesh|Line|Points>}
		 */
		loadMesh( meshIndex ) {

			const parser = this;
			const json = this.json;
			const extensions = this.extensions;

			const meshDef = json.meshes[ meshIndex ];
			const primitives = meshDef.primitives;

			const pending = [];

			for ( let i = 0, il = primitives.length; i < il; i ++ ) {

				const material = primitives[ i ].material === undefined
					? createDefaultMaterial( this.cache )
					: this.getDependency( 'material', primitives[ i ].material );

				pending.push( material );

			}

			pending.push( parser.loadGeometries( primitives ) );

			return Promise.all( pending ).then( function ( results ) {

				const materials = results.slice( 0, results.length - 1 );
				const geometries = results[ results.length - 1 ];

				const meshes = [];

				for ( let i = 0, il = geometries.length; i < il; i ++ ) {

					const geometry = geometries[ i ];
					const primitive = primitives[ i ];

					// 1. create Mesh

					let mesh;

					const material = materials[ i ];

					if ( primitive.mode === WEBGL_CONSTANTS.TRIANGLES ||
							primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP ||
							primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN ||
							primitive.mode === undefined ) {

						// .isSkinnedMesh isn't in glTF spec. See ._markDefs()
						mesh = meshDef.isSkinnedMesh === true
							? new three.SkinnedMesh( geometry, material )
							: new three.Mesh( geometry, material );

						if ( mesh.isSkinnedMesh === true ) {

							// normalize skin weights to fix malformed assets (see #15319)
							mesh.normalizeSkinWeights();

						}

						if ( primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP ) {

							mesh.geometry = toTrianglesDrawMode( mesh.geometry, three.TriangleStripDrawMode );

						} else if ( primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN ) {

							mesh.geometry = toTrianglesDrawMode( mesh.geometry, three.TriangleFanDrawMode );

						}

					} else if ( primitive.mode === WEBGL_CONSTANTS.LINES ) {

						mesh = new three.LineSegments( geometry, material );

					} else if ( primitive.mode === WEBGL_CONSTANTS.LINE_STRIP ) {

						mesh = new three.Line( geometry, material );

					} else if ( primitive.mode === WEBGL_CONSTANTS.LINE_LOOP ) {

						mesh = new three.LineLoop( geometry, material );

					} else if ( primitive.mode === WEBGL_CONSTANTS.POINTS ) {

						mesh = new three.Points( geometry, material );

					} else {

						throw new Error( 'THREE.GLTFLoader: Primitive mode unsupported: ' + primitive.mode );

					}

					if ( Object.keys( mesh.geometry.morphAttributes ).length > 0 ) {

						updateMorphTargets( mesh, meshDef );

					}

					mesh.name = parser.createUniqueName( meshDef.name || ( 'mesh_' + meshIndex ) );

					assignExtrasToUserData( mesh, meshDef );

					if ( primitive.extensions ) addUnknownExtensionsToUserData( extensions, mesh, primitive );

					parser.assignFinalMaterial( mesh );

					meshes.push( mesh );

				}

				for ( let i = 0, il = meshes.length; i < il; i ++ ) {

					parser.associations.set( meshes[ i ], {
						meshes: meshIndex,
						primitives: i
					} );

				}

				if ( meshes.length === 1 ) {

					if ( meshDef.extensions ) addUnknownExtensionsToUserData( extensions, meshes[ 0 ], meshDef );

					return meshes[ 0 ];

				}

				const group = new three.Group();

				if ( meshDef.extensions ) addUnknownExtensionsToUserData( extensions, group, meshDef );

				parser.associations.set( group, { meshes: meshIndex } );

				for ( let i = 0, il = meshes.length; i < il; i ++ ) {

					group.add( meshes[ i ] );

				}

				return group;

			} );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
		 *
		 * @private
		 * @param {number} cameraIndex
		 * @return {Promise<Camera>|undefined}
		 */
		loadCamera( cameraIndex ) {

			let camera;
			const cameraDef = this.json.cameras[ cameraIndex ];
			const params = cameraDef[ cameraDef.type ];

			if ( ! params ) {

				console.warn( 'THREE.GLTFLoader: Missing camera parameters.' );
				return;

			}

			if ( cameraDef.type === 'perspective' ) {

				camera = new three.PerspectiveCamera( three.MathUtils.radToDeg( params.yfov ), params.aspectRatio || 1, params.znear || 1, params.zfar || 2e6 );

			} else if ( cameraDef.type === 'orthographic' ) {

				camera = new three.OrthographicCamera( - params.xmag, params.xmag, params.ymag, - params.ymag, params.znear, params.zfar );

			}

			if ( cameraDef.name ) camera.name = this.createUniqueName( cameraDef.name );

			assignExtrasToUserData( camera, cameraDef );

			return Promise.resolve( camera );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#skins
		 *
		 * @private
		 * @param {number} skinIndex
		 * @return {Promise<Skeleton>}
		 */
		loadSkin( skinIndex ) {

			const skinDef = this.json.skins[ skinIndex ];

			const pending = [];

			for ( let i = 0, il = skinDef.joints.length; i < il; i ++ ) {

				pending.push( this._loadNodeShallow( skinDef.joints[ i ] ) );

			}

			if ( skinDef.inverseBindMatrices !== undefined ) {

				pending.push( this.getDependency( 'accessor', skinDef.inverseBindMatrices ) );

			} else {

				pending.push( null );

			}

			return Promise.all( pending ).then( function ( results ) {

				const inverseBindMatrices = results.pop();
				const jointNodes = results;

				// Note that bones (joint nodes) may or may not be in the
				// scene graph at this time.

				const bones = [];
				const boneInverses = [];

				for ( let i = 0, il = jointNodes.length; i < il; i ++ ) {

					const jointNode = jointNodes[ i ];

					if ( jointNode ) {

						bones.push( jointNode );

						const mat = new three.Matrix4();

						if ( inverseBindMatrices !== null ) {

							mat.fromArray( inverseBindMatrices.array, i * 16 );

						}

						boneInverses.push( mat );

					} else {

						console.warn( 'THREE.GLTFLoader: Joint "%s" could not be found.', skinDef.joints[ i ] );

					}

				}

				return new three.Skeleton( bones, boneInverses );

			} );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#animations
		 *
		 * @private
		 * @param {number} animationIndex
		 * @return {Promise<AnimationClip>}
		 */
		loadAnimation( animationIndex ) {

			const json = this.json;
			const parser = this;

			const animationDef = json.animations[ animationIndex ];
			const animationName = animationDef.name ? animationDef.name : 'animation_' + animationIndex;

			const pendingNodes = [];
			const pendingInputAccessors = [];
			const pendingOutputAccessors = [];
			const pendingSamplers = [];
			const pendingTargets = [];

			for ( let i = 0, il = animationDef.channels.length; i < il; i ++ ) {

				const channel = animationDef.channels[ i ];
				const sampler = animationDef.samplers[ channel.sampler ];
				const target = channel.target;
				const name = target.node;
				const input = animationDef.parameters !== undefined ? animationDef.parameters[ sampler.input ] : sampler.input;
				const output = animationDef.parameters !== undefined ? animationDef.parameters[ sampler.output ] : sampler.output;

				if ( target.node === undefined ) continue;

				pendingNodes.push( this.getDependency( 'node', name ) );
				pendingInputAccessors.push( this.getDependency( 'accessor', input ) );
				pendingOutputAccessors.push( this.getDependency( 'accessor', output ) );
				pendingSamplers.push( sampler );
				pendingTargets.push( target );

			}

			return Promise.all( [

				Promise.all( pendingNodes ),
				Promise.all( pendingInputAccessors ),
				Promise.all( pendingOutputAccessors ),
				Promise.all( pendingSamplers ),
				Promise.all( pendingTargets )

			] ).then( function ( dependencies ) {

				const nodes = dependencies[ 0 ];
				const inputAccessors = dependencies[ 1 ];
				const outputAccessors = dependencies[ 2 ];
				const samplers = dependencies[ 3 ];
				const targets = dependencies[ 4 ];

				const tracks = [];

				for ( let i = 0, il = nodes.length; i < il; i ++ ) {

					const node = nodes[ i ];
					const inputAccessor = inputAccessors[ i ];
					const outputAccessor = outputAccessors[ i ];
					const sampler = samplers[ i ];
					const target = targets[ i ];

					if ( node === undefined ) continue;

					if ( node.updateMatrix ) {

						node.updateMatrix();

					}

					const createdTracks = parser._createAnimationTracks( node, inputAccessor, outputAccessor, sampler, target );

					if ( createdTracks ) {

						for ( let k = 0; k < createdTracks.length; k ++ ) {

							tracks.push( createdTracks[ k ] );

						}

					}

				}

				const animation = new three.AnimationClip( animationName, undefined, tracks );

				assignExtrasToUserData( animation, animationDef );

				return animation;

			} );

		}

		createNodeMesh( nodeIndex ) {

			const json = this.json;
			const parser = this;
			const nodeDef = json.nodes[ nodeIndex ];

			if ( nodeDef.mesh === undefined ) return null;

			return parser.getDependency( 'mesh', nodeDef.mesh ).then( function ( mesh ) {

				const node = parser._getNodeRef( parser.meshCache, nodeDef.mesh, mesh );

				// if weights are provided on the node, override weights on the mesh.
				if ( nodeDef.weights !== undefined ) {

					node.traverse( function ( o ) {

						if ( ! o.isMesh ) return;

						for ( let i = 0, il = nodeDef.weights.length; i < il; i ++ ) {

							o.morphTargetInfluences[ i ] = nodeDef.weights[ i ];

						}

					} );

				}

				return node;

			} );

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#nodes-and-hierarchy
		 *
		 * @private
		 * @param {number} nodeIndex
		 * @return {Promise<Object3D>}
		 */
		loadNode( nodeIndex ) {

			const json = this.json;
			const parser = this;

			const nodeDef = json.nodes[ nodeIndex ];

			const nodePending = parser._loadNodeShallow( nodeIndex );

			const childPending = [];
			const childrenDef = nodeDef.children || [];

			for ( let i = 0, il = childrenDef.length; i < il; i ++ ) {

				childPending.push( parser.getDependency( 'node', childrenDef[ i ] ) );

			}

			const skeletonPending = nodeDef.skin === undefined
				? Promise.resolve( null )
				: parser.getDependency( 'skin', nodeDef.skin );

			return Promise.all( [
				nodePending,
				Promise.all( childPending ),
				skeletonPending
			] ).then( function ( results ) {

				const node = results[ 0 ];
				const children = results[ 1 ];
				const skeleton = results[ 2 ];

				if ( skeleton !== null ) {

					// This full traverse should be fine because
					// child glTF nodes have not been added to this node yet.
					node.traverse( function ( mesh ) {

						if ( ! mesh.isSkinnedMesh ) return;

						mesh.bind( skeleton, _identityMatrix );

					} );

				}

				for ( let i = 0, il = children.length; i < il; i ++ ) {

					node.add( children[ i ] );

				}

				// Reconstruct pivot from container pattern created by GLTFExporter
				// The container has position+pivot, rotation, scale; child has -pivot offset and mesh
				if ( node.userData.pivot !== undefined && children.length > 0 ) {

					const pivot = node.userData.pivot;
					const pivotChild = children[ 0 ];

					// Set pivot on container and adjust transforms
					node.pivot = new three.Vector3().fromArray( pivot );

					// Adjust container position: stored as position + pivot, so subtract pivot
					node.position.x -= pivot[ 0 ];
					node.position.y -= pivot[ 1 ];
					node.position.z -= pivot[ 2 ];

					// Remove the child's -pivot offset since pivot now handles it
					pivotChild.position.set( 0, 0, 0 );

					delete node.userData.pivot;

				}

				return node;

			} );

		}

		// ._loadNodeShallow() parses a single node.
		// skin and child nodes are created and added in .loadNode() (no '_' prefix).
		_loadNodeShallow( nodeIndex ) {

			const json = this.json;
			const extensions = this.extensions;
			const parser = this;

			// This method is called from .loadNode() and .loadSkin().
			// Cache a node to avoid duplication.

			if ( this.nodeCache[ nodeIndex ] !== undefined ) {

				return this.nodeCache[ nodeIndex ];

			}

			const nodeDef = json.nodes[ nodeIndex ];

			// reserve node's name before its dependencies, so the root has the intended name.
			const nodeName = nodeDef.name ? parser.createUniqueName( nodeDef.name ) : '';

			const pending = [];

			const meshPromise = parser._invokeOne( function ( ext ) {

				return ext.createNodeMesh && ext.createNodeMesh( nodeIndex );

			} );

			if ( meshPromise ) {

				pending.push( meshPromise );

			}

			if ( nodeDef.camera !== undefined ) {

				pending.push( parser.getDependency( 'camera', nodeDef.camera ).then( function ( camera ) {

					return parser._getNodeRef( parser.cameraCache, nodeDef.camera, camera );

				} ) );

			}

			parser._invokeAll( function ( ext ) {

				return ext.createNodeAttachment && ext.createNodeAttachment( nodeIndex );

			} ).forEach( function ( promise ) {

				pending.push( promise );

			} );

			this.nodeCache[ nodeIndex ] = Promise.all( pending ).then( function ( objects ) {

				let node;

				// .isBone isn't in glTF spec. See ._markDefs
				if ( nodeDef.isBone === true ) {

					node = new three.Bone();

				} else if ( objects.length > 1 ) {

					node = new three.Group();

				} else if ( objects.length === 1 ) {

					node = objects[ 0 ];

				} else {

					node = new three.Object3D();

				}

				if ( node !== objects[ 0 ] ) {

					for ( let i = 0, il = objects.length; i < il; i ++ ) {

						node.add( objects[ i ] );

					}

				}

				if ( nodeDef.name ) {

					node.userData.name = nodeDef.name;
					node.name = nodeName;

				}

				assignExtrasToUserData( node, nodeDef );

				if ( nodeDef.extensions ) addUnknownExtensionsToUserData( extensions, node, nodeDef );

				if ( nodeDef.matrix !== undefined ) {

					const matrix = new three.Matrix4();
					matrix.fromArray( nodeDef.matrix );
					node.applyMatrix4( matrix );

				} else {

					if ( nodeDef.translation !== undefined ) {

						node.position.fromArray( nodeDef.translation );

					}

					if ( nodeDef.rotation !== undefined ) {

						node.quaternion.fromArray( nodeDef.rotation );

					}

					if ( nodeDef.scale !== undefined ) {

						node.scale.fromArray( nodeDef.scale );

					}

				}

				if ( ! parser.associations.has( node ) ) {

					parser.associations.set( node, {} );

				} else if ( nodeDef.mesh !== undefined && parser.meshCache.refs[ nodeDef.mesh ] > 1 ) {

					const mapping = parser.associations.get( node );
					parser.associations.set( node, { ...mapping } );

				}

				parser.associations.get( node ).nodes = nodeIndex;

				return node;

			} );

			return this.nodeCache[ nodeIndex ];

		}

		/**
		 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#scenes
		 *
		 * @private
		 * @param {number} sceneIndex
		 * @return {Promise<Group>}
		 */
		loadScene( sceneIndex ) {

			const extensions = this.extensions;
			const sceneDef = this.json.scenes[ sceneIndex ];
			const parser = this;

			// Loader returns Group, not Scene.
			// See: https://github.com/mrdoob/three.js/issues/18342#issuecomment-578981172
			const scene = new three.Group();
			if ( sceneDef.name ) scene.name = parser.createUniqueName( sceneDef.name );

			assignExtrasToUserData( scene, sceneDef );

			if ( sceneDef.extensions ) addUnknownExtensionsToUserData( extensions, scene, sceneDef );

			const nodeIds = sceneDef.nodes || [];

			const pending = [];

			for ( let i = 0, il = nodeIds.length; i < il; i ++ ) {

				pending.push( parser.getDependency( 'node', nodeIds[ i ] ) );

			}

			return Promise.all( pending ).then( function ( nodes ) {

				for ( let i = 0, il = nodes.length; i < il; i ++ ) {

					const node = nodes[ i ];

					// If the node already has a parent, it means it's being reused across multiple scenes.
					// Clone it to avoid the second scene's add() removing it from the first scene.
					// See: https://github.com/mrdoob/three.js/issues/27993
					if ( node.parent !== null ) {

						scene.add( clone( node ) );

					} else {

						scene.add( node );

					}

				}

				// Removes dangling associations, associations that reference a node that
				// didn't make it into the scene.
				const reduceAssociations = ( node ) => {

					const reducedAssociations = new Map();

					for ( const [ key, value ] of parser.associations ) {

						if ( key instanceof three.Material || key instanceof three.Texture ) {

							reducedAssociations.set( key, value );

						}

					}

					node.traverse( ( node ) => {

						const mappings = parser.associations.get( node );

						if ( mappings != null ) {

							reducedAssociations.set( node, mappings );

						}

					} );

					return reducedAssociations;

				};

				parser.associations = reduceAssociations( scene );

				return scene;

			} );

		}

		_createAnimationTracks( node, inputAccessor, outputAccessor, sampler, target ) {

			const tracks = [];

			const targetName = node.name ? node.name : node.uuid;
			const targetNames = [];

			function collectMorphTargets( object ) {

				if ( object.morphTargetInfluences ) {

					targetNames.push( object.name ? object.name : object.uuid );

				}

			}


			if ( PATH_PROPERTIES[ target.path ] === PATH_PROPERTIES.weights ) {

				collectMorphTargets( node );

				// for multi-primitive meshes, the node is a Group containing the sub-meshes

				if ( node.isGroup ) {

					node.children.forEach( collectMorphTargets );

				}

			} else {

				targetNames.push( targetName );

			}

			let TypedKeyframeTrack;

			switch ( PATH_PROPERTIES[ target.path ] ) {

				case PATH_PROPERTIES.weights:

					TypedKeyframeTrack = three.NumberKeyframeTrack;
					break;

				case PATH_PROPERTIES.rotation:

					TypedKeyframeTrack = three.QuaternionKeyframeTrack;
					break;

				case PATH_PROPERTIES.translation:
				case PATH_PROPERTIES.scale:

					TypedKeyframeTrack = three.VectorKeyframeTrack;
					break;

				default:

					switch ( outputAccessor.itemSize ) {

						case 1:
							TypedKeyframeTrack = three.NumberKeyframeTrack;
							break;
						case 2:
						case 3:
						default:
							TypedKeyframeTrack = three.VectorKeyframeTrack;
							break;

					}

					break;

			}

			const interpolation = sampler.interpolation !== undefined ? INTERPOLATION[ sampler.interpolation ] : three.InterpolateLinear;


			const outputArray = this._getArrayFromAccessor( outputAccessor );

			for ( let j = 0, jl = targetNames.length; j < jl; j ++ ) {

				const track = new TypedKeyframeTrack(
					targetNames[ j ] + '.' + PATH_PROPERTIES[ target.path ],
					inputAccessor.array,
					outputArray,
					interpolation
				);

				// Override interpolation with custom factory method.
				if ( sampler.interpolation === 'CUBICSPLINE' ) {

					this._createCubicSplineTrackInterpolant( track );

				}

				tracks.push( track );

			}

			return tracks;

		}

		_getArrayFromAccessor( accessor ) {

			let outputArray = accessor.array;

			if ( accessor.normalized ) {

				const scale = getNormalizedComponentScale( outputArray.constructor );
				const scaled = new Float32Array( outputArray.length );

				for ( let j = 0, jl = outputArray.length; j < jl; j ++ ) {

					scaled[ j ] = outputArray[ j ] * scale;

				}

				outputArray = scaled;

			}

			return outputArray;

		}

		_createCubicSplineTrackInterpolant( track ) {

			track.createInterpolant = function InterpolantFactoryMethodGLTFCubicSpline( result ) {

				// A CUBICSPLINE keyframe in glTF has three output values for each input value,
				// representing inTangent, splineVertex, and outTangent. As a result, track.getValueSize()
				// must be divided by three to get the interpolant's sampleSize argument.

				const interpolantType = ( this instanceof three.QuaternionKeyframeTrack ) ? GLTFCubicSplineQuaternionInterpolant : GLTFCubicSplineInterpolant;

				return new interpolantType( this.times, this.values, this.getValueSize() / 3, result );

			};

			// Mark as CUBICSPLINE. `track.getInterpolation()` doesn't support custom interpolants.
			track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline = true;

		}

	}

	/**
	 *
	 * @private
	 * @param {BufferGeometry} geometry
	 * @param {GLTF.Primitive} primitiveDef
	 * @param {GLTFParser} parser
	 */
	function computeBounds( geometry, primitiveDef, parser ) {

		const attributes = primitiveDef.attributes;

		const box = new three.Box3();

		if ( attributes.POSITION !== undefined ) {

			const accessor = parser.json.accessors[ attributes.POSITION ];

			const min = accessor.min;
			const max = accessor.max;

			// glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

			if ( min !== undefined && max !== undefined ) {

				box.set(
					new three.Vector3( min[ 0 ], min[ 1 ], min[ 2 ] ),
					new three.Vector3( max[ 0 ], max[ 1 ], max[ 2 ] )
				);

				if ( accessor.normalized ) {

					const boxScale = getNormalizedComponentScale( WEBGL_COMPONENT_TYPES[ accessor.componentType ] );
					box.min.multiplyScalar( boxScale );
					box.max.multiplyScalar( boxScale );

				}

			} else {

				console.warn( 'THREE.GLTFLoader: Missing min/max properties for accessor POSITION.' );

				return;

			}

		} else {

			return;

		}

		const targets = primitiveDef.targets;

		if ( targets !== undefined ) {

			const maxDisplacement = new three.Vector3();
			const vector = new three.Vector3();

			for ( let i = 0, il = targets.length; i < il; i ++ ) {

				const target = targets[ i ];

				if ( target.POSITION !== undefined ) {

					const accessor = parser.json.accessors[ target.POSITION ];
					const min = accessor.min;
					const max = accessor.max;

					// glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

					if ( min !== undefined && max !== undefined ) {

						// we need to get max of absolute components because target weight is [-1,1]
						vector.setX( Math.max( Math.abs( min[ 0 ] ), Math.abs( max[ 0 ] ) ) );
						vector.setY( Math.max( Math.abs( min[ 1 ] ), Math.abs( max[ 1 ] ) ) );
						vector.setZ( Math.max( Math.abs( min[ 2 ] ), Math.abs( max[ 2 ] ) ) );


						if ( accessor.normalized ) {

							const boxScale = getNormalizedComponentScale( WEBGL_COMPONENT_TYPES[ accessor.componentType ] );
							vector.multiplyScalar( boxScale );

						}

						// Note: this assumes that the sum of all weights is at most 1. This isn't quite correct - it's more conservative
						// to assume that each target can have a max weight of 1. However, for some use cases - notably, when morph targets
						// are used to implement key-frame animations and as such only two are active at a time - this results in very large
						// boxes. So for now we make a box that's sometimes a touch too small but is hopefully mostly of reasonable size.
						maxDisplacement.max( vector );

					} else {

						console.warn( 'THREE.GLTFLoader: Missing min/max properties for accessor POSITION.' );

					}

				}

			}

			// As per comment above this box isn't conservative, but has a reasonable size for a very large number of morph targets.
			box.expandByVector( maxDisplacement );

		}

		geometry.boundingBox = box;

		const sphere = new three.Sphere();

		box.getCenter( sphere.center );
		sphere.radius = box.min.distanceTo( box.max ) / 2;

		geometry.boundingSphere = sphere;

	}

	/**
	 *
	 * @private
	 * @param {BufferGeometry} geometry
	 * @param {GLTF.Primitive} primitiveDef
	 * @param {GLTFParser} parser
	 * @return {Promise<BufferGeometry>}
	 */
	function addPrimitiveAttributes( geometry, primitiveDef, parser ) {

		const attributes = primitiveDef.attributes;

		const pending = [];

		function assignAttributeAccessor( accessorIndex, attributeName ) {

			return parser.getDependency( 'accessor', accessorIndex )
				.then( function ( accessor ) {

					geometry.setAttribute( attributeName, accessor );

				} );

		}

		for ( const gltfAttributeName in attributes ) {

			const threeAttributeName = ATTRIBUTES[ gltfAttributeName ] || gltfAttributeName.toLowerCase();

			// Skip attributes already provided by e.g. Draco extension.
			if ( threeAttributeName in geometry.attributes ) continue;

			pending.push( assignAttributeAccessor( attributes[ gltfAttributeName ], threeAttributeName ) );

		}

		if ( primitiveDef.indices !== undefined && ! geometry.index ) {

			const accessor = parser.getDependency( 'accessor', primitiveDef.indices ).then( function ( accessor ) {

				geometry.setIndex( accessor );

			} );

			pending.push( accessor );

		}

		if ( three.ColorManagement.workingColorSpace !== three.LinearSRGBColorSpace && 'COLOR_0' in attributes ) {

			console.warn( `THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${three.ColorManagement.workingColorSpace}" not supported.` );

		}

		assignExtrasToUserData( geometry, primitiveDef );

		computeBounds( geometry, primitiveDef, parser );

		return Promise.all( pending ).then( function () {

			return primitiveDef.targets !== undefined
				? addMorphTargets( geometry, primitiveDef.targets, parser )
				: geometry;

		} );

	}

	function getDefaultExportFromCjs (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	var orientation = {exports: {}};

	var twoProduct_1;
	var hasRequiredTwoProduct;

	function requireTwoProduct () {
		if (hasRequiredTwoProduct) return twoProduct_1;
		hasRequiredTwoProduct = 1;

		twoProduct_1 = twoProduct;

		var SPLITTER = +(Math.pow(2, 27) + 1.0);

		function twoProduct(a, b, result) {
		  var x = a * b;

		  var c = SPLITTER * a;
		  var abig = c - a;
		  var ahi = c - abig;
		  var alo = a - ahi;

		  var d = SPLITTER * b;
		  var bbig = d - b;
		  var bhi = d - bbig;
		  var blo = b - bhi;

		  var err1 = x - (ahi * bhi);
		  var err2 = err1 - (alo * bhi);
		  var err3 = err2 - (ahi * blo);

		  var y = alo * blo - err3;

		  if(result) {
		    result[0] = y;
		    result[1] = x;
		    return result
		  }

		  return [ y, x ]
		}
		return twoProduct_1;
	}

	var robustSum;
	var hasRequiredRobustSum;

	function requireRobustSum () {
		if (hasRequiredRobustSum) return robustSum;
		hasRequiredRobustSum = 1;

		robustSum = linearExpansionSum;

		//Easy case: Add two scalars
		function scalarScalar(a, b) {
		  var x = a + b;
		  var bv = x - a;
		  var av = x - bv;
		  var br = b - bv;
		  var ar = a - av;
		  var y = ar + br;
		  if(y) {
		    return [y, x]
		  }
		  return [x]
		}

		function linearExpansionSum(e, f) {
		  var ne = e.length|0;
		  var nf = f.length|0;
		  if(ne === 1 && nf === 1) {
		    return scalarScalar(e[0], f[0])
		  }
		  var n = ne + nf;
		  var g = new Array(n);
		  var count = 0;
		  var eptr = 0;
		  var fptr = 0;
		  var abs = Math.abs;
		  var ei = e[eptr];
		  var ea = abs(ei);
		  var fi = f[fptr];
		  var fa = abs(fi);
		  var a, b;
		  if(ea < fa) {
		    b = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    b = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = f[fptr];
		      fa = abs(fi);
		    }
		  }
		  if((eptr < ne && ea < fa) || (fptr >= nf)) {
		    a = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    a = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = f[fptr];
		      fa = abs(fi);
		    }
		  }
		  var x = a + b;
		  var bv = x - a;
		  var y = b - bv;
		  var q0 = y;
		  var q1 = x;
		  var _x, _bv, _av, _br, _ar;
		  while(eptr < ne && fptr < nf) {
		    if(ea < fa) {
		      a = ei;
		      eptr += 1;
		      if(eptr < ne) {
		        ei = e[eptr];
		        ea = abs(ei);
		      }
		    } else {
		      a = fi;
		      fptr += 1;
		      if(fptr < nf) {
		        fi = f[fptr];
		        fa = abs(fi);
		      }
		    }
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		  }
		  while(eptr < ne) {
		    a = ei;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		    }
		  }
		  while(fptr < nf) {
		    a = fi;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    } 
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = f[fptr];
		    }
		  }
		  if(q0) {
		    g[count++] = q0;
		  }
		  if(q1) {
		    g[count++] = q1;
		  }
		  if(!count) {
		    g[count++] = 0.0;  
		  }
		  g.length = count;
		  return g
		}
		return robustSum;
	}

	var twoSum;
	var hasRequiredTwoSum;

	function requireTwoSum () {
		if (hasRequiredTwoSum) return twoSum;
		hasRequiredTwoSum = 1;

		twoSum = fastTwoSum;

		function fastTwoSum(a, b, result) {
			var x = a + b;
			var bv = x - a;
			var av = x - bv;
			var br = b - bv;
			var ar = a - av;
			if(result) {
				result[0] = ar + br;
				result[1] = x;
				return result
			}
			return [ar+br, x]
		}
		return twoSum;
	}

	var robustScale;
	var hasRequiredRobustScale;

	function requireRobustScale () {
		if (hasRequiredRobustScale) return robustScale;
		hasRequiredRobustScale = 1;

		var twoProduct = requireTwoProduct();
		var twoSum = requireTwoSum();

		robustScale = scaleLinearExpansion;

		function scaleLinearExpansion(e, scale) {
		  var n = e.length;
		  if(n === 1) {
		    var ts = twoProduct(e[0], scale);
		    if(ts[0]) {
		      return ts
		    }
		    return [ ts[1] ]
		  }
		  var g = new Array(2 * n);
		  var q = [0.1, 0.1];
		  var t = [0.1, 0.1];
		  var count = 0;
		  twoProduct(e[0], scale, q);
		  if(q[0]) {
		    g[count++] = q[0];
		  }
		  for(var i=1; i<n; ++i) {
		    twoProduct(e[i], scale, t);
		    var pq = q[1];
		    twoSum(pq, t[0], q);
		    if(q[0]) {
		      g[count++] = q[0];
		    }
		    var a = t[1];
		    var b = q[1];
		    var x = a + b;
		    var bv = x - a;
		    var y = b - bv;
		    q[1] = x;
		    if(y) {
		      g[count++] = y;
		    }
		  }
		  if(q[1]) {
		    g[count++] = q[1];
		  }
		  if(count === 0) {
		    g[count++] = 0.0;
		  }
		  g.length = count;
		  return g
		}
		return robustScale;
	}

	var robustDiff;
	var hasRequiredRobustDiff;

	function requireRobustDiff () {
		if (hasRequiredRobustDiff) return robustDiff;
		hasRequiredRobustDiff = 1;

		robustDiff = robustSubtract;

		//Easy case: Add two scalars
		function scalarScalar(a, b) {
		  var x = a + b;
		  var bv = x - a;
		  var av = x - bv;
		  var br = b - bv;
		  var ar = a - av;
		  var y = ar + br;
		  if(y) {
		    return [y, x]
		  }
		  return [x]
		}

		function robustSubtract(e, f) {
		  var ne = e.length|0;
		  var nf = f.length|0;
		  if(ne === 1 && nf === 1) {
		    return scalarScalar(e[0], -f[0])
		  }
		  var n = ne + nf;
		  var g = new Array(n);
		  var count = 0;
		  var eptr = 0;
		  var fptr = 0;
		  var abs = Math.abs;
		  var ei = e[eptr];
		  var ea = abs(ei);
		  var fi = -f[fptr];
		  var fa = abs(fi);
		  var a, b;
		  if(ea < fa) {
		    b = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    b = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = -f[fptr];
		      fa = abs(fi);
		    }
		  }
		  if((eptr < ne && ea < fa) || (fptr >= nf)) {
		    a = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    a = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = -f[fptr];
		      fa = abs(fi);
		    }
		  }
		  var x = a + b;
		  var bv = x - a;
		  var y = b - bv;
		  var q0 = y;
		  var q1 = x;
		  var _x, _bv, _av, _br, _ar;
		  while(eptr < ne && fptr < nf) {
		    if(ea < fa) {
		      a = ei;
		      eptr += 1;
		      if(eptr < ne) {
		        ei = e[eptr];
		        ea = abs(ei);
		      }
		    } else {
		      a = fi;
		      fptr += 1;
		      if(fptr < nf) {
		        fi = -f[fptr];
		        fa = abs(fi);
		      }
		    }
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		  }
		  while(eptr < ne) {
		    a = ei;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		    }
		  }
		  while(fptr < nf) {
		    a = fi;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    } 
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = -f[fptr];
		    }
		  }
		  if(q0) {
		    g[count++] = q0;
		  }
		  if(q1) {
		    g[count++] = q1;
		  }
		  if(!count) {
		    g[count++] = 0.0;  
		  }
		  g.length = count;
		  return g
		}
		return robustDiff;
	}

	var hasRequiredOrientation;

	function requireOrientation () {
		if (hasRequiredOrientation) return orientation.exports;
		hasRequiredOrientation = 1;
		(function (module) {

			var twoProduct = requireTwoProduct();
			var robustSum = requireRobustSum();
			var robustScale = requireRobustScale();
			var robustSubtract = requireRobustDiff();

			var NUM_EXPAND = 5;

			var EPSILON     = 1.1102230246251565e-16;
			var ERRBOUND3   = (3.0 + 16.0 * EPSILON) * EPSILON;
			var ERRBOUND4   = (7.0 + 56.0 * EPSILON) * EPSILON;

			function orientation_3(sum, prod, scale, sub) {
			  return function orientation3Exact(m0, m1, m2) {
			    var p = sum(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])));
			    var n = sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0]));
			    var d = sub(p, n);
			    return d[d.length - 1]
			  }
			}

			function orientation_4(sum, prod, scale, sub) {
			  return function orientation4Exact(m0, m1, m2, m3) {
			    var p = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))));
			    var n = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))));
			    var d = sub(p, n);
			    return d[d.length - 1]
			  }
			}

			function orientation_5(sum, prod, scale, sub) {
			  return function orientation5Exact(m0, m1, m2, m3, m4) {
			    var p = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m1[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), -m2[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m3[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), -m4[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m1[3])))), sum(sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m3[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), -m4[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), m0[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m1[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m3[3])))));
			    var n = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m2[3])), sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), m3[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m4[3]))), sum(sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), -m1[3])), sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m4[3]))));
			    var d = sub(p, n);
			    return d[d.length - 1]
			  }
			}

			function orientation(n) {
			  var fn =
			    n === 3 ? orientation_3 :
			    n === 4 ? orientation_4 : orientation_5;

			  return fn(robustSum, twoProduct, robustScale, robustSubtract)
			}

			var orientation3Exact = orientation(3);
			var orientation4Exact = orientation(4);

			var CACHED = [
			  function orientation0() { return 0 },
			  function orientation1() { return 0 },
			  function orientation2(a, b) {
			    return b[0] - a[0]
			  },
			  function orientation3(a, b, c) {
			    var l = (a[1] - c[1]) * (b[0] - c[0]);
			    var r = (a[0] - c[0]) * (b[1] - c[1]);
			    var det = l - r;
			    var s;
			    if(l > 0) {
			      if(r <= 0) {
			        return det
			      } else {
			        s = l + r;
			      }
			    } else if(l < 0) {
			      if(r >= 0) {
			        return det
			      } else {
			        s = -(l + r);
			      }
			    } else {
			      return det
			    }
			    var tol = ERRBOUND3 * s;
			    if(det >= tol || det <= -tol) {
			      return det
			    }
			    return orientation3Exact(a, b, c)
			  },
			  function orientation4(a,b,c,d) {
			    var adx = a[0] - d[0];
			    var bdx = b[0] - d[0];
			    var cdx = c[0] - d[0];
			    var ady = a[1] - d[1];
			    var bdy = b[1] - d[1];
			    var cdy = c[1] - d[1];
			    var adz = a[2] - d[2];
			    var bdz = b[2] - d[2];
			    var cdz = c[2] - d[2];
			    var bdxcdy = bdx * cdy;
			    var cdxbdy = cdx * bdy;
			    var cdxady = cdx * ady;
			    var adxcdy = adx * cdy;
			    var adxbdy = adx * bdy;
			    var bdxady = bdx * ady;
			    var det = adz * (bdxcdy - cdxbdy)
			            + bdz * (cdxady - adxcdy)
			            + cdz * (adxbdy - bdxady);
			    var permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz)
			                  + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz)
			                  + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz);
			    var tol = ERRBOUND4 * permanent;
			    if ((det > tol) || (-det > tol)) {
			      return det
			    }
			    return orientation4Exact(a,b,c,d)
			  }
			];

			function slowOrient(args) {
			  var proc = CACHED[args.length];
			  if(!proc) {
			    proc = CACHED[args.length] = orientation(args.length);
			  }
			  return proc.apply(undefined, args)
			}

			function proc (slow, o0, o1, o2, o3, o4, o5) {
			  return function getOrientation(a0, a1, a2, a3, a4) {
			    switch (arguments.length) {
			      case 0:
			      case 1:
			        return 0;
			      case 2:
			        return o2(a0, a1)
			      case 3:
			        return o3(a0, a1, a2)
			      case 4:
			        return o4(a0, a1, a2, a3)
			      case 5:
			        return o5(a0, a1, a2, a3, a4)
			    }

			    var s = new Array(arguments.length);
			    for (var i = 0; i < arguments.length; ++i) {
			      s[i] = arguments[i];
			    }
			    return slow(s)
			  }
			}

			function generateOrientationProc() {
			  while(CACHED.length <= NUM_EXPAND) {
			    CACHED.push(orientation(CACHED.length));
			  }
			  module.exports = proc.apply(undefined, [slowOrient].concat(CACHED));
			  for(var i=0; i<=NUM_EXPAND; ++i) {
			    module.exports[i] = CACHED[i];
			  }
			}

			generateOrientationProc(); 
		} (orientation));
		return orientation.exports;
	}

	var robustPnp;
	var hasRequiredRobustPnp;

	function requireRobustPnp () {
		if (hasRequiredRobustPnp) return robustPnp;
		hasRequiredRobustPnp = 1;
		robustPnp = robustPointInPolygon;

		var orient = requireOrientation();

		function robustPointInPolygon(vs, point) {
		  var x = point[0];
		  var y = point[1];
		  var n = vs.length;
		  var inside = 1;
		  var lim = n;
		  for(var i = 0, j = n-1; i<lim; j=i++) {
		    var a = vs[i];
		    var b = vs[j];
		    var yi = a[1];
		    var yj = b[1];
		    if(yj < yi) {
		      if(yj < y && y < yi) {
		        var s = orient(a, b, point);
		        if(s === 0) {
		          return 0
		        } else {
		          inside ^= (0 < s)|0;
		        }
		      } else if(y === yi) {
		        var c = vs[(i+1)%n];
		        var yk = c[1];
		        if(yi < yk) {
		          var s = orient(a, b, point);
		          if(s === 0) {
		            return 0
		          } else {
		            inside ^= (0 < s)|0;
		          }
		        }
		      }
		    } else if(yi < yj) {
		      if(yi < y && y < yj) {
		        var s = orient(a, b, point);
		        if(s === 0) {
		          return 0
		        } else {
		          inside ^= (s < 0)|0;
		        }
		      } else if(y === yi) {
		        var c = vs[(i+1)%n];
		        var yk = c[1];
		        if(yk < yi) {
		          var s = orient(a, b, point);
		          if(s === 0) {
		            return 0
		          } else {
		            inside ^= (s < 0)|0;
		          }
		        }
		      }
		    } else if(y === yi) {
		      var x0 = Math.min(a[0], b[0]);
		      var x1 = Math.max(a[0], b[0]);
		      if(i === 0) {
		        while(j>0) {
		          var k = (j+n-1)%n;
		          var p = vs[k];
		          if(p[1] !== y) {
		            break
		          }
		          var px = p[0];
		          x0 = Math.min(x0, px);
		          x1 = Math.max(x1, px);
		          j = k;
		        }
		        if(j === 0) {
		          if(x0 <= x && x <= x1) {
		            return 0
		          }
		          return 1 
		        }
		        lim = j+1;
		      }
		      var y0 = vs[(j+n-1)%n][1];
		      while(i+1<lim) {
		        var p = vs[i+1];
		        if(p[1] !== y) {
		          break
		        }
		        var px = p[0];
		        x0 = Math.min(x0, px);
		        x1 = Math.max(x1, px);
		        i += 1;
		      }
		      if(x0 <= x && x <= x1) {
		        return 0
		      }
		      var y1 = vs[(i+1)%n][1];
		      if(x < x0 && (y0 < y !== y1 < y)) {
		        inside ^= 1;
		      }
		    }
		  }
		  return 2 * inside - 1
		}
		return robustPnp;
	}

	var robustPnpExports = requireRobustPnp();
	var pointInPolygon2 = /*@__PURE__*/getDefaultExportFromCjs(robustPnpExports);

	// src/HexMap.ts

	// src/EventEmitter.ts
	var EventEmitter = class {
	  constructor() {
	    this.listeners = {};
	  }
	  on(event, listener) {
	    var _a;
	    ((_a = this.listeners)[event] || (_a[event] = [])).push(listener);
	    return this;
	  }
	  off(event, listener) {
	    if (!this.listeners[event]) return this;
	    if (!listener) {
	      delete this.listeners[event];
	      return this;
	    }
	    this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
	    return this;
	  }
	  emit(event, payload) {
	    const list = this.listeners[event];
	    if (!list || list.length === 0) return;
	    for (const listener of list.slice()) {
	      listener(payload);
	    }
	  }
	};

	// src/enums.ts
	var Land = /* @__PURE__ */ ((Land2) => {
	  Land2["sea"] = "sea";
	  Land2["coastal"] = "coastal";
	  Land2["land"] = "land";
	  Land2["sand"] = "sand";
	  Land2["tundra"] = "tundra";
	  Land2["snow"] = "snow";
	  return Land2;
	})(Land || {});
	var LandColor = {
	  ["land" /* land */]: 8694355,
	  ["coastal" /* coastal */]: 5205120,
	  ["sea" /* sea */]: 2766476,
	  ["sand" /* sand */]: 11446117,
	  ["tundra" /* tundra */]: 16777215,
	  ["snow" /* snow */]: 16777215
	};
	var LandPriority = {
	  ["sea" /* sea */]: 0,
	  ["coastal" /* coastal */]: 1,
	  ["land" /* land */]: 2,
	  ["sand" /* sand */]: 3,
	  ["tundra" /* tundra */]: 4,
	  ["snow" /* snow */]: 5
	};
	var UnitActions = /* @__PURE__ */ ((UnitActions3) => {
	  UnitActions3["attack"] = "attack";
	  UnitActions3["walk"] = "walk";
	  UnitActions3["distanceAttack"] = "distanceAttack";
	  UnitActions3["death"] = "death";
	  UnitActions3["idle"] = "idle";
	  UnitActions3["defence"] = "defence";
	  return UnitActions3;
	})(UnitActions || {});

	// src/helpers/helpers.ts
	function getRandomInt(min, max) {
	  min = Math.ceil(min);
	  max = Math.floor(max);
	  return Math.floor(Math.random() * (max - min + 1)) + min;
	}
	function pointy_hex_corner(center, size, i) {
	  let angle_deg = 60 * i;
	  let angle_rad = Math.PI / 180 * angle_deg;
	  return {
	    "x": Math.round(center.x + size * Math.cos(angle_rad)),
	    "y": Math.round(center.y + size * Math.sin(angle_rad))
	  };
	}
	function HEXPolygon(center = { x: 0, y: 0 }, size = 1) {
	  let arrPoints = [];
	  for (let i = 1; i <= 6; i++) {
	    arrPoints.push(pointy_hex_corner(center, size, i));
	  }
	  return arrPoints;
	}
	function getHexCenter(x, y, size) {
	  let space = 0;
	  if (x % 2 == 0) {
	    space = size * Math.sqrt(3) / 2;
	  }
	  return { x: x * size * 1.5, y: y * size * Math.sqrt(3) + space };
	}
	function wait(ms) {
	  return new Promise(function(resolve, reject) {
	    setTimeout(resolve, ms);
	  });
	}
	var GROUND_PLANE = new three.Plane(new three.Vector3(0, 1, 0), 0);
	function screenToGround(clientX, clientY, canvas, camera) {
	  const rect = canvas.getBoundingClientRect();
	  const ndc = new three.Vector2(
	    (clientX - rect.left) / rect.width * 2 - 1,
	    -((clientY - rect.top) / rect.height) * 2 + 1
	  );
	  const raycaster = new three.Raycaster();
	  raycaster.setFromCamera(ndc, camera);
	  const point = new three.Vector3();
	  return raycaster.ray.intersectPlane(GROUND_PLANE, point) ? point : null;
	}
	function pickTile(worldPoint, size, mapWidth, mapHeight) {
	  const approxX = worldPoint.x / (size * 1.5);
	  const approxY = worldPoint.z / (size * Math.sqrt(3));
	  const x0 = Math.floor(approxX);
	  const y0 = Math.floor(approxY);
	  let best = null;
	  let bestDist = Infinity;
	  for (let dx = -1; dx <= 1; dx++) {
	    for (let dy = -1; dy <= 1; dy++) {
	      const x = x0 + dx;
	      const y = y0 + dy;
	      if (x < 0 || y < 0) continue;
	      if (mapWidth !== void 0 && x >= mapWidth) continue;
	      if (mapHeight !== void 0 && y >= mapHeight) continue;
	      const center = getHexCenter(x, y, size);
	      const dist = (center.x - worldPoint.x) ** 2 + (center.y - worldPoint.z) ** 2;
	      if (dist < bestDist) {
	        bestDist = dist;
	        best = { x, y };
	      }
	    }
	  }
	  return best;
	}

	// src/helpers/neighbors.ts
	var NEIGHBOR_DIRECTIONS = ["NE", "N", "NW", "SW", "S", "SE"];
	function getNeighborCoords(x, y, direction) {
	  const odd = x % 2 !== 0;
	  switch (direction) {
	    case "NE":
	      return { x: x + 1, y: odd ? y - 1 : y };
	    case "N":
	      return { x, y: y - 1 };
	    case "NW":
	      return { x: x - 1, y: odd ? y - 1 : y };
	    case "SW":
	      return { x: x - 1, y: odd ? y : y + 1 };
	    case "S":
	      return { x, y: y + 1 };
	    case "SE":
	      return { x: x + 1, y: odd ? y : y + 1 };
	  }
	}
	function getNeighbors(x, y) {
	  return NEIGHBOR_DIRECTIONS.map((direction) => ({ direction, ...getNeighborCoords(x, y, direction) }));
	}
	function subdivideTriangle(a, b, c, numSubdivisions) {
	  if ((numSubdivisions || 0) <= 0) return [a, b, c];
	  const ba = b.clone().sub(a);
	  const ah = a.clone().add(ba.setLength(ba.length() / 2));
	  const cb = c.clone().sub(b);
	  const bh = b.clone().add(cb.setLength(cb.length() / 2));
	  const ac = a.clone().sub(c);
	  const ch = c.clone().add(ac.setLength(ac.length() / 2));
	  return [].concat(
	    subdivideTriangle(ah, bh, ch, numSubdivisions - 1),
	    subdivideTriangle(ch, bh, c, numSubdivisions - 1),
	    subdivideTriangle(ah, ch, a, numSubdivisions - 1),
	    subdivideTriangle(bh, ah, b, numSubdivisions - 1)
	  );
	}
	function createHexagonGeometry(radius, numSubdivisions = 0) {
	  const numFaces = 6 * Math.pow(4, numSubdivisions);
	  const positions = new Float32Array(numFaces * 3 * 3);
	  const texcoords = new Float32Array(numFaces * 3 * 2);
	  let p = 0, t = 0;
	  const points = [0, 1, 2, 3, 4, 5].map((i) => {
	    const angle = Math.PI / 180 * (60 * i);
	    return new three.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
	  }).concat([new three.Vector3(0, 0, 0)]);
	  const faces = [0, 6, 1, 1, 6, 2, 2, 6, 3, 3, 6, 4, 4, 6, 5, 5, 6, 0];
	  let vertices = [];
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
	  const geometry = new three.BufferGeometry();
	  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
	  geometry.setAttribute("uv", new three.BufferAttribute(texcoords, 2));
	  return geometry;
	}
	function makeTextSprite(message, parameters) {
	  if (parameters === void 0) parameters = {};
	  let fontface = parameters.hasOwnProperty("fontface") ? parameters["fontface"] : "Arial";
	  let fontsize = parameters.hasOwnProperty("fontsize") ? parameters["fontsize"] : 18;
	  let borderThickness = parameters.hasOwnProperty("borderThickness") ? parameters["borderThickness"] : 4;
	  let borderColor = parameters.hasOwnProperty("borderColor") ? parameters["borderColor"] : { r: 0, g: 0, b: 0, a: 1 };
	  let backgroundColor = parameters.hasOwnProperty("backgroundColor") ? parameters["backgroundColor"] : { r: 255, g: 255, b: 255, a: 1 };
	  let canvas = document.createElement("canvas");
	  let context = canvas.getContext("2d");
	  context.font = "Bold " + fontsize + "px " + fontface;
	  let metrics = context.measureText(message);
	  let textWidth = metrics.width;
	  const width = Math.ceil(textWidth + borderThickness * 2);
	  const height = Math.ceil(fontsize * 1.4 + borderThickness * 2);
	  canvas.width = width;
	  canvas.height = height;
	  context = canvas.getContext("2d");
	  context.font = "Bold " + fontsize + "px " + fontface;
	  context.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
	  context.strokeStyle = "rgba(" + borderColor.r + "," + borderColor.g + "," + borderColor.b + "," + borderColor.a + ")";
	  context.lineWidth = borderThickness;
	  roundRect(context, borderThickness / 2, borderThickness / 2, textWidth + borderThickness, fontsize * 1.4 + borderThickness, 6);
	  context.fillStyle = "rgba(0, 0, 0, 1.0)";
	  context.fillText(message, borderThickness, fontsize + borderThickness);
	  var texture = new three.Texture(canvas);
	  texture.needsUpdate = true;
	  var spriteMaterial = new three.SpriteMaterial(
	    { map: texture, transparent: true, depthWrite: false }
	  );
	  var sprite = new three.Sprite(spriteMaterial);
	  const scale = 100 / 300;
	  sprite.scale.set(width * scale, height * scale, 1);
	  return sprite;
	}
	function roundRect(ctx, x, y, w, h, r) {
	  ctx.beginPath();
	  ctx.moveTo(x + r, y);
	  ctx.lineTo(x + w - r, y);
	  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	  ctx.lineTo(x + w, y + h - r);
	  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	  ctx.lineTo(x + r, y + h);
	  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	  ctx.lineTo(x, y + r);
	  ctx.quadraticCurveTo(x, y, x + r, y);
	  ctx.closePath();
	  ctx.fill();
	  ctx.stroke();
	}
	var DEFAULT_INFO = {
	  offset: { x: 0, y: 0, z: 0 },
	  rotation: { x: 0, y: 0, z: 0 },
	  scale: 1
	};
	function loadGLTF(url) {
	  return new Promise((resolve, reject) => {
	    new GLTFLoader().load(url, (gltf) => resolve(gltf.scene), void 0, reject);
	  });
	}
	async function loadInfo(url) {
	  try {
	    const response = await fetch(url);
	    if (!response.ok) return DEFAULT_INFO;
	    return { ...DEFAULT_INFO, ...await response.json() };
	  } catch {
	    return DEFAULT_INFO;
	  }
	}
	function fixupMatrix(info) {
	  const rotation = new three.Euler(
	    three.MathUtils.degToRad(info.rotation.x),
	    three.MathUtils.degToRad(info.rotation.y),
	    three.MathUtils.degToRad(info.rotation.z)
	  );
	  return new three.Matrix4().compose(
	    new three.Vector3(info.offset.x, info.offset.y, info.offset.z),
	    new three.Quaternion().setFromEuler(rotation),
	    new three.Vector3(info.scale, info.scale, info.scale)
	  );
	}
	var cache = /* @__PURE__ */ new Map();
	function loadModel(path) {
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

	// src/shaders/terrain.vertex.ts
	var TERRAIN_VERTEX_SHADER = `
precision mediump float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// (atlas width, atlas height, cell size, cell spacing)
uniform vec4 textureAtlasMeta;
uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)

// Beach slope towards water neighbors (see neighborsKindA/B below). waterLevel
// is where the water plane sits (see water.vertex.ts) - a coastal land tile's
// rim sinks to meet it instead of staying flat and only color-blending in 2D.
// beachWidth is the fraction of the tile's radius over which the slope happens.
uniform float waterLevel;
uniform float beachWidth;
uniform float sandAtlasIndex;

// World units one repeat of the war-fog texture spans. Fog UVs are computed
// from world position (not per-tile local UVs) so one copy of the texture
// flows continuously across every fogged tile - the image tiles seamlessly on
// each side, so neighboring repeats merge with no visible hex-shaped seams.
uniform float fogTextureSize;

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;       // world-space (x,z) offset of this tile instance
attribute vec3 style;        // x = atlas cell index, y = modifier bitmask (reserved for hill/etc.), z = edge-blend priority
attribute vec3 neighborsA;   // atlas cell index of SE/S/SW neighbor (-1 = none)
attribute vec3 neighborsB;   // atlas cell index of NW/N/NE neighbor (-1 = none)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying vec2 vUV;
varying vec2 vTexCoord;
varying float vBorder;
varying float vTerrain;
varying float vModifiers;
varying float vPriority;
varying vec3 vNeighborsA;
varying vec3 vNeighborsB;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vEdgeFactorsA; // SE, S, SW
varying vec3 vEdgeFactorsB; // NW, N, NE
varying vec3 vNormal;
varying float vBeachT; // 0 = normal land color, 1 = fully sand (see terrain.fragment.ts)
varying float vFogState;
varying vec2 vFogUV; // world-space fog texture coords, continuous across tiles

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

vec2 cellIndexToUV(float idx) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    float cols = atlasWidth / cellSize;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);

    return vec2(x / cols + uv.x / cols, 1.0 - (y / rows + (1.0 - uv.y) / rows));
}

// Tracks the strongest "closeness to a water-adjacent edge" (see
// vEdgeFactorsA/B) together with the direction it came from, so both the
// height (sink towards waterLevel) and its slope (for lighting normals) can be
// derived from the same single dominant edge.
vec3 strongestWaterEdge(vec3 best, float kind, float factor, vec2 dir) {
    if (kind >= 1.0 && factor > best.x) return vec3(factor, dir);
    return best;
}

void main() {
    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;

    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;

    vec3 best = vec3(0.0); // (edgeFactor, dir.x, dir.y)
    best = strongestWaterEdge(best, neighborsKindA.x, vEdgeFactorsA.x, DIR_SE);
    best = strongestWaterEdge(best, neighborsKindA.y, vEdgeFactorsA.y, DIR_S);
    best = strongestWaterEdge(best, neighborsKindA.z, vEdgeFactorsA.z, DIR_SW);
    best = strongestWaterEdge(best, neighborsKindB.x, vEdgeFactorsB.x, DIR_NW);
    best = strongestWaterEdge(best, neighborsKindB.y, vEdgeFactorsB.y, DIR_N);
    best = strongestWaterEdge(best, neighborsKindB.z, vEdgeFactorsB.z, DIR_NE);

    // beachWidth is the *total* transition width shared with the water layer's
    // own mirrored slope (see water.vertex.ts) - each side only covers half of
    // it, so the two meet in the middle of the shared edge instead of the
    // whole transition being crammed into the land tile alone.
    float waterEdge = clamp(best.x, 0.0, 1.0);
    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float beachT = smoothstep(e0, 1.0, waterEdge);

    // Unseen (fog of war): keep the tile perfectly flat - a coastal land
    // tile's sunken beach rim would betray that water sits next door, which
    // the fog is supposed to hide.
    float fogVisible = fogState < 0.5 ? 0.0 : 1.0;

    // Land only sinks *half* the way down to waterLevel - the water layer
    // rises to meet it the other half (see water.vertex.ts's riseY), so the
    // two tiles' fall is evenly split instead of the whole drop happening on
    // the land side alone. The extra *1.2 nudges land slightly past that
    // midpoint (rather than exactly onto it) so the two meshes' edges don't
    // end up perfectly coincident and z-fight (flickery dark patches).
    float sinkY = beachT * (waterLevel * 0.5) * 1.2 * fogVisible;
    vec3 pos = vec3(offset.x + position.x, position.y + sinkY, offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // analytic slope of sinkY w.r.t. local (x,z), via the chain rule through
    // smoothstep, for lighting - see water.vertex.ts for the same idea applied
    // to waves. Only the single dominant edge direction is considered, which is
    // exact away from corners and a reasonable approximation right at them.
    float xN = clamp((waterEdge - e0) / (1.0 - e0), 0.0, 1.0);
    float dSmooth = waterEdge > 0.0 ? 6.0 * xN * (1.0 - xN) / (1.0 - e0) : 0.0;
    vec2 slope = (waterLevel * 0.5) * 1.2 * dSmooth * (best.yz / apothem) * fogVisible;
    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));

    // Rim distance for the grid line - NOT radial distance from center
    // (length(local)/hexSize): that only reaches 1.0 exactly at the 6 corners
    // and dips to ~0.866 (the apothem) at an edge's midpoint, since a hexagon's
    // boundary is 6 straight chords, not a circle. That went unnoticed while
    // this geometry had 0 subdivisions (both rim vertices of every wedge sat
    // exactly at a corner, so linear interpolation between two 1.0s stayed
    // 1.0 the whole edge) - once subdivided, the new mid-edge vertices' lower
    // radial value made the grid line threshold fail there, fragmenting a
    // continuous hex outline into isolated blobs at each corner. The edge
    // factors above are already exactly 1.0 along an entire straight edge
    // (not just at its endpoints), so reusing their max is the correct metric.
    float rimFactor = max(max(max(vEdgeFactorsA.x, vEdgeFactorsA.y), max(vEdgeFactorsA.z, vEdgeFactorsB.x)), max(vEdgeFactorsB.y, vEdgeFactorsB.z));

    vUV = uv;
    vBorder = clamp(rimFactor, 0.0, 1.0);
    vTerrain = style.x;
    vModifiers = style.y;
    vPriority = style.z;
    vBeachT = beachT;
    vTexCoord = cellIndexToUV(style.x);
    vNeighborsA = neighborsA;
    vNeighborsB = neighborsB;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vFogState = fogState;
    // Axes swapped/negated (not a plain pos.xz mapping) so the image reads
    // upright from this map's camera: the camera's azimuth is locked to ~90deg
    // (see HexMap's setupControls), which puts screen-right along world -Z and
    // screen-up along world -X - mapping u to -z and v to -x orients the
    // texture to the screen and keeps it un-mirrored when viewed from above.
    // Negation is free for a seamlessly wrapping texture (just a phase shift).
    vFogUV = vec2(-pos.z, -pos.x) / fogTextureSize;
}
`;

	// src/shaders/terrain.fragment.ts
	var TERRAIN_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D map;
uniform vec4 textureAtlasMeta;
uniform float sandAtlasIndex;
uniform float landBlendWidth; // 0..1 fraction of tile radius, land-to-land diffusion size

uniform sampler2D fogMap;        // war-fog.jpg, tiled per-tile via vUV (not atlas-indexed)
uniform float fogDarkenFactor;   // color multiplier for Explored (fogState 1) tiles

uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;

uniform vec3 lightDir;

varying vec2 vUV;
varying vec2 vTexCoord;
varying float vBorder;
varying float vTerrain;
varying float vModifiers;
varying float vPriority;
varying vec3 vNeighborsA;
varying vec3 vNeighborsB;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying vec3 vNormal;
varying float vBeachT;
varying float vFogState;
varying vec2 vFogUV;

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);

vec2 cellIndexToUV(float idx) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    // subtract a small epsilon to avoid edge flickering when sampling the last column/row
    float cols = atlasWidth / cellSize - 1e-6;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);

    return vec2(x / cols + vUV.x / cols, 1.0 - (y / rows + (1.0 - vUV.y) / rows));
}

// Blends towards a neighboring tile's atlas texture near the edge actually
// shared with it. factor (from vEdgeFactorsA/B, see terrain.vertex.ts) is an
// analytic "closeness to that specific edge" value: 1.0 exactly on the shared
// edge, fading to 0 towards the opposite side of the hex. landBlendWidth
// compresses that fade into just the outer fraction of the tile (0..1) instead
// of spanning the whole distance to the far side, so the transition band's
// size is controllable instead of always being "the whole tile".
//
// Only blends towards a STRICTLY higher-priority neighbor (neighborPriority >
// vPriority - see enums.ts LandPriority). Without this, a shared edge blended
// both ways at once (e.g. land fading into water AND water fading into land),
// which reads as a fuzzy halo on both sides of every border instead of a single
// one-directional transition.
vec4 blendEdge(vec4 inputColor, float neighborTerrain, float neighborPriority, float factor) {
    if (neighborTerrain < 0.0 || neighborTerrain == vTerrain) return inputColor;
    if (neighborPriority <= vPriority) return inputColor;

    vec2 otherUV = cellIndexToUV(neighborTerrain);
    vec4 neighborColor = texture2D(map, otherUV);

    float e0 = 1.0 - clamp(landBlendWidth, 0.001, 1.0);
    float t = smoothstep(e0, 1.0, factor);
    return mix(inputColor, neighborColor, t);
}

void main() {
    // Unseen: replace the tile outright with the war-fog texture, skipping
    // every other layer/lighting/grid computation below. vFogUV is computed
    // from *world* position (see terrain.vertex.ts), so one repeat of the
    // texture spans several tiles and flows seamlessly across every fogged
    // hex - no per-tile square-texture-in-a-hex seams.
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    vec4 texColor = texture2D(map, vTexCoord);

    texColor = blendEdge(texColor, vNeighborsA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x); // SE
    texColor = blendEdge(texColor, vNeighborsA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y); // S
    texColor = blendEdge(texColor, vNeighborsA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z); // SW
    texColor = blendEdge(texColor, vNeighborsB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x); // NW
    texColor = blendEdge(texColor, vNeighborsB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y); // N
    texColor = blendEdge(texColor, vNeighborsB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z); // NE

    // Beach: fade to sand near any edge that slopes down towards water (see
    // vBeachT / neighborsKindA/B in terrain.vertex.ts) - this is what actually
    // reads as a "shore" once the tile sinks towards waterLevel there, instead
    // of a flat 2D color blend against the water tile's own color.
    if (vBeachT > 0.0) {
        vec4 sandColor = texture2D(map, cellIndexToUV(sandAtlasIndex));
        texColor = mix(texColor, sandColor, vBeachT);
    }

    vec3 normal = normalize(vNormal);
    float lambertian = max(dot(normalize(lightDir), normal), 0.0);
    vec3 color = lightAmbient * texColor.rgb + lambertian * lightDiffuse * texColor.rgb;

    // Explored (previously seen, currently outside every unit's view range):
    // keep every feature visible, just darker - the "remembered" Civ-style look.
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;

	// src/shaders/water.vertex.ts
	var WATER_VERTEX_SHADER = `
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)
uniform float uTime;   // seconds, animates the waves
uniform float waterLevel; // rest height of the water plane (usually negative, below land)

// Wave shape - see waveHeightAndSlope() below.
uniform float waveAmplitude;
uniform float waveFrequency;
uniform float waveSpeed;

// Beach: waterLevel is where the water plane sits, waveAmplitude/etc animate it -
// but near an actual coastline (a land-adjacent edge/corner, see coastalFactor()
// below) the water settles down to a flat shore instead of waving right up to
// the sand. beachWidth is the *total* transition width shared with the land
// layer's own mirrored slope (see terrain.vertex.ts) - each side only covers
// half of it. waterCornerRounding (0..1) controls how much a corner shared by
// two land-adjacent edges rounds off instead of meeting at a sharp point.
uniform float beachWidth;
uniform float waterCornerRounding;
uniform float fogTextureSize; // world units one repeat of the fog texture spans (see terrain.vertex.ts)

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;
attribute vec3 style;        // x = atlas cell index (unused here), y = modifiers, z = priority (0 = sea, 1 = coastal)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying vec2 vUV;
varying float vBorder;
varying float vPriority;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA; // SE, S, SW
varying vec3 vEdgeFactorsB; // NW, N, NE
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vBeachT; // 0 = open water, 1 = right at the shore (see terrain.fragment.ts's vBeachT)
varying float vShoreT; // like vBeachT but unsquashed by beachWidth: raw 0 (tile center) .. 1 (land edge) coastal distance, 0 on tiles with no land neighbor - drives the foam bands in water.fragment.ts
varying float vFogState;
varying vec2 vFogUV; // world-space fog texture coords, continuous across tiles

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

const float GOLDEN_ANGLE = 2.399963; // ~137.5 deg, keeps summed waves from lining up

// Sum of sine waves (NVIDIA GPU Gems ocean approach): height is a sum of sines
// of the world-space position; the *derivative* of a sine is a cosine of the
// same phase, so the surface normal's slope can be computed analytically in
// the same loop instead of sampling a normal map.
// Returns (height, slope.x, slope.z).
vec3 waveHeightAndSlope(vec2 worldXZ, float t) {
    float height = 0.0;
    vec2 slope = vec2(0.0);

    float amp = waveAmplitude;
    float freq = waveFrequency;
    float speed = waveSpeed;
    float dirAngle = 0.4;

    for (int i = 0; i < 4; i++) {
        vec2 dir = vec2(cos(dirAngle), sin(dirAngle));
        float phase = dot(dir, worldXZ) * freq + t * speed;

        height += amp * sin(phase);
        slope += dir * (amp * freq * cos(phase));

        amp *= 0.55;
        freq *= 1.8;
        speed *= 1.3;
        dirAngle += GOLDEN_ANGLE;
    }

    return vec3(height, slope.x, slope.y);
}

// Only an edge whose neighbor is real land (kind == 0, not sea/coastal/off-map)
// counts as "coastal" - mirrors the land shader's opposite check (kind >= 1.0).
float isLandKind(float kind) {
    return (kind > -0.5 && kind < 0.5) ? 1.0 : 0.0;
}

// Rounds off a corner shared by two coastal edges instead of leaving a sharp
// wedge where their two straight falloffs meet. Both dA/dB are already
// clamped to >= 0 (distance past the tile's own center towards that edge), so
// at the actual hex corner both equal ~1 regardless of which edge you ask -
// length() there extends the reach slightly beyond either edge alone, forming
// a rounded arc; mix() lets waterCornerRounding dial that between "sharp"
// (plain max, same as a single straight edge) and "fully rounded".
// Returns a negative sentinel if either edge isn't itself coastal, so a
// corner with only one land-adjacent edge never gets any rounding treatment.
float roundedCorner(float isLandA, float isLandB, float dA, float dB) {
    if (isLandA < 0.5 || isLandB < 0.5) return -1.0;
    float sharp = max(dA, dB);
    float rounded = length(vec2(dA, dB));
    return mix(sharp, rounded, clamp(waterCornerRounding, 0.0, 1.0));
}

void main() {
    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;

    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;

    float isLandSE = isLandKind(neighborsKindA.x);
    float isLandS  = isLandKind(neighborsKindA.y);
    float isLandSW = isLandKind(neighborsKindA.z);
    float isLandNW = isLandKind(neighborsKindB.x);
    float isLandN  = isLandKind(neighborsKindB.y);
    float isLandNE = isLandKind(neighborsKindB.z);

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    // straight per-edge contribution: a single coastal edge (water on both
    // sides of it around the tile) never triggers the corner rounding below.
    float coastal = -1.0;
    coastal = max(coastal, isLandSE > 0.5 ? vEdgeFactorsA.x : -1.0);
    coastal = max(coastal, isLandS  > 0.5 ? vEdgeFactorsA.y : -1.0);
    coastal = max(coastal, isLandSW > 0.5 ? vEdgeFactorsA.z : -1.0);
    coastal = max(coastal, isLandNW > 0.5 ? vEdgeFactorsB.x : -1.0);
    coastal = max(coastal, isLandN  > 0.5 ? vEdgeFactorsB.y : -1.0);
    coastal = max(coastal, isLandNE > 0.5 ? vEdgeFactorsB.z : -1.0);

    // corner rounding, only where two *adjacent* edges are both coastal.
    coastal = max(coastal, roundedCorner(isLandSE, isLandS,  dSE, dS));
    coastal = max(coastal, roundedCorner(isLandS,  isLandSW, dS,  dSW));
    coastal = max(coastal, roundedCorner(isLandSW, isLandNW, dSW, dNW));
    coastal = max(coastal, roundedCorner(isLandNW, isLandN,  dNW, dN));
    coastal = max(coastal, roundedCorner(isLandN,  isLandNE, dN,  dNE));
    coastal = max(coastal, roundedCorner(isLandNE, isLandSE, dNE, dSE));

    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float beachT = smoothstep(e0, 1.0, clamp(coastal, 0.0, 1.0));

    vec2 worldXZ = offset + position.xz;
    vec3 hs = waveHeightAndSlope(worldXZ, uTime);

    // Unseen (fog of war, see FogOfWar.ts): freeze the waves AND raise the
    // tile to land's rest height (y=0). A tile that kept animating - or even
    // just sat visibly lower than its land neighbors - would still read as
    // "there is water here" through fog that is supposed to hide everything.
    float fogVisible = fogState < 0.5 ? 0.0 : 1.0;

    // damp the wave out towards the shore (beachT -> 1) instead of a purely
    // radial falloff - a radial one shrinks towards *every* corner regardless
    // of what's actually next door, flattening/"rounding" corners between
    // three water tiles too where nothing should change at all.
    float damp = (1.0 - beachT) * fogVisible;
    float waveY = hs.x * damp;
    vec2 slope = hs.yz * damp;

    // Water rises *half* the way up towards land's own rest height (0) as it
    // nears the shore - land sinks the other half towards waterLevel (see
    // terrain.vertex.ts's sinkY) - so the total drop between the two tiles is
    // evenly split instead of the water side staying flat at waterLevel while
    // land does all the work alone. waterLevel is negative, so -waterLevel*0.5
    // is a positive lift.
    float riseY = beachT * (-waterLevel * 0.5);

    vec3 pos = vec3(offset.x + position.x, mix(0.0, waterLevel + waveY + riseY, fogVisible), offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));
    vWorldPos = pos;

    // Rim distance for the grid line - see terrain.vertex.ts's rimFactor
    // comment: radial distance from center is wrong for a hexagon (it dips to
    // the apothem at edge midpoints instead of staying 1.0 along the whole
    // edge), which fragments the grid line into corner-only blobs once the
    // geometry is subdivided. The edge factors already computed above are the
    // correct, constant-along-the-edge metric.
    float rimFactor = max(max(max(vEdgeFactorsA.x, vEdgeFactorsA.y), max(vEdgeFactorsA.z, vEdgeFactorsB.x)), max(vEdgeFactorsB.y, vEdgeFactorsB.z));

    vUV = uv;
    vBorder = clamp(rimFactor, 0.0, 1.0);
    vPriority = style.z;
    vBeachT = beachT;
    vShoreT = clamp(coastal, 0.0, 1.0);
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;
    vFogState = fogState;
    // Same upright-for-the-camera mapping as terrain.vertex.ts's vFogUV -
    // u along world -Z, v along world -X - so land and water sample the fog
    // texture identically and it stays continuous across the two layers.
    vFogUV = vec2(-worldXZ.y, -worldXZ.x) / fogTextureSize;
}
`;

	// src/shaders/water.fragment.ts
	var WATER_FRAGMENT_SHADER = `
precision highp float;

uniform vec4 textureAtlasMeta;

uniform sampler2D fogMap;        // war-fog.jpg, tiled per-tile via vUV
uniform float fogDarkenFactor;   // color multiplier for Explored (fogState 1) tiles

uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;

uniform vec3 lightDir;
uniform vec3 cameraPosition; // auto-provided by three.js each frame

uniform vec3 waterColorDeep;
uniform vec3 waterColorShallow;
uniform float sparkleIntensity;
uniform float fresnelIntensity;

// Stylized coastal foam (after Harry Alisavakis' "My take on shaders: Stylized
// water shader" - his foam comes from a scene-depth difference + scrolling
// noise texture; this engine has no depth pass, but vShoreT is exactly the
// same "how close to the shore is this fragment" signal, so the foam recipe
// (noise-distorted bands marching towards the waterline + a solid lapping
// edge) ports directly onto it).
uniform float hexSize;        // shared with the vertex stage (commonUniforms)
uniform float uTime;          // shared with the vertex stage's wave clock
uniform float foamEnabled;    // 0/1 gate, cheap enough to keep as a uniform
uniform vec3 foamColor;
uniform float foamCount;      // wave bands per shore-to-center span
uniform float foamSpeed;      // bands' travel speed towards the shore
uniform float foamWidth;      // band thickness, fraction of one band's wavelength
uniform float foamRange;      // how far out from the shore bands reach (0..1 of tile radius)
uniform float foamDistortion; // 0..1, how strongly noise bends/breaks the bands
uniform float foamOpacity;

varying vec2 vUV;
varying float vBorder;
varying float vPriority;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vBeachT;
varying float vShoreT;
varying float vFogState;
varying vec2 vFogUV;

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);
const vec3 sparkleColor = vec3(1.0, 0.97, 0.85);
const vec3 skyTint = vec3(0.85, 0.95, 1.0);

// Picks the single strongest edge among the 6 whose neighbor both passes the
// one-directional priority gate and is itself water (a sea tile bordering a
// shallower coastal tile), returning (bestFactor, kind). Mirrors the land
// shader's strongestWaterEdge() (see terrain.vertex.ts).
vec2 strongestWaterEdge(vec2 best, float kind, float priority, float factor) {
    if (kind < 0.5 || priority <= vPriority) return best;
    if (factor > best.x) return vec2(factor, kind);
    return best;
}

// Cheap value noise - stands in for the article's scrolling noise texture
// (keeps the shader texture-free like the rest of this water layer).
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// Coastal foam factor (0..1) for the current fragment. Two parts, both keyed
// off shoreDist = 1 - vShoreT (0 exactly at the waterline, i.e. the edge
// shared with a land tile - where the water's rise and land's sink meet):
//   1) travelling bands: fract(shoreDist * foamCount + t) makes foamCount
//      bands whose crests march towards the shore as t grows, faded out with
//      distance so they read as swells rolling in and dying at the beach;
//   2) lapping edge: a solid strip of foam hugging the waterline itself.
// World-space value noise perturbs both so the bands wobble and tear instead
// of tracing the hex outline as perfect straight/parallel lines.
float coastalFoam(vec2 worldXZ, float t) {
    float shoreDist = 1.0 - vShoreT;

    // ~3 noise cells per tile radius; the second, slowly scrolling octave
    // keeps the tear pattern itself alive instead of frozen in world space.
    float n = valueNoise(worldXZ * (3.0 / hexSize) + vec2(0.0, t * 0.2));
    n = 0.5 * n + 0.5 * valueNoise(worldXZ * (7.0 / hexSize) - vec2(t * 0.15, 0.0));
    float distort = (n - 0.5) * foamDistortion;

    // 1) travelling bands
    float phase = fract(shoreDist * foamCount + t * foamSpeed + distort * 2.0);
    float halfW = clamp(foamWidth, 0.02, 1.0) * 0.5;
    float band = smoothstep(halfW, halfW * 0.35, abs(phase - 0.5));
    float fade = 1.0 - smoothstep(foamRange * 0.35, max(foamRange, 0.001), shoreDist);
    // noise also modulates each band's strength so crests come and go
    band *= fade * (0.55 + 0.45 * n);

    // 2) lapping edge, its reach wobbling with the same noise
    float edge = smoothstep(0.12, 0.0, shoreDist + distort * 0.35);

    return clamp(edge + band, 0.0, 1.0) * foamOpacity;
}

void main() {
    // Unseen: same short-circuit as the land layer (terrain.fragment.ts) -
    // replace the tile outright with the war-fog texture, skipping the wave
    // lighting/sparkle/fresnel/grid work below entirely. vFogUV is world-space
    // (see terrain.vertex.ts's comment), so the texture flows seamlessly
    // across neighboring fogged tiles instead of restarting per hex.
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    // self color: this mesh only ever contains sea (priority 0) / coastal
    // (priority 1) tiles (see TerrainMesh's WATER_TYPES split), so vPriority
    // alone is enough to tell which one a given instance is.
    vec4 texColor = vec4(vPriority < 0.5 ? waterColorDeep : waterColorShallow, 1.0);

    // water-to-water (e.g. sea blending towards a shallower coastal tile): blend once,
    // towards the single closest higher-priority water edge.
    vec2 water = vec2(0.0);
    water = strongestWaterEdge(water, vNeighborsKindA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x);
    water = strongestWaterEdge(water, vNeighborsKindA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y);
    water = strongestWaterEdge(water, vNeighborsKindA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z);
    water = strongestWaterEdge(water, vNeighborsKindB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x);
    water = strongestWaterEdge(water, vNeighborsKindB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y);
    water = strongestWaterEdge(water, vNeighborsKindB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z);
    if (water.x > 0.0) {
        vec3 otherColor = water.y > 1.5 ? waterColorShallow : waterColorDeep;
        texColor = mix(texColor, vec4(otherColor, 1.0), clamp(water.x, 0.0, 1.0));
    }

    // shoreline: lighten towards a foamy/sandy tint as the water nears an
    // actual coastline (vBeachT, computed from land-adjacent edges/corners in
    // water.vertex.ts - mirrors the land layer's own beach slope, each side
    // covering half of beachWidth so they meet in the middle of the shared
    // edge). Blending towards waterColorShallow itself would be a no-op on a
    // map with no "sea" tiles (every water tile is already priority 1 =
    // shallow, so texColor is already waterColorShallow) - blend towards a
    // brightened version instead so the effect is visible regardless of
    // whether the tile started as deep or shallow.
    if (vBeachT > 0.0) {
        vec3 shoreColor = mix(waterColorShallow, vec3(1.0), 0.5);
        texColor = mix(texColor, vec4(shoreColor, 1.0), vBeachT);
    }

    vec3 normal = normalize(vNormal);
    vec3 light = normalize(lightDir);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float ndotl = max(dot(normal, light), 0.0);
    vec3 color = lightAmbient * texColor.rgb + ndotl * lightDiffuse * texColor.rgb;

    // sun glitter: sharp specular highlight off the wave-perturbed normal
    vec3 halfDir = normalize(light + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 60.0);
    color += spec * sparkleColor * sparkleIntensity;

    // cheap fresnel: brighten towards a fixed sky tint at grazing angles,
    // instead of a real planar reflection render target.
    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
    color = mix(color, skyTint, fresnel * 0.5 * fresnelIntensity);

    // coastal foam waves - only fragments on a land-adjacent tile have
    // vShoreT > 0, so open sea skips the noise work entirely. Applied before
    // the fog darkening below so foam on Explored tiles dims with the water.
    if (foamEnabled > 0.5 && vShoreT > 0.001) {
        color = mix(color, foamColor, coastalFoam(vWorldPos.xz, uTime));
    }

    // Explored (previously seen, currently outside every unit's view range):
    // keep the water visible, just darker - mirrors the land layer's own
    // fogState handling in terrain.fragment.ts.
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;

	// src/objects/TerrainMesh.ts
	var WATER_TYPES = ["sea" /* sea */, "coastal" /* coastal */];
	var TerrainMesh = class extends three.Group {
	  constructor(map, options) {
	    super();
	    this.options = options;
	    this.tileIndex = /* @__PURE__ */ new Map();
	    // "x,y" -> instance index (land layer only)
	    this.waterTileIndex = /* @__PURE__ */ new Map();
	    // "x,y" -> instance index (water layer only)
	    this.cityFog = /* @__PURE__ */ new Map();
	    this.atlasCellIndex = {};
	    this.clock = 0;
	    this.map = map;
	    this.waterAnimationEnabled = options.waterAnimation !== false;
	    this.buildAtlasCellIndex();
	    this.fogTexture = this.loadFogTexture();
	    const allTiles = [];
	    for (let x = 0; x < this.map.w; x++) {
	      for (let y = 0; y < this.map.h; y++) {
	        if (this.map.data[x]?.[y]) allTiles.push({ x, y });
	      }
	    }
	    const isWater = (tile) => WATER_TYPES.includes(this.map.data[tile.x][tile.y].type);
	    if (this.waterAnimationEnabled) {
	      this.buildLandLayer(allTiles.filter((t) => !isWater(t)));
	      this.buildWaterLayer(allTiles.filter(isWater));
	    } else {
	      this.buildLandLayer(allTiles);
	    }
	  }
	  buildAtlasCellIndex() {
	    const atlas = this.options.atlas;
	    const cols = atlas.width / atlas.cellSize;
	    for (const name in atlas.textures) {
	      const cell = atlas.textures[name];
	      this.atlasCellIndex[name] = cell.cellY * cols + cell.cellX;
	    }
	  }
	  //Atlas cell index for a tile's terrain type. Returns -1 if the tile doesn't
	  //exist (used for out-of-map neighbors).
	  cellIndexFor(x, y) {
	    const row = this.map.data[x];
	    const tile = row ? row[y] : void 0;
	    if (!tile) return -1;
	    const cell = this.atlasCellIndex[tile.type];
	    return cell === void 0 ? -1 : cell;
	  }
	  //Edge-blend priority of a tile's terrain type (see enums.ts LandPriority).
	  //Returns -Infinity for out-of-map neighbors so a border tile never blends
	  //towards "nothing".
	  priorityFor(x, y) {
	    const row = this.map.data[x];
	    const tile = row ? row[y] : void 0;
	    return tile ? LandPriority[tile.type] : -Infinity;
	  }
	  //-1 no tile, 0 non-water, 1 sea, 2 coastal - drives the land layer's beach
	  //slope and the water layer's edge-color resolution (see shaders). Always 0
	  //when waterAnimation is off, so no slope/solid-color logic ever triggers
	  //and everything renders exactly like the flat, atlas-only original.
	  kindFor(x, y) {
	    if (!this.waterAnimationEnabled) return 0;
	    const row = this.map.data[x];
	    const tile = row ? row[y] : void 0;
	    if (!tile) return -1;
	    const waterIndex = WATER_TYPES.indexOf(tile.type);
	    return waterIndex === -1 ? 0 : waterIndex + 1;
	  }
	  //Builds the per-instance attribute arrays (offset/style/neighbors/neighbor
	  //priorities/kinds) shared by every layer - land and water tiles are laid
	  //out identically, only the geometry/shader differ.
	  buildInstanceAttributes(tiles) {
	    const { size } = this.options;
	    const attrs = {
	      offset: new Float32Array(tiles.length * 2),
	      style: new Float32Array(tiles.length * 3),
	      neighborsA: new Float32Array(tiles.length * 3),
	      neighborsB: new Float32Array(tiles.length * 3),
	      neighborsPriorityA: new Float32Array(tiles.length * 3),
	      neighborsPriorityB: new Float32Array(tiles.length * 3),
	      neighborsKindA: new Float32Array(tiles.length * 3),
	      neighborsKindB: new Float32Array(tiles.length * 3),
	      fogState: new Float32Array(tiles.length).fill(2)
	      // default Visible - see FogOfWar.ts
	    };
	    tiles.forEach((tile, i) => {
	      const info = this.map.data[tile.x][tile.y];
	      const center = getHexCenter(tile.x, tile.y, size);
	      attrs.offset[i * 2 + 0] = center.x;
	      attrs.offset[i * 2 + 1] = center.y;
	      attrs.style[i * 3 + 0] = this.atlasCellIndex[info.type] ?? 0;
	      attrs.style[i * 3 + 1] = info.modifiers?.includes("hill") ? 1 : 0;
	      attrs.style[i * 3 + 2] = LandPriority[info.type] ?? 0;
	      const se = getNeighborCoords(tile.x, tile.y, "SE");
	      const s = getNeighborCoords(tile.x, tile.y, "S");
	      const sw = getNeighborCoords(tile.x, tile.y, "SW");
	      const nw = getNeighborCoords(tile.x, tile.y, "NW");
	      const n = getNeighborCoords(tile.x, tile.y, "N");
	      const ne = getNeighborCoords(tile.x, tile.y, "NE");
	      attrs.neighborsA[i * 3 + 0] = this.cellIndexFor(se.x, se.y);
	      attrs.neighborsA[i * 3 + 1] = this.cellIndexFor(s.x, s.y);
	      attrs.neighborsA[i * 3 + 2] = this.cellIndexFor(sw.x, sw.y);
	      attrs.neighborsB[i * 3 + 0] = this.cellIndexFor(nw.x, nw.y);
	      attrs.neighborsB[i * 3 + 1] = this.cellIndexFor(n.x, n.y);
	      attrs.neighborsB[i * 3 + 2] = this.cellIndexFor(ne.x, ne.y);
	      attrs.neighborsPriorityA[i * 3 + 0] = this.priorityFor(se.x, se.y);
	      attrs.neighborsPriorityA[i * 3 + 1] = this.priorityFor(s.x, s.y);
	      attrs.neighborsPriorityA[i * 3 + 2] = this.priorityFor(sw.x, sw.y);
	      attrs.neighborsPriorityB[i * 3 + 0] = this.priorityFor(nw.x, nw.y);
	      attrs.neighborsPriorityB[i * 3 + 1] = this.priorityFor(n.x, n.y);
	      attrs.neighborsPriorityB[i * 3 + 2] = this.priorityFor(ne.x, ne.y);
	      attrs.neighborsKindA[i * 3 + 0] = this.kindFor(se.x, se.y);
	      attrs.neighborsKindA[i * 3 + 1] = this.kindFor(s.x, s.y);
	      attrs.neighborsKindA[i * 3 + 2] = this.kindFor(sw.x, sw.y);
	      attrs.neighborsKindB[i * 3 + 0] = this.kindFor(nw.x, nw.y);
	      attrs.neighborsKindB[i * 3 + 1] = this.kindFor(n.x, n.y);
	      attrs.neighborsKindB[i * 3 + 2] = this.kindFor(ne.x, ne.y);
	    });
	    return attrs;
	  }
	  buildInstancedGeometry(tiles, numSubdivisions) {
	    const hexagon = createHexagonGeometry(this.options.size, numSubdivisions);
	    const geometry = new three.InstancedBufferGeometry();
	    geometry.setAttribute("position", hexagon.getAttribute("position"));
	    geometry.setAttribute("uv", hexagon.getAttribute("uv"));
	    geometry.setIndex(hexagon.getIndex());
	    geometry.instanceCount = tiles.length;
	    const attrs = this.buildInstanceAttributes(tiles);
	    geometry.setAttribute("offset", new three.InstancedBufferAttribute(attrs.offset, 2));
	    geometry.setAttribute("style", new three.InstancedBufferAttribute(attrs.style, 3));
	    geometry.setAttribute("neighborsA", new three.InstancedBufferAttribute(attrs.neighborsA, 3));
	    geometry.setAttribute("neighborsB", new three.InstancedBufferAttribute(attrs.neighborsB, 3));
	    geometry.setAttribute("neighborsPriorityA", new three.InstancedBufferAttribute(attrs.neighborsPriorityA, 3));
	    geometry.setAttribute("neighborsPriorityB", new three.InstancedBufferAttribute(attrs.neighborsPriorityB, 3));
	    geometry.setAttribute("neighborsKindA", new three.InstancedBufferAttribute(attrs.neighborsKindA, 3));
	    geometry.setAttribute("neighborsKindB", new three.InstancedBufferAttribute(attrs.neighborsKindB, 3));
	    geometry.setAttribute("fogState", new three.InstancedBufferAttribute(attrs.fogState, 1));
	    return geometry;
	  }
	  commonUniforms() {
	    const atlas = this.options.atlas;
	    const size = this.options.size;
	    return {
	      textureAtlasMeta: { value: new three.Vector4(atlas.width, atlas.height, atlas.cellSize, atlas.cellSpacing) },
	      hexSize: { value: size },
	      sandAtlasIndex: { value: this.atlasCellIndex["sand" /* sand */] ?? 0 },
	      waterLevel: { value: -(this.options.waterDepth ?? size * 0.25) },
	      beachWidth: { value: this.options.beachWidth ?? 0.35 },
	      fogMap: { value: this.fogTexture },
	      fogDarkenFactor: { value: this.options.fogDarkenFactor ?? 0.45 },
	      fogTextureSize: { value: this.options.fogTextureSize ?? size * 8 },
	      lightDir: { value: { x: 0.4, y: 1, z: 0.3 } },
	      showGrid: { value: this.options.gridVisible === false ? 0 : 1 },
	      gridColor: { value: new three.Color(this.options.gridColor ?? 0) },
	      gridWidth: { value: this.options.gridWidth ?? 0.04 },
	      gridOpacity: { value: this.options.gridOpacity ?? 0.35 }
	    };
	  }
	  //Mipmapping a multi-cell texture atlas bleeds neighboring cells into each
	  //other at lower mip levels (each mip texel then averages pixels that span
	  //a cell boundary) - visible as dark blotches on distant/oblique tiles,
	  //worst on the water layer's sand-cell blend since it's sampled from many
	  //different tiles' local UVs at once. Disabling mipmaps (plain bilinear
	  //filtering) avoids it; some distant-terrain shimmer is an acceptable
	  //trade-off for a tile-based map that's mostly viewed from a fixed range of
	  //distances anyway.
	  loadAtlasTexture() {
	    const loader = new three.TextureLoader().setPath(this.options.texturesBaseUrl);
	    const atlasTexture = loader.load(this.options.atlas.image);
	    atlasTexture.wrapS = atlasTexture.wrapT = three.RepeatWrapping;
	    atlasTexture.generateMipmaps = false;
	    atlasTexture.minFilter = three.LinearFilter;
	    return atlasTexture;
	  }
	  //war-fog.jpg (see FogOfWar.ts) - a single, non-atlased image sampled with
	  //world-space UVs (see terrain/water vertex shaders' vFogUV), so one repeat
	  //spans several tiles. RepeatWrapping is required for that (world UVs run
	  //far past 0..1); mipmaps are fine here, unlike the atlas (a standalone
	  //image has no neighboring cells to bleed into).
	  loadFogTexture() {
	    const loader = new three.TextureLoader().setPath(this.options.texturesBaseUrl);
	    const texture = loader.load(this.options.fogTexture ?? "war-fog.jpg");
	    texture.wrapS = texture.wrapT = three.RepeatWrapping;
	    return texture;
	  }
	  //Subdivided (not a single flat triangle per wedge) so the beach slope and
	  //landBlendWidth/beachWidth's smoothstep-based falloffs actually have interior
	  //vertices to sample - with only the 2 outer corners + center (0 subdivisions),
	  //the corners always saturate to fully-blended (edge factor is exactly 1 at
	  //any hex corner) and the center is always 0, so the GPU only ever linearly
	  //interpolates between those 2 fixed extremes no matter the configured width.
	  buildLandLayer(tiles) {
	    if (tiles.length === 0) return;
	    const geometry = this.buildInstancedGeometry(tiles, 2);
	    tiles.forEach((tile, i) => this.tileIndex.set(`${tile.x},${tile.y}`, i));
	    this.landMaterial = new three.RawShaderMaterial({
	      uniforms: {
	        map: { value: this.loadAtlasTexture() },
	        landBlendWidth: { value: this.options.landBlendWidth ?? 0.5 },
	        ...this.commonUniforms()
	      },
	      vertexShader: TERRAIN_VERTEX_SHADER,
	      fragmentShader: TERRAIN_FRAGMENT_SHADER
	    });
	    this.landMesh = new three.Mesh(geometry, this.landMaterial);
	    this.landMesh.frustumCulled = false;
	    this.add(this.landMesh);
	  }
	  //Water tiles get a subdivided geometry (more vertices than the flat land
	  //hex) so the sum-of-sines wave displacement in water.vertex.ts has enough
	  //resolution to look like a smooth, rounded surface instead of a faceted tent.
	  buildWaterLayer(tiles) {
	    if (tiles.length === 0) return;
	    const geometry = this.buildInstancedGeometry(tiles, 2);
	    tiles.forEach((tile, i) => this.waterTileIndex.set(`${tile.x},${tile.y}`, i));
	    this.waterMaterial = new three.RawShaderMaterial({
	      uniforms: {
	        uTime: { value: 0 },
	        waveAmplitude: { value: this.options.waterWaveAmplitude ?? 1.6 },
	        waveFrequency: { value: 0.045 * (this.options.waterWaveFrequency ?? 1) },
	        waveSpeed: { value: this.options.waterWaveSpeed ?? 1 },
	        sparkleIntensity: { value: this.options.waterSparkleIntensity ?? 1 },
	        fresnelIntensity: { value: this.options.waterFresnelIntensity ?? 1 },
	        foamEnabled: { value: this.options.coastalWavesEnabled ?? true ? 1 : 0 },
	        foamColor: { value: new three.Color(this.options.coastalWaveColor ?? 16777215) },
	        foamCount: { value: this.options.coastalWaveCount ?? 3 },
	        foamSpeed: { value: this.options.coastalWaveSpeed ?? 0.6 },
	        foamWidth: { value: this.options.coastalWaveWidth ?? 0.3 },
	        foamRange: { value: this.options.coastalWaveRange ?? 0.8 },
	        foamDistortion: { value: this.options.coastalWaveDistortion ?? 0.5 },
	        foamOpacity: { value: this.options.coastalWaveOpacity ?? 0.85 },
	        waterCornerRounding: { value: this.options.waterCornerRounding ?? 0.4 },
	        waterColorDeep: { value: new three.Color(this.options.waterColorDeep ?? LandColor["sea" /* sea */]) },
	        waterColorShallow: { value: new three.Color(this.options.waterColorShallow ?? LandColor["coastal" /* coastal */]) },
	        ...this.commonUniforms()
	      },
	      vertexShader: WATER_VERTEX_SHADER,
	      fragmentShader: WATER_FRAGMENT_SHADER
	    });
	    this.waterMesh = new three.Mesh(geometry, this.waterMaterial);
	    this.waterMesh.frustumCulled = false;
	    this.add(this.waterMesh);
	  }
	  //Places a 3D model + text label on every tile.city (TileInfo.city, see
	  //interfaces.ts) - independent of terrain type, so a city can sit on any
	  //land tile instead of being tied to a specific Land value. The model
	  //comes from the tile's own data if present (city.model), falling back to
	  //the map-wide cityModel option - a map can mix different models (e.g. a
	  //capital vs. a village) purely through its own JSON, no code changes
	  //required. Each model's own offset/rotation/scale fine-tuning lives in its
	  //folder's info.json (see helpers/models.ts's fixup matrix), not here -
	  //cityScale only applies an *additional* map-wide multiplier on top of that.
	  //
	  //Async because loading a glTF model is async (see helpers/models.ts) -
	  //called by HexMap.load() after construction, not from the constructor,
	  //so callers can await it if they need cities present before proceeding.
	  async loadCities() {
	    const { size } = this.options;
	    const defaultModel = this.options.cityModel ?? "Assets/models/monument";
	    const cityScale = this.options.cityScale ?? 1;
	    for (let x = 0; x < this.map.w; x++) {
	      for (let y = 0; y < this.map.h; y++) {
	        const tile = this.map.data[x]?.[y];
	        if (!tile?.city) continue;
	        const center = getHexCenter(x, y, size);
	        const modelPath = tile.city.model ?? defaultModel;
	        const { scene, fixup } = await loadModel(modelPath);
	        const model = scene.clone(true);
	        model.applyMatrix4(fixup);
	        model.updateMatrixWorld(true);
	        const cityMeshes = [];
	        model.traverse((o) => {
	          const mesh = o;
	          if (!mesh.isMesh) return;
	          mesh.material = mesh.material.clone();
	          const color = mesh.material.color;
	          if (color) cityMeshes.push({ mesh, baseColor: color.clone() });
	        });
	        const box = new three.Box3().setFromObject(model);
	        const modelHeight = box.getSize(new three.Vector3()).y;
	        const wrapper = new three.Group();
	        wrapper.add(model);
	        wrapper.scale.setScalar(cityScale);
	        wrapper.position.set(center.x, 0, center.y);
	        this.add(wrapper);
	        const sprite = makeTextSprite(` ${tile.city.name ?? "City"} `, {
	          fontsize: 32,
	          fontface: "Georgia",
	          borderColor: { r: 0, g: 0, b: 255, a: 0.8 }
	        });
	        sprite.position.set(center.x, modelHeight * cityScale + Math.round(size / 5), center.y);
	        this.add(sprite);
	        this.cityFog.set(`${x},${y}`, { wrapper, sprite, meshes: cityMeshes });
	      }
	    }
	  }
	  //Advances the water animation. `dtS` is the elapsed time in seconds since
	  //the previous frame - call this once per frame (see HexMap's render loop).
	  update(dtS) {
	    if (!this.waterMaterial) return;
	    this.clock += dtS;
	    this.waterMaterial.uniforms.uTime.value = this.clock;
	  }
	  get gridVisible() {
	    return (this.landMaterial ?? this.waterMaterial)?.uniforms.showGrid.value > 0;
	  }
	  set gridVisible(value) {
	    const v = value ? 1 : 0;
	    if (this.landMaterial) this.landMaterial.uniforms.showGrid.value = v;
	    if (this.waterMaterial) this.waterMaterial.uniforms.showGrid.value = v;
	  }
	  //-------------------------------------------------------------------------
	  //Live shader-uniform tuning knobs, for a GUI to adjust without rebuilding
	  //the map (unlike waterAnimation itself, which changes tile layer grouping
	  //and so needs a full TerrainMesh rebuild - see HexMap.rebuildTerrain()).
	  //beachWidth/waterDepth exist as separate uniform objects on landMaterial
	  //and waterMaterial each (commonUniforms() is called once per material, not
	  //shared), so both setters below write to both.
	  //-------------------------------------------------------------------------
	  get landBlendWidth() {
	    return this.landMaterial?.uniforms.landBlendWidth.value ?? 0.5;
	  }
	  set landBlendWidth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.landBlendWidth.value = value;
	  }
	  get waterCornerRounding() {
	    return this.waterMaterial?.uniforms.waterCornerRounding.value ?? 0.4;
	  }
	  set waterCornerRounding(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.waterCornerRounding.value = value;
	  }
	  get beachWidth() {
	    return this.landMaterial?.uniforms.beachWidth.value ?? this.waterMaterial?.uniforms.beachWidth.value ?? 0.35;
	  }
	  set beachWidth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.beachWidth.value = value;
	    if (this.waterMaterial) this.waterMaterial.uniforms.beachWidth.value = value;
	  }
	  //waterLevel uniform is negative (rest height below land); exposed here as
	  //a positive "depth" to match the waterDepth constructor option's sign.
	  get waterDepth() {
	    const level = this.landMaterial?.uniforms.waterLevel.value ?? this.waterMaterial?.uniforms.waterLevel.value;
	    return level === void 0 ? this.options.size * 0.25 : -level;
	  }
	  set waterDepth(value) {
	    const level = -value;
	    if (this.landMaterial) this.landMaterial.uniforms.waterLevel.value = level;
	    if (this.waterMaterial) this.waterMaterial.uniforms.waterLevel.value = level;
	  }
	  get waterWaveAmplitude() {
	    return this.waterMaterial?.uniforms.waveAmplitude.value ?? 1.6;
	  }
	  set waterWaveAmplitude(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.waveAmplitude.value = value;
	  }
	  //The stored uniform is pre-scaled by 0.045 (see buildWaterLayer) so the
	  //raw shader frequency stays in a sane range - getter/setter work in the
	  //same "multiplier" units as the constructor option so callers don't need
	  //to know about that factor.
	  get waterWaveFrequency() {
	    return (this.waterMaterial?.uniforms.waveFrequency.value ?? 0.045) / 0.045;
	  }
	  set waterWaveFrequency(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.waveFrequency.value = 0.045 * value;
	  }
	  get waterWaveSpeed() {
	    return this.waterMaterial?.uniforms.waveSpeed.value ?? 1;
	  }
	  set waterWaveSpeed(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.waveSpeed.value = value;
	  }
	  get waterSparkleIntensity() {
	    return this.waterMaterial?.uniforms.sparkleIntensity.value ?? 1;
	  }
	  set waterSparkleIntensity(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.sparkleIntensity.value = value;
	  }
	  get waterFresnelIntensity() {
	    return this.waterMaterial?.uniforms.fresnelIntensity.value ?? 1;
	  }
	  set waterFresnelIntensity(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.fresnelIntensity.value = value;
	  }
	  get waterColorShallow() {
	    return this.waterMaterial?.uniforms.waterColorShallow.value?.getHex() ?? 0;
	  }
	  set waterColorShallow(value) {
	    this.waterMaterial?.uniforms.waterColorShallow.value?.set(value);
	  }
	  get waterColorDeep() {
	    return this.waterMaterial?.uniforms.waterColorDeep.value?.getHex() ?? 0;
	  }
	  set waterColorDeep(value) {
	    this.waterMaterial?.uniforms.waterColorDeep.value?.set(value);
	  }
	  //Coastal foam waves - all plain uniforms on the water material, so
	  //toggling/tuning is live (unlike waterAnimation itself, which is
	  //structural - see HexMap.rebuildTerrain()).
	  get coastalWavesEnabled() {
	    return (this.waterMaterial?.uniforms.foamEnabled.value ?? 1) > 0.5;
	  }
	  set coastalWavesEnabled(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamEnabled.value = value ? 1 : 0;
	  }
	  get coastalWaveColor() {
	    return this.waterMaterial?.uniforms.foamColor.value?.getHex() ?? 16777215;
	  }
	  set coastalWaveColor(value) {
	    this.waterMaterial?.uniforms.foamColor.value?.set(value);
	  }
	  get coastalWaveCount() {
	    return this.waterMaterial?.uniforms.foamCount.value ?? 3;
	  }
	  set coastalWaveCount(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamCount.value = value;
	  }
	  get coastalWaveSpeed() {
	    return this.waterMaterial?.uniforms.foamSpeed.value ?? 0.6;
	  }
	  set coastalWaveSpeed(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamSpeed.value = value;
	  }
	  get coastalWaveWidth() {
	    return this.waterMaterial?.uniforms.foamWidth.value ?? 0.3;
	  }
	  set coastalWaveWidth(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamWidth.value = value;
	  }
	  get coastalWaveRange() {
	    return this.waterMaterial?.uniforms.foamRange.value ?? 0.8;
	  }
	  set coastalWaveRange(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamRange.value = value;
	  }
	  get coastalWaveDistortion() {
	    return this.waterMaterial?.uniforms.foamDistortion.value ?? 0.5;
	  }
	  set coastalWaveDistortion(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamDistortion.value = value;
	  }
	  get coastalWaveOpacity() {
	    return this.waterMaterial?.uniforms.foamOpacity.value ?? 0.85;
	  }
	  set coastalWaveOpacity(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamOpacity.value = value;
	  }
	  //Index of a tile within the land layer's instanced attributes, for future
	  //point updates (e.g. HexMap.setTile) without rebuilding the whole geometry.
	  getInstanceIndex(x, y) {
	    return this.tileIndex.get(`${x},${y}`);
	  }
	  //-------------------------------------------------------------------------
	  //Fog of war (see FogOfWar.ts) - updates one tile's terrain (land or water,
	  //whichever layer it's actually on) and its city model/label (if any) to
	  //the given state. Plain per-instance attribute writes, no rebuild.
	  //-------------------------------------------------------------------------
	  setFogState(x, y, state) {
	    const key = `${x},${y}`;
	    const landIdx = this.tileIndex.get(key);
	    if (landIdx !== void 0 && this.landMesh) {
	      const attribute = this.landMesh.geometry.getAttribute("fogState");
	      attribute.setX(landIdx, state);
	      attribute.needsUpdate = true;
	    }
	    const waterIdx = this.waterTileIndex.get(key);
	    if (waterIdx !== void 0 && this.waterMesh) {
	      const attribute = this.waterMesh.geometry.getAttribute("fogState");
	      attribute.setX(waterIdx, state);
	      attribute.needsUpdate = true;
	    }
	    this.setCityFog(key, state);
	  }
	  setCityFog(key, state) {
	    const entry = this.cityFog.get(key);
	    if (!entry) return;
	    const hidden = state < 0.5;
	    entry.wrapper.visible = !hidden;
	    entry.sprite.visible = !hidden;
	    if (hidden) return;
	    const shade = state < 1.5 ? this.options.fogDarkenFactor ?? 0.45 : 1;
	    for (const { mesh, baseColor } of entry.meshes) {
	      mesh.material.color.copy(baseColor).multiplyScalar(shade);
	    }
	  }
	  get mesh() {
	    return this.landMesh;
	  }
	  //Releases the land/water geometries, materials and atlas texture. City
	  //models/labels (also children of this Group) are *not* disposed - their
	  //geometry/materials are shared references into loadModel()'s cache (see
	  //helpers/models.ts), reused by future loads, not owned by this instance.
	  dispose() {
	    this.landMesh?.geometry.dispose();
	    this.landMaterial?.uniforms.map?.value?.dispose();
	    this.landMaterial?.dispose();
	    this.waterMesh?.geometry.dispose();
	    this.waterMaterial?.dispose();
	    this.fogTexture.dispose();
	  }
	};
	var ForestField = class extends three.Group {
	  constructor(tileRanges, fogDarkenFactor) {
	    super();
	    this.tileRanges = tileRanges;
	    this.fogDarkenFactor = fogDarkenFactor;
	    this.hiddenMatrix = new three.Matrix4().makeScale(0, 0, 0);
	  }
	  setFogState(x, y, state) {
	    const range = this.tileRanges.get(`${x},${y}`);
	    if (!range) return;
	    const hidden = state < 0.5;
	    const shade = state < 1.5 ? this.fogDarkenFactor : 1;
	    for (const instancedMesh of range.instancedMeshes) {
	      for (let i = 0; i < range.count; i++) {
	        const idx = range.start + i;
	        instancedMesh.setMatrixAt(idx, hidden ? this.hiddenMatrix : range.originalMatrices[i]);
	        instancedMesh.instanceColor?.setXYZ(idx, shade, shade, shade);
	      }
	      instancedMesh.instanceMatrix.needsUpdate = true;
	      if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
	    }
	  }
	};
	async function createForest(map, options) {
	  const { size } = options;
	  const treesPerTile = options.treesPerTile ?? 20;
	  const defaultModel = options.treeModel ?? "Assets/models/pinia";
	  const treeScale = options.treeScale ?? 1;
	  const fogDarkenFactor = options.fogDarkenFactor ?? 0.45;
	  const tilesByModel = /* @__PURE__ */ new Map();
	  for (let x = 0; x < map.w; x++) {
	    for (let y = 0; y < map.h; y++) {
	      const tile = map.data[x]?.[y];
	      if (!tile?.wood) continue;
	      const modelPath = tile.treeModel ?? defaultModel;
	      const tiles = tilesByModel.get(modelPath) ?? [];
	      tiles.push({ x, y });
	      tilesByModel.set(modelPath, tiles);
	    }
	  }
	  if (tilesByModel.size === 0) return null;
	  const treeFootprint = Math.max(1, Math.round(size / 10));
	  const polygon = HEXPolygon({ x: 0, y: 0 }, size - treeFootprint).map((p) => [p.x, p.y]);
	  const tileRanges = /* @__PURE__ */ new Map();
	  const group = new ForestField(tileRanges, fogDarkenFactor);
	  for (const [modelPath, tiles] of tilesByModel) {
	    const { scene, fixup } = await loadModel(modelPath);
	    const meshes = [];
	    scene.traverse((o) => {
	      if (o.isMesh) meshes.push(o);
	    });
	    if (meshes.length === 0) continue;
	    const totalInstances = tiles.length * treesPerTile;
	    const instancedMeshes = meshes.map((mesh) => {
	      const geometry = mesh.geometry.clone();
	      geometry.applyMatrix4(mesh.matrixWorld);
	      geometry.applyMatrix4(fixup);
	      const instancedMesh = new three.InstancedMesh(geometry, mesh.material, totalInstances);
	      instancedMesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
	      instancedMesh.instanceColor = new three.InstancedBufferAttribute(new Float32Array(totalInstances * 3).fill(1), 3);
	      instancedMesh.frustumCulled = false;
	      group.add(instancedMesh);
	      return instancedMesh;
	    });
	    const matrix = new three.Matrix4();
	    const scaleVector = new three.Vector3();
	    let instance = 0;
	    for (const tile of tiles) {
	      const center = getHexCenter(tile.x, tile.y, size);
	      const placed = [];
	      const tileStart = instance;
	      const originalMatrices = [];
	      let attempts = 0;
	      while (placed.length < treesPerTile && attempts < treesPerTile * 20) {
	        attempts++;
	        const lx = getRandomInt(-size, size);
	        const ly = getRandomInt(-size, size);
	        if (pointInPolygon2(polygon, [lx, ly]) !== -1) continue;
	        const overlaps = placed.some((p) => Math.abs(p.x - lx) < treeFootprint && Math.abs(p.y - ly) < treeFootprint);
	        if (overlaps) continue;
	        placed.push({ x: lx, y: ly });
	        const scale = treeScale * (0.8 + Math.random() * 0.4);
	        matrix.makeRotationY(Math.random() * Math.PI * 2);
	        matrix.scale(scaleVector.set(scale, scale, scale));
	        matrix.setPosition(center.x + lx, 0, center.y + ly);
	        for (const instancedMesh of instancedMeshes) instancedMesh.setMatrixAt(instance, matrix);
	        originalMatrices.push(matrix.clone());
	        instance++;
	      }
	      tileRanges.set(`${tile.x},${tile.y}`, { instancedMeshes, start: tileStart, count: instance - tileStart, originalMatrices });
	    }
	    for (const instancedMesh of instancedMeshes) {
	      instancedMesh.count = instance;
	      instancedMesh.instanceMatrix.needsUpdate = true;
	    }
	  }
	  return group;
	}

	// src/shaders/grass.vertex.ts
	var GRASS_VERTEX_SHADER = `
precision mediump float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform float uTime;
uniform float windStrength;
uniform float windSpeed;

// Blade shape authored once in local space (see Grass.ts buildBladeGeometry):
// x spans [-0.5, 0.5] at the root and tapers to 0 at the tip, y is a plain
// [0, 1] height factor (0 = root, 1 = tip) - not a world-unit height, that's
// what the per-instance "scale" attribute is for.
attribute vec3 position;

attribute vec2 offset;  // world XZ position of this blade's root
attribute float angle;  // random Y rotation, radians - so blades don't all face the same way
attribute vec2 scale;   // x = width multiplier, y = height multiplier (world units)
attribute float phase;  // random wind phase offset, see wave below
attribute float shade;  // random per-blade brightness multiplier (clump variation)
attribute float fogState; // 0 = unseen (blade hidden), 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying float vHeightFactor;
varying float vShade;
varying float vFogState;

void main() {
    float heightFactor = position.y;
    vec3 p = vec3(position.x * scale.x, position.y * scale.y, position.z * scale.x);

    float s = sin(angle);
    float c = cos(angle);
    vec3 rotated = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);

    // Wind bends the blade towards its tip only (heightFactor^2 keeps the root
    // planted) - phase is offset by world position so a gust visibly travels
    // across the field instead of every blade swaying in lockstep.
    float wave = sin(uTime * windSpeed + phase + (offset.x + offset.y) * 0.015);
    float bend = wave * windStrength * heightFactor * heightFactor;
    rotated.x += bend;
    rotated.z += bend * 0.4;

    vec3 worldPos = vec3(offset.x + rotated.x, rotated.y, offset.y + rotated.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);

    vHeightFactor = heightFactor;
    vShade = shade;
    vFogState = fogState;
}
`;

	// src/shaders/grass.fragment.ts
	var GRASS_FRAGMENT_SHADER = `
precision mediump float;

uniform vec3 colorBase;
uniform vec3 colorTip;
uniform float fogDarkenFactor;

varying float vHeightFactor;
varying float vShade;
varying float vFogState;

void main() {
    // Unseen: no feature should show at all under the war-fog tile.
    if (vFogState < 0.5) discard;

    vec3 color = mix(colorBase, colorTip, vHeightFactor) * vShade;

    // Explored: keep the blade visible, just darker (mirrors terrain.fragment.ts).
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);
}
`;

	// src/objects/Grass.ts
	var GrassField = class extends three.Mesh {
	  constructor(geometry, material, tileRanges) {
	    super(geometry, material);
	    this.tileRanges = tileRanges;
	    this.clock = 0;
	    this.grassMaterial = material;
	    this.frustumCulled = false;
	  }
	  //Updates every blade belonging to (x, y) to the given fog state (see
	  //FogOfWar.ts) - a plain attribute-slice fill + needsUpdate, no rebuild.
	  //No-op for tiles with no grass (city tiles, non-"land" terrain).
	  setFogState(x, y, state) {
	    const range = this.tileRanges.get(`${x},${y}`);
	    if (!range) return;
	    const attribute = this.geometry.getAttribute("fogState");
	    for (let i = 0; i < range.count; i++) attribute.setX(range.start + i, state);
	    attribute.needsUpdate = true;
	  }
	  //Advances the wind animation. `dtS` is the elapsed time in seconds since
	  //the previous frame - call this once per frame (see HexMap's render loop).
	  update(dtS) {
	    this.clock += dtS;
	    this.grassMaterial.uniforms.uTime.value = this.clock;
	  }
	  get windStrength() {
	    return this.grassMaterial.uniforms.windStrength.value;
	  }
	  set windStrength(value) {
	    this.grassMaterial.uniforms.windStrength.value = value;
	  }
	  get windSpeed() {
	    return this.grassMaterial.uniforms.windSpeed.value;
	  }
	  set windSpeed(value) {
	    this.grassMaterial.uniforms.windSpeed.value = value;
	  }
	  dispose() {
	    this.geometry.dispose();
	    this.grassMaterial.dispose();
	  }
	};
	function buildBladeGeometry() {
	  const positions = new Float32Array([
	    -0.5,
	    0,
	    0,
	    0.5,
	    0,
	    0,
	    -0.25,
	    0.5,
	    0,
	    0.25,
	    0.5,
	    0,
	    0,
	    1,
	    0
	  ]);
	  const index = [0, 1, 2, 1, 3, 2, 2, 3, 4];
	  const geometry = new three.BufferGeometry();
	  geometry.setAttribute("position", new three.Float32BufferAttribute(positions, 3));
	  geometry.setIndex(index);
	  return geometry;
	}
	function createGrassField(map, options) {
	  const { size } = options;
	  const density = options.density ?? 60;
	  if (density <= 0) return null;
	  const bladeWidth = options.bladeWidth ?? size * 0.03;
	  const bladeHeight = options.bladeHeight ?? size * 0.18;
	  const heightVariation = options.heightVariation ?? 0.4;
	  const windStrength = options.windStrength ?? bladeHeight * 0.35;
	  const windSpeed = options.windSpeed ?? 1.2;
	  const tiles = [];
	  for (let x = 0; x < map.w; x++) {
	    for (let y = 0; y < map.h; y++) {
	      const tile = map.data[x]?.[y];
	      if (tile?.type === "land" /* land */ && !tile.city) tiles.push({ x, y });
	    }
	  }
	  if (tiles.length === 0) return null;
	  const polygon = HEXPolygon({ x: 0, y: 0 }, size * 0.8).map((p) => [p.x, p.y]);
	  const totalBlades = tiles.length * density;
	  const offsets = new Float32Array(totalBlades * 2);
	  const angles = new Float32Array(totalBlades);
	  const scales = new Float32Array(totalBlades * 2);
	  const phases = new Float32Array(totalBlades);
	  const shades = new Float32Array(totalBlades);
	  const fogStates = new Float32Array(totalBlades).fill(2);
	  const tileRanges = /* @__PURE__ */ new Map();
	  let instance = 0;
	  for (const tile of tiles) {
	    const center = getHexCenter(tile.x, tile.y, size);
	    const tileStart = instance;
	    for (let i = 0; i < density; i++) {
	      let lx = 0, ly = 0, attempts = 0;
	      do {
	        lx = getRandomInt(-size, size);
	        ly = getRandomInt(-size, size);
	        attempts++;
	      } while (pointInPolygon2(polygon, [lx, ly]) !== -1 && attempts < 10);
	      offsets[instance * 2 + 0] = center.x + lx;
	      offsets[instance * 2 + 1] = center.y + ly;
	      angles[instance] = Math.random() * Math.PI * 2;
	      const heightJitter = 1 - heightVariation * 0.5 + Math.random() * heightVariation;
	      scales[instance * 2 + 0] = bladeWidth * (0.8 + Math.random() * 0.4);
	      scales[instance * 2 + 1] = bladeHeight * heightJitter;
	      phases[instance] = Math.random() * Math.PI * 2;
	      shades[instance] = 0.75 + Math.random() * 0.35;
	      instance++;
	    }
	    tileRanges.set(`${tile.x},${tile.y}`, { start: tileStart, count: instance - tileStart });
	  }
	  const blade = buildBladeGeometry();
	  const geometry = new three.InstancedBufferGeometry();
	  geometry.setAttribute("position", blade.getAttribute("position"));
	  geometry.setIndex(blade.getIndex());
	  geometry.instanceCount = instance;
	  geometry.setAttribute("offset", new three.InstancedBufferAttribute(offsets, 2));
	  geometry.setAttribute("angle", new three.InstancedBufferAttribute(angles, 1));
	  geometry.setAttribute("scale", new three.InstancedBufferAttribute(scales, 2));
	  geometry.setAttribute("phase", new three.InstancedBufferAttribute(phases, 1));
	  geometry.setAttribute("shade", new three.InstancedBufferAttribute(shades, 1));
	  geometry.setAttribute("fogState", new three.InstancedBufferAttribute(fogStates, 1));
	  const material = new three.RawShaderMaterial({
	    uniforms: {
	      uTime: { value: 0 },
	      windStrength: { value: windStrength },
	      windSpeed: { value: windSpeed },
	      colorBase: { value: new three.Color(options.colorBase ?? 3960366) },
	      colorTip: { value: new three.Color(options.colorTip ?? 9424474) },
	      fogDarkenFactor: { value: options.fogDarkenFactor ?? 0.45 }
	    },
	    vertexShader: GRASS_VERTEX_SHADER,
	    fragmentShader: GRASS_FRAGMENT_SHADER,
	    side: three.DoubleSide
	  });
	  return new GrassField(geometry, material, tileRanges);
	}

	// src/HexMap.ts
	var DEFAULT_OPTIONS = {
	  size: 40,
	  texturesBaseUrl: "textures/",
	  gridVisible: true,
	  gridColor: 4338219,
	  gridWidth: 0.04,
	  gridOpacity: 0.35,
	  selectorColor: 16776960,
	  pointerColor: 15658734,
	  treesPerTile: 20,
	  waterAnimation: true,
	  waterColorShallow: LandColor["coastal" /* coastal */],
	  waterColorDeep: LandColor["sea" /* sea */],
	  waterWaveAmplitude: 1.6,
	  waterWaveFrequency: 1,
	  waterWaveSpeed: 1,
	  waterSparkleIntensity: 1,
	  waterFresnelIntensity: 1,
	  coastalWavesEnabled: true,
	  coastalWaveColor: 16777215,
	  coastalWaveCount: 3,
	  coastalWaveSpeed: 0.6,
	  coastalWaveWidth: 0.3,
	  coastalWaveRange: 0.8,
	  coastalWaveDistortion: 0.5,
	  coastalWaveOpacity: 0.85,
	  beachWidth: 0.35,
	  landBlendWidth: 0.5,
	  waterCornerRounding: 0.4,
	  treeModel: "Assets/models/pinia",
	  treeScale: 1,
	  cityModel: "Assets/models/monument",
	  cityScale: 1,
	  grassEnabled: true,
	  grassDensity: 60,
	  grassBladeWidth: 1.2,
	  grassBladeHeight: 7.2,
	  grassWindStrength: 2.5,
	  grassWindSpeed: 1.2,
	  fogTexture: "war-fog.jpg",
	  fogDarkenFactor: 0.45
	};
	var HexMap = class extends EventEmitter {
	  constructor(options) {
	    super();
	    this.mouseDownAt = null;
	    // screen coords, used to distinguish click vs. drag
	    this.lastHover = null;
	    this.lastSelected = null;
	    this.handleResize = () => {
	      const width = window.innerWidth;
	      const height = window.innerHeight;
	      this.camera.aspect = width / height;
	      this.camera.updateProjectionMatrix();
	      this.renderer.setPixelRatio(window.devicePixelRatio);
	      this.renderer.setSize(width, height);
	    };
	    this.animate = (t) => {
	      const dtS = this.lastFrameTime === void 0 ? 0 : (t - this.lastFrameTime) / 1e3;
	      this.lastFrameTime = t;
	      this.terrain?.update(dtS);
	      this.grass?.update(dtS);
	      this.emit("frame", { t });
	      this.renderer.render(this.scene, this.camera);
	      window.requestAnimationFrame(this.animate);
	    };
	    //-------------------------------------------------------------------------
	    //Picking (analytic, ground-plane based - see helpers/picking.ts)
	    //-------------------------------------------------------------------------
	    this.onMouseDown = (event) => {
	      this.mouseDownAt = { x: event.clientX, y: event.clientY };
	    };
	    this.onPointerMove = (event) => {
	      const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
	      if (!ground) return;
	      const tileCoords = pickTile(ground, this.options.size, this.mapData?.w, this.mapData?.h);
	      if (!tileCoords) return;
	      if (this.lastHover && this.lastHover.x === tileCoords.x && this.lastHover.y === tileCoords.y) return;
	      this.lastHover = tileCoords;
	      const tile = this.getTile(tileCoords.x, tileCoords.y);
	      if (!tile) return;
	      const center = getHexCenter(tileCoords.x, tileCoords.y, this.options.size);
	      this.pointer.visible = true;
	      this.pointer.position.setX(center.x);
	      this.pointer.position.setZ(center.y);
	      this.emit("hover", { x: tileCoords.x, y: tileCoords.y, tile });
	    };
	    this.onMouseUp = (event) => {
	      const downAt = this.mouseDownAt;
	      this.mouseDownAt = null;
	      if (!downAt) return;
	      const dragDistance = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
	      if (dragDistance > 4) return;
	      const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
	      if (!ground) return;
	      const tileCoords = pickTile(ground, this.options.size, this.mapData?.w, this.mapData?.h);
	      if (!tileCoords) return;
	      const tile = this.getTile(tileCoords.x, tileCoords.y);
	      if (!tile) return;
	      this.selectTile(tileCoords.x, tileCoords.y);
	      this.emit("click", { x: tileCoords.x, y: tileCoords.y, tile });
	    };
	    this.options = {
	      ...DEFAULT_OPTIONS,
	      ...options,
	      waterDepth: options.waterDepth ?? (options.size ?? DEFAULT_OPTIONS.size) * 0.25,
	      fogTextureSize: options.fogTextureSize ?? (options.size ?? DEFAULT_OPTIONS.size) * 8
	    };
	    const el = document.querySelector(this.options.element);
	    if (!(el instanceof HTMLCanvasElement)) {
	      throw new Error(`HexMap: element "${this.options.element}" is not a <canvas>`);
	    }
	    this.canvas = el;
	    this.setupScene();
	    this.setupCamera();
	    this.setupLights();
	    this.setupControls();
	    this.setupMarkers();
	    this.setupEvents();
	    this.handleResize();
	    this.animate(0);
	  }
	  //-------------------------------------------------------------------------
	  //Scene / renderer / camera / controls
	  //-------------------------------------------------------------------------
	  setupScene() {
	    this.scene = new three.Scene();
	    this.scene.background = new three.Color(13421772);
	    this.renderer = new three.WebGLRenderer({ canvas: this.canvas, antialias: true });
	  }
	  setupCamera() {
	    this.camera = new three.PerspectiveCamera(60, 1, 10, 2e3);
	    this.camera.position.set(900, 500, 1e3);
	    this.scene.add(this.camera);
	  }
	  setupLights() {
	    const dirLight1 = new three.DirectionalLight(16777215);
	    dirLight1.position.set(1, 1, 1);
	    this.scene.add(dirLight1);
	    const dirLight2 = new three.DirectionalLight(8840);
	    dirLight2.position.set(-1, -1, -1);
	    this.scene.add(dirLight2);
	    this.scene.add(new three.AmbientLight(2236962));
	  }
	  setupControls() {
	    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
	    this.controls.mouseButtons = { LEFT: three.MOUSE.PAN, MIDDLE: three.MOUSE.DOLLY, RIGHT: three.MOUSE.ROTATE };
	    this.controls.touches = { ONE: three.TOUCH.PAN, TWO: three.TOUCH.DOLLY_ROTATE };
	    this.controls.dampingFactor = 0.05;
	    this.controls.screenSpacePanning = false;
	    this.controls.minDistance = 100;
	    this.controls.maxDistance = 800;
	    this.controls.minAzimuthAngle = 80 * (Math.PI / 180);
	    this.controls.maxAzimuthAngle = 100 * (Math.PI / 180);
	    this.controls.minPolarAngle = 10 * (Math.PI / 180);
	    this.controls.maxPolarAngle = 90 * (Math.PI / 180);
	  }
	  //The initial camera position/target (set in setupCamera(), before map data
	  //is known) looks at world origin, which is only the map's (0,0) corner, not
	  //its middle - most maps would load with the camera pointed off to one side
	  //of the actual content. Re-centers the existing look-at *angle* (the
	  //direction from target to camera, already tuned via min/maxAzimuth/PolarAngle)
	  //on the map's real center instead, at a fixed, in-range viewing distance.
	  frameMap(mapData) {
	    const size = this.options.size;
	    const corner00 = getHexCenter(0, 0, size);
	    const cornerWH = getHexCenter(mapData.w - 1, mapData.h - 1, size);
	    const centerX = (corner00.x + cornerWH.x) / 2;
	    const centerZ = (corner00.y + cornerWH.y) / 2;
	    const viewDistance = (this.controls.minDistance + this.controls.maxDistance) / 2;
	    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
	    this.controls.target.set(centerX, 0, centerZ);
	    this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
	    this.controls.update();
	  }
	  setupMarkers() {
	    const size = this.options.size;
	    const selectorGeom = new three.RingGeometry(0.97 * size, size, 6, 2);
	    this.selector = new three.Mesh(selectorGeom, new three.MeshBasicMaterial({ color: this.options.selectorColor }));
	    this.selector.rotateX(-Math.PI / 2);
	    this.selector.position.setY(size / 10 + 1.1);
	    this.selector.visible = false;
	    this.scene.add(this.selector);
	    const pointerGeom = new three.RingGeometry(0.97 * size, size, 6, 2);
	    this.pointer = new three.Mesh(pointerGeom, new three.MeshBasicMaterial({ color: this.options.pointerColor }));
	    this.pointer.rotateX(-Math.PI / 2);
	    this.pointer.position.setY(size / 10 + 1.1);
	    this.pointer.visible = false;
	    this.scene.add(this.pointer);
	  }
	  setupEvents() {
	    window.addEventListener("resize", this.handleResize, { passive: true });
	    this.canvas.addEventListener("mousedown", this.onMouseDown);
	    window.addEventListener("pointermove", this.onPointerMove);
	    window.addEventListener("mouseup", this.onMouseUp);
	  }
	  //-------------------------------------------------------------------------
	  //Public API
	  //-------------------------------------------------------------------------
	  //Builds the terrain/grid/trees for the given map data. Fetches the terrain
	  //atlas descriptor (land-atlas.json) from texturesBaseUrl; textures themselves
	  //load in the background as usual for three.js.
	  async load(mapData) {
	    this.mapData = mapData;
	    this.frameMap(mapData);
	    const atlasUrl = new URL("land-atlas.json", new URL(this.options.texturesBaseUrl, window.location.href)).href;
	    this.atlas = await fetch(atlasUrl).then((r) => r.json());
	    await this.rebuildTerrain();
	    await this.rebuildForest();
	    this.rebuildGrass();
	    this.emit("load", void 0);
	  }
	  //Tears down and recreates the terrain (land/water layers + city models) from
	  //the current options against the already-fetched atlas/map data. Needed for
	  //any option that changes tile layer *grouping* rather than a plain shader
	  //uniform - currently only waterAnimation (splitting sea/coastal onto their own
	  //animated layer vs. flattening them into the atlas-textured land layer is a
	  //different instance count/geometry, not something a uniform can express).
	  //Everything else water/blend-related is a live uniform - see TerrainMesh's
	  //own getters/setters, forwarded below (waterWaveAmplitude, beachWidth, etc.)
	  async rebuildTerrain() {
	    if (this.terrain) {
	      this.scene.remove(this.terrain);
	      this.terrain.dispose();
	    }
	    this.terrain = new TerrainMesh(this.mapData, {
	      size: this.options.size,
	      texturesBaseUrl: this.options.texturesBaseUrl,
	      atlas: this.atlas,
	      gridVisible: this.options.gridVisible,
	      gridColor: this.options.gridColor,
	      gridWidth: this.options.gridWidth,
	      gridOpacity: this.options.gridOpacity,
	      waterAnimation: this.options.waterAnimation,
	      waterColorShallow: this.options.waterColorShallow,
	      waterColorDeep: this.options.waterColorDeep,
	      waterWaveAmplitude: this.options.waterWaveAmplitude,
	      waterWaveFrequency: this.options.waterWaveFrequency,
	      waterWaveSpeed: this.options.waterWaveSpeed,
	      waterSparkleIntensity: this.options.waterSparkleIntensity,
	      waterFresnelIntensity: this.options.waterFresnelIntensity,
	      coastalWavesEnabled: this.options.coastalWavesEnabled,
	      coastalWaveColor: this.options.coastalWaveColor,
	      coastalWaveCount: this.options.coastalWaveCount,
	      coastalWaveSpeed: this.options.coastalWaveSpeed,
	      coastalWaveWidth: this.options.coastalWaveWidth,
	      coastalWaveRange: this.options.coastalWaveRange,
	      coastalWaveDistortion: this.options.coastalWaveDistortion,
	      coastalWaveOpacity: this.options.coastalWaveOpacity,
	      waterDepth: this.options.waterDepth,
	      beachWidth: this.options.beachWidth,
	      landBlendWidth: this.options.landBlendWidth,
	      waterCornerRounding: this.options.waterCornerRounding,
	      cityModel: this.options.cityModel,
	      cityScale: this.options.cityScale,
	      fogTexture: this.options.fogTexture,
	      fogDarkenFactor: this.options.fogDarkenFactor,
	      fogTextureSize: this.options.fogTextureSize
	    });
	    this.scene.add(this.terrain);
	    await this.terrain.loadCities();
	  }
	  //Tears down and recreates the tree instances from the current tree*
	  //options. treesPerTile/treeScale are baked into the instanced geometry's
	  //instance count/matrices at build time, so - like grass - there's no live
	  //uniform for them, only a rebuild. Model files are cached (see
	  //helpers/models.ts), so repeated rebuilds don't re-fetch the glTF.
	  async rebuildForest() {
	    if (this.forest) {
	      this.scene.remove(this.forest);
	      this.forest.traverse((o) => o.geometry?.dispose());
	      this.forest = void 0;
	    }
	    if (!this.mapData) return;
	    this.forest = await createForest(this.mapData, {
	      size: this.options.size,
	      treesPerTile: this.options.treesPerTile,
	      treeModel: this.options.treeModel,
	      treeScale: this.options.treeScale,
	      fogDarkenFactor: this.options.fogDarkenFactor
	    }) ?? void 0;
	    if (this.forest) this.scene.add(this.forest);
	  }
	  //Tears down and recreates the grass field from the current grass* options
	  //against the already-loaded map data. Grass is purely procedural (no
	  //textures/models to load), so this is synchronous and cheap enough to call
	  //directly from a live GUI slider (see grassDensity/grassBladeWidth/
	  //grassBladeHeight setters below) - a rebuild replaces the whole instanced
	  //geometry, there's no partial/incremental update.
	  rebuildGrass() {
	    if (this.grass) {
	      this.scene.remove(this.grass);
	      this.grass.dispose();
	      this.grass = void 0;
	    }
	    if (!this.mapData) return;
	    this.grass = createGrassField(this.mapData, {
	      size: this.options.size,
	      density: this.options.grassDensity,
	      bladeWidth: this.options.grassBladeWidth,
	      bladeHeight: this.options.grassBladeHeight,
	      windStrength: this.options.grassWindStrength,
	      windSpeed: this.options.grassWindSpeed,
	      fogDarkenFactor: this.options.fogDarkenFactor
	    }) ?? void 0;
	    if (this.grass) {
	      this.grass.visible = this.options.grassEnabled;
	      this.scene.add(this.grass);
	    }
	  }
	  getTile(x, y) {
	    return this.mapData?.data[x]?.[y];
	  }
	  //-------------------------------------------------------------------------
	  //Fog of war (see objects/FogOfWar.ts) - updates one tile's terrain, grass
	  //and trees/city to the given state (0 = Unseen, 1 = Explored, 2 = Visible).
	  //Every tile defaults to Visible, so calling this is entirely optional; a
	  //consumer that wants fog of war (e.g. GameEngine, when its own fogOfWar
	  //option is on) drives it from unit positions/view ranges.
	  //-------------------------------------------------------------------------
	  setTileFog(x, y, state) {
	    this.terrain?.setFogState(x, y, state);
	    this.grass?.setFogState(x, y, state);
	    this.forest?.setFogState(x, y, state);
	  }
	  get gridVisible() {
	    return this.terrain?.gridVisible ?? this.options.gridVisible;
	  }
	  set gridVisible(value) {
	    this.options.gridVisible = value;
	    if (this.terrain) this.terrain.gridVisible = value;
	  }
	  //-------------------------------------------------------------------------
	  //Water animation - enabling/disabling is structural (see rebuildTerrain()),
	  //everything else here is a live shader uniform forwarded straight through
	  //to TerrainMesh, no rebuild needed.
	  //-------------------------------------------------------------------------
	  get waterAnimation() {
	    return this.options.waterAnimation;
	  }
	  set waterAnimation(value) {
	    this.options.waterAnimation = value;
	    void this.rebuildTerrain();
	  }
	  get waterWaveAmplitude() {
	    return this.terrain?.waterWaveAmplitude ?? this.options.waterWaveAmplitude;
	  }
	  set waterWaveAmplitude(value) {
	    this.options.waterWaveAmplitude = value;
	    if (this.terrain) this.terrain.waterWaveAmplitude = value;
	  }
	  get waterWaveFrequency() {
	    return this.terrain?.waterWaveFrequency ?? this.options.waterWaveFrequency;
	  }
	  set waterWaveFrequency(value) {
	    this.options.waterWaveFrequency = value;
	    if (this.terrain) this.terrain.waterWaveFrequency = value;
	  }
	  get waterWaveSpeed() {
	    return this.terrain?.waterWaveSpeed ?? this.options.waterWaveSpeed;
	  }
	  set waterWaveSpeed(value) {
	    this.options.waterWaveSpeed = value;
	    if (this.terrain) this.terrain.waterWaveSpeed = value;
	  }
	  get waterSparkleIntensity() {
	    return this.terrain?.waterSparkleIntensity ?? this.options.waterSparkleIntensity;
	  }
	  set waterSparkleIntensity(value) {
	    this.options.waterSparkleIntensity = value;
	    if (this.terrain) this.terrain.waterSparkleIntensity = value;
	  }
	  get waterFresnelIntensity() {
	    return this.terrain?.waterFresnelIntensity ?? this.options.waterFresnelIntensity;
	  }
	  set waterFresnelIntensity(value) {
	    this.options.waterFresnelIntensity = value;
	    if (this.terrain) this.terrain.waterFresnelIntensity = value;
	  }
	  get waterColorShallow() {
	    return this.terrain?.waterColorShallow ?? this.options.waterColorShallow;
	  }
	  set waterColorShallow(value) {
	    this.options.waterColorShallow = value;
	    if (this.terrain) this.terrain.waterColorShallow = value;
	  }
	  get waterColorDeep() {
	    return this.terrain?.waterColorDeep ?? this.options.waterColorDeep;
	  }
	  set waterColorDeep(value) {
	    this.options.waterColorDeep = value;
	    if (this.terrain) this.terrain.waterColorDeep = value;
	  }
	  //-------------------------------------------------------------------------
	  //Coastal foam waves - all live shader uniforms forwarded to TerrainMesh,
	  //no rebuild (the enable flag included: it's a uniform gate in the water
	  //fragment shader, not a structural change like waterAnimation).
	  //-------------------------------------------------------------------------
	  get coastalWavesEnabled() {
	    return this.terrain?.coastalWavesEnabled ?? this.options.coastalWavesEnabled;
	  }
	  set coastalWavesEnabled(value) {
	    this.options.coastalWavesEnabled = value;
	    if (this.terrain) this.terrain.coastalWavesEnabled = value;
	  }
	  get coastalWaveColor() {
	    return this.terrain?.coastalWaveColor ?? this.options.coastalWaveColor;
	  }
	  set coastalWaveColor(value) {
	    this.options.coastalWaveColor = value;
	    if (this.terrain) this.terrain.coastalWaveColor = value;
	  }
	  get coastalWaveCount() {
	    return this.terrain?.coastalWaveCount ?? this.options.coastalWaveCount;
	  }
	  set coastalWaveCount(value) {
	    this.options.coastalWaveCount = value;
	    if (this.terrain) this.terrain.coastalWaveCount = value;
	  }
	  get coastalWaveSpeed() {
	    return this.terrain?.coastalWaveSpeed ?? this.options.coastalWaveSpeed;
	  }
	  set coastalWaveSpeed(value) {
	    this.options.coastalWaveSpeed = value;
	    if (this.terrain) this.terrain.coastalWaveSpeed = value;
	  }
	  get coastalWaveWidth() {
	    return this.terrain?.coastalWaveWidth ?? this.options.coastalWaveWidth;
	  }
	  set coastalWaveWidth(value) {
	    this.options.coastalWaveWidth = value;
	    if (this.terrain) this.terrain.coastalWaveWidth = value;
	  }
	  get coastalWaveRange() {
	    return this.terrain?.coastalWaveRange ?? this.options.coastalWaveRange;
	  }
	  set coastalWaveRange(value) {
	    this.options.coastalWaveRange = value;
	    if (this.terrain) this.terrain.coastalWaveRange = value;
	  }
	  get coastalWaveDistortion() {
	    return this.terrain?.coastalWaveDistortion ?? this.options.coastalWaveDistortion;
	  }
	  set coastalWaveDistortion(value) {
	    this.options.coastalWaveDistortion = value;
	    if (this.terrain) this.terrain.coastalWaveDistortion = value;
	  }
	  get coastalWaveOpacity() {
	    return this.terrain?.coastalWaveOpacity ?? this.options.coastalWaveOpacity;
	  }
	  set coastalWaveOpacity(value) {
	    this.options.coastalWaveOpacity = value;
	    if (this.terrain) this.terrain.coastalWaveOpacity = value;
	  }
	  //-------------------------------------------------------------------------
	  //Land/coastal blending + beach height - all live shader uniforms, no rebuild.
	  //-------------------------------------------------------------------------
	  get landBlendWidth() {
	    return this.terrain?.landBlendWidth ?? this.options.landBlendWidth;
	  }
	  set landBlendWidth(value) {
	    this.options.landBlendWidth = value;
	    if (this.terrain) this.terrain.landBlendWidth = value;
	  }
	  get waterCornerRounding() {
	    return this.terrain?.waterCornerRounding ?? this.options.waterCornerRounding;
	  }
	  set waterCornerRounding(value) {
	    this.options.waterCornerRounding = value;
	    if (this.terrain) this.terrain.waterCornerRounding = value;
	  }
	  get beachWidth() {
	    return this.terrain?.beachWidth ?? this.options.beachWidth;
	  }
	  set beachWidth(value) {
	    this.options.beachWidth = value;
	    if (this.terrain) this.terrain.beachWidth = value;
	  }
	  get waterDepth() {
	    return this.terrain?.waterDepth ?? this.options.waterDepth;
	  }
	  set waterDepth(value) {
	    this.options.waterDepth = value;
	    if (this.terrain) this.terrain.waterDepth = value;
	  }
	  //-------------------------------------------------------------------------
	  //Tree density/size - baked into the instanced geometry at build time (like
	  //grass), so both rebuild the forest rather than touching a uniform.
	  //-------------------------------------------------------------------------
	  get treesPerTile() {
	    return this.options.treesPerTile;
	  }
	  set treesPerTile(value) {
	    this.options.treesPerTile = value;
	    void this.rebuildForest();
	  }
	  get treeScale() {
	    return this.options.treeScale;
	  }
	  set treeScale(value) {
	    this.options.treeScale = value;
	    void this.rebuildForest();
	  }
	  //Toggling visibility just flips the mesh's own `visible` flag (grass is
	  //still generated even when disabled) - the terrain's own grass texture
	  //keeps rendering underneath either way, so disabling this is purely
	  //"remove the blade overlay", not "regenerate as flat grass".
	  get grassVisible() {
	    return this.grass?.visible ?? this.options.grassEnabled;
	  }
	  set grassVisible(value) {
	    this.options.grassEnabled = value;
	    if (this.grass) this.grass.visible = value;
	  }
	  //Wind uniforms are cheap to update live - no rebuild needed.
	  get grassWindStrength() {
	    return this.grass?.windStrength ?? this.options.grassWindStrength;
	  }
	  set grassWindStrength(value) {
	    this.options.grassWindStrength = value;
	    if (this.grass) this.grass.windStrength = value;
	  }
	  get grassWindSpeed() {
	    return this.grass?.windSpeed ?? this.options.grassWindSpeed;
	  }
	  set grassWindSpeed(value) {
	    this.options.grassWindSpeed = value;
	    if (this.grass) this.grass.windSpeed = value;
	  }
	  //Blade count/size is baked into the instanced geometry at build time, so
	  //changing any of these rebuilds the whole grass field (see rebuildGrass()).
	  get grassDensity() {
	    return this.options.grassDensity;
	  }
	  set grassDensity(value) {
	    this.options.grassDensity = value;
	    this.rebuildGrass();
	  }
	  get grassBladeWidth() {
	    return this.options.grassBladeWidth;
	  }
	  set grassBladeWidth(value) {
	    this.options.grassBladeWidth = value;
	    this.rebuildGrass();
	  }
	  get grassBladeHeight() {
	    return this.options.grassBladeHeight;
	  }
	  set grassBladeHeight(value) {
	    this.options.grassBladeHeight = value;
	    this.rebuildGrass();
	  }
	  selectTile(x, y) {
	    const center = getHexCenter(x, y, this.options.size);
	    this.selector.visible = true;
	    this.selector.position.setX(center.x);
	    this.selector.position.setZ(center.y);
	    this.lastSelected = { x, y };
	  }
	  get selectedTile() {
	    return this.lastSelected;
	  }
	  drawRoutePath(path) {
	    this.cleanRoutePath();
	    const points = path.map((p) => {
	      const center = getHexCenter(p.x, p.y, this.options.size);
	      return new three.Vector3(center.x, 10, center.y);
	    });
	    const geometry = new three.BufferGeometry().setFromPoints(points);
	    const material = new three.LineBasicMaterial({ color: 16711680, linewidth: 5 });
	    this.routeLine = new three.Line(geometry, material);
	    this.scene.add(this.routeLine);
	  }
	  cleanRoutePath() {
	    if (this.routeLine) {
	      this.scene.remove(this.routeLine);
	      this.routeLine = void 0;
	    }
	  }
	  //Escape hatch for consumers that want to add their own Object3D (units,
	  //effects, custom markers) to the map's scene.
	  add(object) {
	    this.scene.add(object);
	  }
	  remove(object) {
	    this.scene.remove(object);
	  }
	  getCamera() {
	    return this.camera;
	  }
	  getScene() {
	    return this.scene;
	  }
	};

	// src/helpers/setoptions.ts
	function setOptions(obj, options) {
	  if (!Object.hasOwn(obj, "options")) {
	    obj.options = obj.options ? Object.create(obj.options) : {};
	  }
	  for (const i in options) {
	    obj.options[i] = options[i];
	  }
	  return obj.options;
	}
	var Unit = class extends EventEmitter {
	  constructor(options = {}) {
	    super();
	    this.needAnimate = false;
	    this.pathFraction = 0;
	    //Path currently being animated + the cell the model is nearest to right
	    //now. moveTo() sets options.x/y to the *destination* immediately (so game
	    //logic like "which tile holds this unit" is stable), which means position
	    //is wrong as a fog-of-war viewpoint for the whole duration of the
	    //animation - viewPosition below tracks the actual animated location
	    //instead, and "cell_enter" fires as it crosses into each new cell.
	    this.movePath = null;
	    this._viewCell = null;
	    this.options = {
	      animateFrameRate: 50,
	      //Framerate: how much per second run animate function
	      animateSpeed: 1,
	      //Animate speed: how much seconds spend to move from 1 cell to second cell
	      size: 40,
	      //Map size to calculate unit position on map
	      type: "Assets/units/viking_boat",
	      //Model folder path (model.glb + info.json), same convention as city.model/treeModel
	      x: 0,
	      y: 0,
	      actions: new Array(),
	      id: "new id",
	      viewRange: 0,
	      //Hex tiles seen around this unit (see FogOfWar.ts) - overridden by the model's own info.json
	      //Terrain the unit may enter, overridden by the model's own info.json
	      //(e.g. the viking boat sets coastal only) - default deny, so a unit
	      //whose info.json omits a terrain type never routes across it.
	      sea: false,
	      coastal: false,
	      land: false,
	      sand: false,
	      tundra: false,
	      snow: false
	    };
	    setOptions(this, options);
	  }
	  async setUnit() {
	    const { scene, info, fixup } = await loadModel(this.options.type);
	    setOptions(this, info);
	    const model = scene.clone(true);
	    model.applyMatrix4(fixup);
	    this._unit = new three.Object3D();
	    this._unit.add(model);
	    let position = getHexCenter(this.options.x, this.options.y, this.options.size);
	    this._unit.position.set(position.x, 0, position.y);
	  }
	  //----------------------------------------------------------------------------------------------------------
	  //RETURN CURRENT 3D Object
	  //----------------------------------------------------------------------------------------------------------
	  get unit() {
	    return this._unit;
	  }
	  get actions() {
	    return this.options.actions;
	  }
	  get position() {
	    return { x: this.options.x, y: this.options.y };
	  }
	  get id() {
	    return this.options.id;
	  }
	  get viewRange() {
	    return this.options.viewRange;
	  }
	  //Which Land types this unit may enter (its info.json terrain flags) -
	  //feeds PathFinder so a route never crosses a tile the unit can't reach.
	  get terrain() {
	    return {
	      ["sea" /* sea */]: this.options.sea,
	      ["coastal" /* coastal */]: this.options.coastal,
	      ["land" /* land */]: this.options.land,
	      ["sand" /* sand */]: this.options.sand,
	      ["tundra" /* tundra */]: this.options.tundra,
	      ["snow" /* snow */]: this.options.snow
	    };
	  }
	  //Where the unit actually is *right now* - the cell nearest the animated
	  //model while a moveTo() is in flight, its resting position otherwise. Use
	  //this (not position, which jumps to the destination the moment moveTo()
	  //is called) as the fog-of-war viewpoint, so tiles reveal as the unit
	  //passes them instead of the whole route lighting up at once.
	  get viewPosition() {
	    return this._viewCell ?? this.position;
	  }
	  set position(position) {
	    this.options.y = position.y;
	    this.options.x = position.x;
	  }
	  activate(action) {
	    if (this.options.actions.includes(action)) {
	      this._action = action;
	    } else {
	      console.log(`${action} isnt inside enum UnitActions, skip.`);
	    }
	  }
	  moveTo(path) {
	    this.options.x = path[path.length - 1]["x"];
	    this.options.y = path[path.length - 1]["y"];
	    const pointsPath = new three.CurvePath();
	    let prevPoint3 = new three.Vector3(0, 0, 0);
	    for (let i = 0; i < path.length; i++) {
	      let position = getHexCenter(path[i]["x"], path[i]["y"], this.options.size);
	      let point3ForRoute = new three.Vector3(position.x, 0, position.y);
	      if (i > 0) {
	        const Line2 = new three.LineCurve3(
	          prevPoint3,
	          point3ForRoute
	        );
	        pointsPath.add(Line2);
	      }
	      prevPoint3 = point3ForRoute;
	    }
	    this.pointsPath = pointsPath;
	    this.movePath = path;
	    this._viewCell = path[0];
	    this.needAnimate = true;
	    this.emit("start_move", { id: this.id, from: path[0], to: this.position, path });
	    this.animation(path.length);
	  }
	  async animation(cellCount) {
	    if (this.needAnimate) {
	      let pathFraction = 1 / (cellCount * this.options.animateSpeed * this.options.animateFrameRate);
	      while (this.needAnimate) {
	        this.pathFraction += pathFraction;
	        if (this.pathFraction > 1) {
	          this.pathFraction = 0;
	          this.needAnimate = false;
	        } else {
	          let newPosition = this.pointsPath.getPoint(this.pathFraction);
	          let tangent = this.pointsPath.getTangent(this.pathFraction);
	          const up = new three.Vector3(0, 0, 1);
	          let axis = new three.Vector3();
	          axis.crossVectors(up, tangent).normalize();
	          let radians = Math.acos(up.dot(tangent));
	          this.unit.position.copy(newPosition);
	          this.unit.quaternion.setFromAxisAngle(axis, radians);
	          if (this.movePath && this._viewCell) {
	            const cellIndex = Math.round(this.pathFraction * (this.movePath.length - 1));
	            const cell = this.movePath[cellIndex];
	            if (cell && (cell.x !== this._viewCell.x || cell.y !== this._viewCell.y)) {
	              this._viewCell = cell;
	              this.emit("cell_enter", { id: this.id, cell });
	            }
	          }
	        }
	        await wait(Math.floor(1e3 / this.options.animateFrameRate));
	      }
	      this.movePath = null;
	      this._viewCell = null;
	      this.emit("end_move", { id: this.id, position: this.position });
	    }
	  }
	};

	// src/helpers/fog.ts
	function tilesWithinRange(map, x, y, range) {
	  if (range < 0 || !map.data[x]?.[y]) return [];
	  const visited = /* @__PURE__ */ new Set([`${x},${y}`]);
	  const result = [{ x, y }];
	  let frontier = [{ x, y }];
	  for (let step = 0; step < range; step++) {
	    const next = [];
	    for (const tile of frontier) {
	      for (const n of getNeighbors(tile.x, tile.y)) {
	        const key = `${n.x},${n.y}`;
	        if (visited.has(key)) continue;
	        if (!map.data[n.x]?.[n.y]) continue;
	        visited.add(key);
	        next.push({ x: n.x, y: n.y });
	        result.push({ x: n.x, y: n.y });
	      }
	    }
	    frontier = next;
	  }
	  return result;
	}

	// src/objects/FogOfWar.ts
	var FogState = /* @__PURE__ */ ((FogState2) => {
	  FogState2[FogState2["Unseen"] = 0] = "Unseen";
	  FogState2[FogState2["Explored"] = 1] = "Explored";
	  FogState2[FogState2["Visible"] = 2] = "Visible";
	  return FogState2;
	})(FogState || {});
	var FogOfWar = class {
	  constructor(map) {
	    this.map = map;
	    this.state = new Uint8Array(map.w * map.h);
	  }
	  index(x, y) {
	    return x * this.map.h + y;
	  }
	  getState(x, y) {
	    return this.state[this.index(x, y)];
	  }
	  //Every existing tile, at its current state - used once at startup to sync
	  //a renderer whose own default (see HexMap.setTileFog()) doesn't necessarily
	  //match this class's all-Unseen initial state.
	  allTiles() {
	    const tiles = [];
	    for (let x = 0; x < this.map.w; x++) {
	      for (let y = 0; y < this.map.h; y++) {
	        if (!this.map.data[x]?.[y]) continue;
	        tiles.push({ x, y, state: this.state[this.index(x, y)] });
	      }
	    }
	    return tiles;
	  }
	  //Recomputes which tiles are currently visible from `viewers` (typically
	  //every unit's {x, y, viewRange}) and updates state accordingly: tiles now
	  //visible -> Visible; tiles that *were* Visible but no longer are ->
	  //Explored (remembered, but dimmed); everything else is untouched (an
	  //Unseen tile stays Unseen until it's actually been seen at least once).
	  //Returns only the tiles whose state actually changed, so callers can push
	  //a cheap incremental update to the renderer instead of touching every tile.
	  recompute(viewers) {
	    const nowVisible = /* @__PURE__ */ new Set();
	    for (const viewer of viewers) {
	      for (const tile of tilesWithinRange(this.map, viewer.x, viewer.y, viewer.viewRange)) {
	        nowVisible.add(`${tile.x},${tile.y}`);
	      }
	    }
	    const changes = [];
	    for (let x = 0; x < this.map.w; x++) {
	      for (let y = 0; y < this.map.h; y++) {
	        if (!this.map.data[x]?.[y]) continue;
	        const idx = this.index(x, y);
	        const was = this.state[idx];
	        const isVisibleNow = nowVisible.has(`${x},${y}`);
	        const next = isVisibleNow ? 2 /* Visible */ : was === 2 /* Visible */ ? 1 /* Explored */ : was;
	        if (next !== was) {
	          this.state[idx] = next;
	          changes.push({ x, y, state: next });
	        }
	      }
	    }
	    return changes;
	  }
	};

	// src/helpers/pathfinder.ts
	var PathFinder = class {
	  constructor(map, restricted, accessible) {
	    this.firstrowlong = false;
	    this.mapSizeX = map.w;
	    this.mapSizeY = map.h;
	    this.mapArray = map.data;
	    this.restricted = restricted;
	    this.accessible = accessible;
	  }
	  find(start_x, start_y, end_x, end_y) {
	    var newPath = [];
	    var error = 0;
	    if (start_x == end_x && start_y == end_y)
	      error = 1;
	    if (!this.hex_accessible(start_x, start_y))
	      error = 1;
	    if (!this.hex_accessible(end_x, end_y))
	      error = 1;
	    if (error == 1) {
	      console.log("Path is impossible to create: " + start_x + ", " + start_y + " to " + end_x + ", " + end_y);
	      return newPath;
	    }
	    var openlist = new Array(this.mapSizeX * this.mapSizeY + 2);
	    var openlist_x = new Array(this.mapSizeX);
	    var openlist_y = new Array(this.mapSizeY);
	    var statelist = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
	    var openlist_g = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
	    var openlist_f = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
	    var openlist_h = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
	    var parent_x = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
	    var parent_y = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
	    var path = this.multiDimensionalArray(this.mapSizeX * this.mapSizeY + 2, 2);
	    var select_x = 0;
	    var select_y = 0;
	    var node_x = 0;
	    var node_y = 0;
	    var counter = 1;
	    var selected_id = 0;
	    openlist[1] = true;
	    openlist_x[1] = start_x;
	    openlist_y[1] = start_y;
	    openlist_f[start_x][start_y] = 0;
	    openlist_h[start_x][start_y] = 0;
	    openlist_g[start_x][start_y] = 0;
	    statelist[start_x][start_y] = true;
	    while (statelist[end_x][end_y] != true) {
	      let set_first = true;
	      let lowest_x;
	      let lowest_y;
	      for (var i in openlist) {
	        if (openlist[i] == true) {
	          select_x = openlist_x[i];
	          select_y = openlist_y[i];
	          let lowest_found;
	          if (set_first == true) {
	            lowest_found = openlist_f[select_x][select_y];
	            set_first = false;
	          }
	          if (openlist_f[select_x][select_y] <= lowest_found) {
	            lowest_found = openlist_f[select_x][select_y];
	            lowest_x = openlist_x[i];
	            lowest_y = openlist_y[i];
	            selected_id = i;
	          }
	        }
	      }
	      if (set_first == true) {
	        return newPath;
	      }
	      statelist[lowest_x][lowest_y] = 2;
	      openlist[selected_id] = false;
	      for (let i2 = 1; i2 < 7; i2++) {
	        switch (i2) {
	          case 1:
	            node_x = parseInt(lowest_x) + 1;
	            if (this.firstrowlong) {
	              if (this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y);
	              } else {
	                node_y = parseInt(lowest_y) - 1;
	              }
	            } else {
	              if (!this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y);
	              } else {
	                node_y = parseInt(lowest_y) - 1;
	              }
	            }
	            break;
	          case 2:
	            node_x = parseInt(lowest_x);
	            node_y = parseInt(lowest_y) - 1;
	            break;
	          case 3:
	            node_x = parseInt(lowest_x) - 1;
	            if (this.firstrowlong) {
	              if (this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y);
	              } else {
	                node_y = parseInt(lowest_y) - 1;
	              }
	            } else {
	              if (!this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y);
	              } else {
	                node_y = parseInt(lowest_y) - 1;
	              }
	            }
	            break;
	          case 4:
	            node_x = parseInt(lowest_x) - 1;
	            if (this.firstrowlong) {
	              if (this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y) + 1;
	              } else {
	                node_y = parseInt(lowest_y);
	              }
	            } else {
	              if (!this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y) + 1;
	              } else {
	                node_y = parseInt(lowest_y);
	              }
	            }
	            break;
	          case 5:
	            node_x = parseInt(lowest_x);
	            node_y = parseInt(lowest_y) + 1;
	            break;
	          case 6:
	            node_x = parseInt(lowest_x) + 1;
	            if (this.firstrowlong) {
	              if (this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y) + 1;
	              } else {
	                node_y = parseInt(lowest_y);
	              }
	            } else {
	              if (!this.isodd(lowest_x)) {
	                node_y = parseInt(lowest_y) + 1;
	              } else {
	                node_y = parseInt(lowest_y);
	              }
	            }
	            break;
	        }
	        if (this.hex_accessible(node_x, node_y)) {
	          if (statelist[node_x][node_y] == true) {
	            if (openlist_g[lowest_x][lowest_y] + 10 < openlist_g[node_x][node_y]) {
	              parent_x[node_x][node_y] = lowest_x;
	              parent_y[node_x][node_y] = lowest_y;
	              openlist_g[node_x][node_y] = openlist_g[lowest_x][lowest_y] + 10;
	              openlist_f[node_x][node_y] = openlist_g[node_x][node_y] + openlist_h[node_x][node_y];
	            }
	          } else if (statelist[node_x][node_y] == 2) ; else {
	            counter++;
	            openlist[counter] = true;
	            openlist_x[counter] = node_x;
	            openlist_y[counter] = node_y;
	            statelist[node_x][node_y] = true;
	            parent_x[node_x][node_y] = lowest_x;
	            parent_y[node_x][node_y] = lowest_y;
	            openlist_h[node_x][node_y] = this.hex_distance(node_x, node_y, end_x, end_y) * 10;
	            openlist_g[node_x][node_y] = openlist_g[lowest_x][lowest_y] + 10;
	            openlist_f[node_x][node_y] = openlist_g[node_x][node_y] + openlist_h[node_x][node_y];
	          }
	        }
	      }
	    }
	    let temp_x = end_x;
	    let temp_y = end_y;
	    counter = 0;
	    while (temp_x != start_x || temp_y != start_y) {
	      counter++;
	      path[counter][1] = temp_x;
	      path[counter][2] = temp_y;
	      temp_x = parent_x[path[counter][1]][path[counter][2]];
	      temp_y = parent_y[path[counter][1]][path[counter][2]];
	    }
	    counter++;
	    path[counter][1] = start_x;
	    path[counter][2] = start_y;
	    while (counter != 0) {
	      newPath.push({ x: path[counter][1], y: path[counter][2] });
	      counter--;
	    }
	    return newPath;
	  }
	  // check if hex is accessible
	  hex_accessible(x, y) {
	    if (this.mapArray[x] === void 0) {
	      return false;
	    }
	    if (this.mapArray[x][y] === void 0) {
	      return false;
	    }
	    if (this.restricted[this.mapArray[x][y]["type"]] !== true) {
	      return false;
	    }
	    if (this.accessible && !this.accessible(x, y)) {
	      return false;
	    }
	    return true;
	  }
	  // create a multi-dimensional array
	  multiDimensionalArray(nRows, nCols) {
	    let a = new Array(nRows);
	    for (let i = 0; i < nRows; i++) {
	      a[i] = new Array(nCols);
	      for (let j = 0; j < nCols; j++) {
	        a[i][j] = "";
	      }
	    }
	    return a;
	  }
	  // check whether a given number is odd or even
	  isodd(n) {
	    return n % 2;
	  }
	  // calculate distance between two hexes, in tiles. Converts the map's
	  // column-offset coordinates to axial ones (matching the neighbor layout
	  // in find(), incl. firstrowlong) and uses the standard axial hex distance.
	  // The old Euclidean distance overestimates on a hex grid, making the A*
	  // heuristic inadmissible - paths came out longer than needed.
	  hex_distance(x1, y1, x2, y2) {
	    const dq = x1 - x2;
	    const dr = y1 - this.row_shift(x1) - (y2 - this.row_shift(x2));
	    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
	  }
	  // how far a column's tiles are shifted in axial space (offset -> axial)
	  row_shift(x) {
	    return this.firstrowlong ? (x - this.isodd(x)) / 2 : (x + this.isodd(x)) / 2;
	  }
	};

	// src/gameengine.ts
	var GameEngine = class extends EventEmitter {
	  constructor(options) {
	    super();
	    this._unitsList = {};
	    this.options = {
	      preventCellClick: true,
	      fogOfWar: true
	    };
	    setOptions(this, options);
	    this._map = new HexMap(options);
	    this._map.on("click", (payload) => this.cellClick(payload));
	    this._map.on("hover", (payload) => this.cellHover(payload));
	  }
	  async init(mapData, unitsData = []) {
	    this._mapData = mapData;
	    await this._map.load(mapData);
	    for (const unitInfo of unitsData) {
	      const unit = new Unit(unitInfo);
	      await unit.setUnit();
	      unit.on("start_move", (payload) => this.emit("start_move", payload));
	      unit.on("end_move", (payload) => this.emit("end_move", payload));
	      unit.on("cell_enter", (payload) => {
	        this.emit("cell_enter", payload);
	        this.recomputeFog();
	      });
	      unit.on("end_move", () => this.recomputeFog());
	      this._map.add(unit.unit);
	      this._unitsList[unit.id] = unit;
	      this._mapData.data[unit.position.x][unit.position.y].unit = unit.id;
	    }
	    if (this.options.fogOfWar) {
	      this._fog = new FogOfWar(mapData);
	      for (const tile of this._fog.allTiles()) this._map.setTileFog(tile.x, tile.y, tile.state);
	      this.recomputeFog();
	    }
	  }
	  //Recomputes which tiles are currently visible from every unit's own
	  //{x, y, viewRange} (see FogOfWar.recompute()), pushes only the tiles whose
	  //state actually changed into HexMap.setTileFog(), and hides/shows each
	  //unit's own model - a unit always sees its own tile, so this never hides
	  //a unit standing still, only ones that have moved out of view (there's no
	  //ownership/faction concept yet, so every unit in _unitsList reveals fog
	  //the same way "friendly" units would). Uses viewPosition, not position:
	  //during a moveTo() animation position is already the destination, while
	  //viewPosition tracks the cell the model is actually passing through.
	  recomputeFog() {
	    if (!this._fog) return;
	    const units = Object.values(this._unitsList);
	    const changes = this._fog.recompute(units.map((u) => ({ ...u.viewPosition, viewRange: u.viewRange })));
	    for (const change of changes) this._map.setTileFog(change.x, change.y, change.state);
	    for (const unit of units) {
	      unit.unit.visible = this._fog.getState(unit.viewPosition.x, unit.viewPosition.y) === 2 /* Visible */;
	    }
	  }
	  cellHover(payload) {
	    this._map.cleanRoutePath();
	    if (this._currentUnit) {
	      const path = this.findPath(this._currentUnit.position, payload);
	      if (path.length > 0) this._map.drawRoutePath(path);
	    }
	    this.emit("hover", payload);
	  }
	  cellClick({ x, y }) {
	    const cellCoords = { x, y };
	    const unitID = this._mapData.data[x][y].unit;
	    if (unitID) {
	      if (!this.options.preventCellClick) {
	        this.emit("click", cellCoords);
	      }
	      this._currentUnit = this._unitsList[unitID];
	      this.emit("unitClick", cellCoords);
	    } else {
	      if (this._currentUnit) {
	        const path = this.findPath(this._currentUnit.position, cellCoords);
	        if (path.length > 0) {
	          delete this._mapData.data[this._currentUnit.position.x][this._currentUnit.position.y].unit;
	          this._currentUnit.moveTo(path);
	          this._mapData.data[x][y].unit = this._currentUnit.id;
	        }
	      }
	      this._currentUnit = void 0;
	      this.emit("click", cellCoords);
	    }
	  }
	  get currentUnit() {
	    return this._currentUnit;
	  }
	  get map() {
	    return this._map;
	  }
	  get fogOfWar() {
	    return this._fog;
	  }
	  //Terrain restrictions come from the unit's own info.json flags (see
	  //Unit.terrain - e.g. the viking boat is coastal-only), not a global table,
	  //so each unit type routes over exactly the tiles it may enter. Defaults to
	  //the currently selected unit; without any unit every terrain is allowed.
	  findPath(start, stop, unit = this._currentUnit) {
	    const restrictions = unit ? unit.terrain : {
	      sea: true,
	      coastal: true,
	      land: true,
	      sand: true,
	      tundra: true,
	      snow: true
	    };
	    const fog = this._fog;
	    const pathFinder = new PathFinder(
	      this._mapData,
	      restrictions,
	      fog ? (x, y) => fog.getState(x, y) !== 0 /* Unseen */ : void 0
	    );
	    return pathFinder.find(start.x, start.y, stop.x, stop.y);
	  }
	};

	exports.EventEmitter = EventEmitter;
	exports.FogOfWar = FogOfWar;
	exports.FogState = FogState;
	exports.GameEngine = GameEngine;
	exports.HEXPolygon = HEXPolygon;
	exports.HexMap = HexMap;
	exports.Land = Land;
	exports.LandColor = LandColor;
	exports.LandPriority = LandPriority;
	exports.NEIGHBOR_DIRECTIONS = NEIGHBOR_DIRECTIONS;
	exports.PathFinder = PathFinder;
	exports.Unit = Unit;
	exports.UnitActions = UnitActions;
	exports.getHexCenter = getHexCenter;
	exports.getNeighborCoords = getNeighborCoords;
	exports.getNeighbors = getNeighbors;

}));
//# sourceMappingURL=hex-map.global.js.map
