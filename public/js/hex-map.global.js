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
	var pointInPolygon = /*@__PURE__*/getDefaultExportFromCjs(robustPnpExports);

	/*!
	fflate - fast JavaScript compression/decompression
	<https://101arrowz.github.io/fflate>
	Licensed under MIT. https://github.com/101arrowz/fflate/blob/master/LICENSE
	version 0.8.2
	*/


	// aliases for shorter compressed code (most minifers don't do this)
	var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
	// fixed length extra bits
	var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
	// fixed distance extra bits
	var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
	// code length index map
	var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
	// get base, reverse index map from extra bits
	var freb = function (eb, start) {
	    var b = new u16(31);
	    for (var i = 0; i < 31; ++i) {
	        b[i] = start += 1 << eb[i - 1];
	    }
	    // numbers here are at max 18 bits
	    var r = new i32(b[30]);
	    for (var i = 1; i < 30; ++i) {
	        for (var j = b[i]; j < b[i + 1]; ++j) {
	            r[j] = ((j - b[i]) << 5) | i;
	        }
	    }
	    return { b: b, r: r };
	};
	var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
	// we can ignore the fact that the other numbers are wrong; they never happen anyway
	fl[28] = 258, revfl[258] = 28;
	var _b = freb(fdeb, 0), fd = _b.b;
	// map of value to reverse (assuming 16 bits)
	var rev = new u16(32768);
	for (var i = 0; i < 32768; ++i) {
	    // reverse table algorithm from SO
	    var x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
	    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
	    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
	    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
	}
	// create huffman tree from u8 "map": index -> code length for code index
	// mb (max bits) must be at most 15
	// TODO: optimize/split up?
	var hMap = (function (cd, mb, r) {
	    var s = cd.length;
	    // index
	    var i = 0;
	    // u16 "map": index -> # of codes with bit length = index
	    var l = new u16(mb);
	    // length of cd must be 288 (total # of codes)
	    for (; i < s; ++i) {
	        if (cd[i])
	            ++l[cd[i] - 1];
	    }
	    // u16 "map": index -> minimum code for bit length = index
	    var le = new u16(mb);
	    for (i = 1; i < mb; ++i) {
	        le[i] = (le[i - 1] + l[i - 1]) << 1;
	    }
	    var co;
	    if (r) {
	        // u16 "map": index -> number of actual bits, symbol for code
	        co = new u16(1 << mb);
	        // bits to remove for reverser
	        var rvb = 15 - mb;
	        for (i = 0; i < s; ++i) {
	            // ignore 0 lengths
	            if (cd[i]) {
	                // num encoding both symbol and bits read
	                var sv = (i << 4) | cd[i];
	                // free bits
	                var r_1 = mb - cd[i];
	                // start value
	                var v = le[cd[i] - 1]++ << r_1;
	                // m is end value
	                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
	                    // every 16 bit value starting with the code yields the same result
	                    co[rev[v] >> rvb] = sv;
	                }
	            }
	        }
	    }
	    else {
	        co = new u16(s);
	        for (i = 0; i < s; ++i) {
	            if (cd[i]) {
	                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
	            }
	        }
	    }
	    return co;
	});
	// fixed length tree
	var flt = new u8(288);
	for (var i = 0; i < 144; ++i)
	    flt[i] = 8;
	for (var i = 144; i < 256; ++i)
	    flt[i] = 9;
	for (var i = 256; i < 280; ++i)
	    flt[i] = 7;
	for (var i = 280; i < 288; ++i)
	    flt[i] = 8;
	// fixed distance tree
	var fdt = new u8(32);
	for (var i = 0; i < 32; ++i)
	    fdt[i] = 5;
	// fixed length map
	var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
	// fixed distance map
	var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
	// find max of array
	var max = function (a) {
	    var m = a[0];
	    for (var i = 1; i < a.length; ++i) {
	        if (a[i] > m)
	            m = a[i];
	    }
	    return m;
	};
	// read d, starting at bit p and mask with m
	var bits = function (d, p, m) {
	    var o = (p / 8) | 0;
	    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
	};
	// read d, starting at bit p continuing for at least 16 bits
	var bits16 = function (d, p) {
	    var o = (p / 8) | 0;
	    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
	};
	// get end of byte
	var shft = function (p) { return ((p + 7) / 8) | 0; };
	// typed array slice - allows garbage collector to free original reference,
	// while being more compatible than .slice
	var slc = function (v, s, e) {
	    if (e == null || e > v.length)
	        e = v.length;
	    // can't use .constructor in case user-supplied
	    return new u8(v.subarray(s, e));
	};
	// error codes
	var ec = [
	    'unexpected EOF',
	    'invalid block type',
	    'invalid length/literal',
	    'invalid distance',
	    'stream finished',
	    'no stream handler',
	    ,
	    'no callback',
	    'invalid UTF-8 data',
	    'extra field too long',
	    'date not in range 1980-2099',
	    'filename too long',
	    'stream finishing',
	    'invalid zip data'
	    // determined by unknown compression method
	];
	var err = function (ind, msg, nt) {
	    var e = new Error(msg || ec[ind]);
	    e.code = ind;
	    if (Error.captureStackTrace)
	        Error.captureStackTrace(e, err);
	    if (!nt)
	        throw e;
	    return e;
	};
	// expands raw DEFLATE data
	var inflt = function (dat, st, buf, dict) {
	    // source length       dict length
	    var sl = dat.length, dl = 0;
	    if (!sl || st.f && !st.l)
	        return buf || new u8(0);
	    var noBuf = !buf;
	    // have to estimate size
	    var resize = noBuf || st.i != 2;
	    // no state
	    var noSt = st.i;
	    // Assumes roughly 33% compression ratio average
	    if (noBuf)
	        buf = new u8(sl * 3);
	    // ensure buffer can fit at least l elements
	    var cbuf = function (l) {
	        var bl = buf.length;
	        // need to increase size to fit
	        if (l > bl) {
	            // Double or set to necessary, whichever is greater
	            var nbuf = new u8(Math.max(bl * 2, l));
	            nbuf.set(buf);
	            buf = nbuf;
	        }
	    };
	    //  last chunk         bitpos           bytes
	    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
	    // total bits
	    var tbts = sl * 8;
	    do {
	        if (!lm) {
	            // BFINAL - this is only 1 when last chunk is next
	            final = bits(dat, pos, 1);
	            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
	            var type = bits(dat, pos + 1, 3);
	            pos += 3;
	            if (!type) {
	                // go to end of byte boundary
	                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
	                if (t > sl) {
	                    if (noSt)
	                        err(0);
	                    break;
	                }
	                // ensure size
	                if (resize)
	                    cbuf(bt + l);
	                // Copy over uncompressed data
	                buf.set(dat.subarray(s, t), bt);
	                // Get new bitpos, update byte count
	                st.b = bt += l, st.p = pos = t * 8, st.f = final;
	                continue;
	            }
	            else if (type == 1)
	                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
	            else if (type == 2) {
	                //  literal                            lengths
	                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
	                var tl = hLit + bits(dat, pos + 5, 31) + 1;
	                pos += 14;
	                // length+distance tree
	                var ldt = new u8(tl);
	                // code length tree
	                var clt = new u8(19);
	                for (var i = 0; i < hcLen; ++i) {
	                    // use index map to get real code
	                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
	                }
	                pos += hcLen * 3;
	                // code lengths bits
	                var clb = max(clt), clbmsk = (1 << clb) - 1;
	                // code lengths map
	                var clm = hMap(clt, clb, 1);
	                for (var i = 0; i < tl;) {
	                    var r = clm[bits(dat, pos, clbmsk)];
	                    // bits read
	                    pos += r & 15;
	                    // symbol
	                    var s = r >> 4;
	                    // code length to copy
	                    if (s < 16) {
	                        ldt[i++] = s;
	                    }
	                    else {
	                        //  copy   count
	                        var c = 0, n = 0;
	                        if (s == 16)
	                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
	                        else if (s == 17)
	                            n = 3 + bits(dat, pos, 7), pos += 3;
	                        else if (s == 18)
	                            n = 11 + bits(dat, pos, 127), pos += 7;
	                        while (n--)
	                            ldt[i++] = c;
	                    }
	                }
	                //    length tree                 distance tree
	                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
	                // max length bits
	                lbt = max(lt);
	                // max dist bits
	                dbt = max(dt);
	                lm = hMap(lt, lbt, 1);
	                dm = hMap(dt, dbt, 1);
	            }
	            else
	                err(1);
	            if (pos > tbts) {
	                if (noSt)
	                    err(0);
	                break;
	            }
	        }
	        // Make sure the buffer can hold this + the largest possible addition
	        // Maximum chunk size (practically, theoretically infinite) is 2^17
	        if (resize)
	            cbuf(bt + 131072);
	        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
	        var lpos = pos;
	        for (;; lpos = pos) {
	            // bits read, code
	            var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
	            pos += c & 15;
	            if (pos > tbts) {
	                if (noSt)
	                    err(0);
	                break;
	            }
	            if (!c)
	                err(2);
	            if (sym < 256)
	                buf[bt++] = sym;
	            else if (sym == 256) {
	                lpos = pos, lm = null;
	                break;
	            }
	            else {
	                var add = sym - 254;
	                // no extra bits needed if less
	                if (sym > 264) {
	                    // index
	                    var i = sym - 257, b = fleb[i];
	                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
	                    pos += b;
	                }
	                // dist
	                var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
	                if (!d)
	                    err(3);
	                pos += d & 15;
	                var dt = fd[dsym];
	                if (dsym > 3) {
	                    var b = fdeb[dsym];
	                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
	                }
	                if (pos > tbts) {
	                    if (noSt)
	                        err(0);
	                    break;
	                }
	                if (resize)
	                    cbuf(bt + 131072);
	                var end = bt + add;
	                if (bt < dt) {
	                    var shift = dl - dt, dend = Math.min(dt, end);
	                    if (shift + bt < 0)
	                        err(3);
	                    for (; bt < dend; ++bt)
	                        buf[bt] = dict[shift + bt];
	                }
	                for (; bt < end; ++bt)
	                    buf[bt] = buf[bt - dt];
	            }
	        }
	        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
	        if (lm)
	            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
	    } while (!final);
	    // don't reallocate for streams or user buffers
	    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
	};
	// empty
	var et = /*#__PURE__*/ new u8(0);
	// zlib start
	var zls = function (d, dict) {
	    if ((d[0] & 15) != 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
	        err(6, 'invalid zlib data');
	    if ((d[1] >> 5 & 1) == 1)
	        err(6, 'invalid zlib data: ' + (d[1] & 32 ? 'need' : 'unexpected') + ' dictionary');
	    return (d[1] >> 3 & 4) + 2;
	};
	/**
	 * Expands Zlib data
	 * @param data The data to decompress
	 * @param opts The decompression options
	 * @returns The decompressed version of the data
	 */
	function unzlibSync(data, opts) {
	    return inflt(data.subarray(zls(data), -4), { i: 2 }, opts, opts);
	}
	// text decoder
	var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
	// text decoder stream
	var tds = 0;
	try {
	    td.decode(et, { stream: true });
	    tds = 1;
	}
	catch (e) { }

	/**
	 * @module NURBSUtils
	 * @three_import import * as NURBSUtils from 'three/addons/curves/NURBSUtils.js';
	 */

	/**
	 * Finds knot vector span.
	 *
	 * @param {number} p - The degree.
	 * @param {number} u - The parametric value.
	 * @param {Array<number>} U - The knot vector.
	 * @return {number} The span.
	 */
	function findSpan( p, u, U ) {

		const n = U.length - p - 1;

		if ( u >= U[ n ] ) {

			return n - 1;

		}

		if ( u <= U[ p ] ) {

			return p;

		}

		let low = p;
		let high = n;
		let mid = Math.floor( ( low + high ) / 2 );

		while ( u < U[ mid ] || u >= U[ mid + 1 ] ) {

			if ( u < U[ mid ] ) {

				high = mid;

			} else {

				low = mid;

			}

			mid = Math.floor( ( low + high ) / 2 );

		}

		return mid;

	}

	/**
	 * Calculates basis functions. See The NURBS Book, page 70, algorithm A2.2.
	 *
	 * @param {number} span - The span in which `u` lies.
	 * @param {number} u - The parametric value.
	 * @param {number} p - The degree.
	 * @param {Array<number>} U - The knot vector.
	 * @return {Array<number>} Array[p+1] with basis functions values.
	 */
	function calcBasisFunctions( span, u, p, U ) {

		const N = [];
		const left = [];
		const right = [];
		N[ 0 ] = 1.0;

		for ( let j = 1; j <= p; ++ j ) {

			left[ j ] = u - U[ span + 1 - j ];
			right[ j ] = U[ span + j ] - u;

			let saved = 0.0;

			for ( let r = 0; r < j; ++ r ) {

				const rv = right[ r + 1 ];
				const lv = left[ j - r ];
				const temp = N[ r ] / ( rv + lv );
				N[ r ] = saved + rv * temp;
				saved = lv * temp;

			}

			N[ j ] = saved;

		}

		return N;

	}

	/**
	 * Calculates B-Spline curve points. See The NURBS Book, page 82, algorithm A3.1.
	 *
	 * @param {number} p - The degree of the B-Spline.
	 * @param {Array<number>} U - The knot vector.
	 * @param {Array<Vector4>} P - The control points
	 * @param {number} u - The parametric point.
	 * @return {Vector4} The point for given `u`.
	 */
	function calcBSplinePoint( p, U, P, u ) {

		const span = findSpan( p, u, U );
		const N = calcBasisFunctions( span, u, p, U );
		const C = new three.Vector4( 0, 0, 0, 0 );

		for ( let j = 0; j <= p; ++ j ) {

			const point = P[ span - p + j ];
			const Nj = N[ j ];
			const wNj = point.w * Nj;
			C.x += point.x * wNj;
			C.y += point.y * wNj;
			C.z += point.z * wNj;
			C.w += point.w * Nj;

		}

		return C;

	}

	/**
	 * Calculates basis functions derivatives. See The NURBS Book, page 72, algorithm A2.3.
	 *
	 * @param {number} span - The span in which `u` lies.
	 * @param {number} u - The parametric point.
	 * @param {number} p - The degree.
	 * @param {number} n - number of derivatives to calculate
	 * @param {Array<number>} U - The knot vector.
	 * @return {Array<Array<number>>} An array[n+1][p+1] with basis functions derivatives.
	 */
	function calcBasisFunctionDerivatives( span, u, p, n, U ) {

		const zeroArr = [];
		for ( let i = 0; i <= p; ++ i )
			zeroArr[ i ] = 0.0;

		const ders = [];

		for ( let i = 0; i <= n; ++ i )
			ders[ i ] = zeroArr.slice( 0 );

		const ndu = [];

		for ( let i = 0; i <= p; ++ i )
			ndu[ i ] = zeroArr.slice( 0 );

		ndu[ 0 ][ 0 ] = 1.0;

		const left = zeroArr.slice( 0 );
		const right = zeroArr.slice( 0 );

		for ( let j = 1; j <= p; ++ j ) {

			left[ j ] = u - U[ span + 1 - j ];
			right[ j ] = U[ span + j ] - u;

			let saved = 0.0;

			for ( let r = 0; r < j; ++ r ) {

				const rv = right[ r + 1 ];
				const lv = left[ j - r ];
				ndu[ j ][ r ] = rv + lv;

				const temp = ndu[ r ][ j - 1 ] / ndu[ j ][ r ];
				ndu[ r ][ j ] = saved + rv * temp;
				saved = lv * temp;

			}

			ndu[ j ][ j ] = saved;

		}

		for ( let j = 0; j <= p; ++ j ) {

			ders[ 0 ][ j ] = ndu[ j ][ p ];

		}

		for ( let r = 0; r <= p; ++ r ) {

			let s1 = 0;
			let s2 = 1;

			const a = [];
			for ( let i = 0; i <= p; ++ i ) {

				a[ i ] = zeroArr.slice( 0 );

			}

			a[ 0 ][ 0 ] = 1.0;

			for ( let k = 1; k <= n; ++ k ) {

				let d = 0.0;
				const rk = r - k;
				const pk = p - k;

				if ( r >= k ) {

					a[ s2 ][ 0 ] = a[ s1 ][ 0 ] / ndu[ pk + 1 ][ rk ];
					d = a[ s2 ][ 0 ] * ndu[ rk ][ pk ];

				}

				const j1 = ( rk >= -1 ) ? 1 : - rk;
				const j2 = ( r - 1 <= pk ) ? k - 1 : p - r;

				for ( let j = j1; j <= j2; ++ j ) {

					a[ s2 ][ j ] = ( a[ s1 ][ j ] - a[ s1 ][ j - 1 ] ) / ndu[ pk + 1 ][ rk + j ];
					d += a[ s2 ][ j ] * ndu[ rk + j ][ pk ];

				}

				if ( r <= pk ) {

					a[ s2 ][ k ] = - a[ s1 ][ k - 1 ] / ndu[ pk + 1 ][ r ];
					d += a[ s2 ][ k ] * ndu[ r ][ pk ];

				}

				ders[ k ][ r ] = d;

				const j = s1;
				s1 = s2;
				s2 = j;

			}

		}

		let r = p;

		for ( let k = 1; k <= n; ++ k ) {

			for ( let j = 0; j <= p; ++ j ) {

				ders[ k ][ j ] *= r;

			}

			r *= p - k;

		}

		return ders;

	}

	/**
	 * Calculates derivatives of a B-Spline. See The NURBS Book, page 93, algorithm A3.2.
	 *
	 * @param {number} p - The degree.
	 * @param {Array<number>} U - The knot vector.
	 * @param {Array<Vector4>} P - The control points
	 * @param {number} u - The parametric point.
	 * @param {number} nd - The number of derivatives.
	 * @return {Array<Vector4>} An array[d+1] with derivatives.
	 */
	function calcBSplineDerivatives( p, U, P, u, nd ) {

		const du = nd < p ? nd : p;
		const CK = [];
		const span = findSpan( p, u, U );
		const nders = calcBasisFunctionDerivatives( span, u, p, du, U );
		const Pw = [];

		for ( let i = 0; i < P.length; ++ i ) {

			const point = P[ i ].clone();
			const w = point.w;

			point.x *= w;
			point.y *= w;
			point.z *= w;

			Pw[ i ] = point;

		}

		for ( let k = 0; k <= du; ++ k ) {

			const point = Pw[ span - p ].clone().multiplyScalar( nders[ k ][ 0 ] );

			for ( let j = 1; j <= p; ++ j ) {

				point.add( Pw[ span - p + j ].clone().multiplyScalar( nders[ k ][ j ] ) );

			}

			CK[ k ] = point;

		}

		for ( let k = du + 1; k <= nd + 1; ++ k ) {

			CK[ k ] = new three.Vector4( 0, 0, 0 );

		}

		return CK;

	}

	/**
	 * Calculates "K over I".
	 *
	 * @param {number} k - The K value.
	 * @param {number} i - The I value.
	 * @return {number} k!/(i!(k-i)!)
	 */
	function calcKoverI( k, i ) {

		let nom = 1;

		for ( let j = 2; j <= k; ++ j ) {

			nom *= j;

		}

		let denom = 1;

		for ( let j = 2; j <= i; ++ j ) {

			denom *= j;

		}

		for ( let j = 2; j <= k - i; ++ j ) {

			denom *= j;

		}

		return nom / denom;

	}

	/**
	 * Calculates derivatives (0-nd) of rational curve. See The NURBS Book, page 127, algorithm A4.2.
	 *
	 * @param {Array<Vector4>} Pders - Array with derivatives.
	 * @return {Array<Vector3>} An array with derivatives for rational curve.
	 */
	function calcRationalCurveDerivatives( Pders ) {

		const nd = Pders.length;
		const Aders = [];
		const wders = [];

		for ( let i = 0; i < nd; ++ i ) {

			const point = Pders[ i ];
			Aders[ i ] = new three.Vector3( point.x, point.y, point.z );
			wders[ i ] = point.w;

		}

		const CK = [];

		for ( let k = 0; k < nd; ++ k ) {

			const v = Aders[ k ].clone();

			for ( let i = 1; i <= k; ++ i ) {

				v.sub( CK[ k - i ].clone().multiplyScalar( calcKoverI( k, i ) * wders[ i ] ) );

			}

			CK[ k ] = v.divideScalar( wders[ 0 ] );

		}

		return CK;

	}

	/**
	 * Calculates NURBS curve derivatives. See The NURBS Book, page 127, algorithm A4.2.
	 *
	 * @param {number} p - The degree.
	 * @param {Array<number>} U - The knot vector.
	 * @param {Array<Vector4>} P - The control points in homogeneous space.
	 * @param {number} u - The parametric point.
	 * @param {number} nd - The number of derivatives.
	 * @return {Array<Vector3>} array with derivatives for rational curve.
	 */
	function calcNURBSDerivatives( p, U, P, u, nd ) {

		const Pders = calcBSplineDerivatives( p, U, P, u, nd );
		return calcRationalCurveDerivatives( Pders );

	}

	/**
	 * This class represents a NURBS curve.
	 *
	 * Implementation is based on `(x, y [, z=0 [, w=1]])` control points with `w=weight`.
	 *
	 * @augments Curve
	 * @three_import import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
	 */
	class NURBSCurve extends three.Curve {

		/**
		 * Constructs a new NURBS curve.
		 *
		 * @param {number} degree - The NURBS degree.
		 * @param {Array<number>} knots - The knots as a flat array of numbers.
		 * @param {Array<Vector2|Vector3|Vector4>} controlPoints - An array holding control points.
		 * @param {number} [startKnot] - Index of the start knot into the `knots` array.
		 * @param {number} [endKnot] - Index of the end knot into the `knots` array.
		 */
		constructor( degree, knots, controlPoints, startKnot, endKnot ) {

			super();

			const knotsLength = knots ? knots.length - 1 : 0;
			const pointsLength = controlPoints ? controlPoints.length : 0;

			/**
			 * The NURBS degree.
			 *
			 * @type {number}
			 */
			this.degree = degree;

			/**
			 * The knots as a flat array of numbers.
			 *
			 * @type {Array<number>}
			 */
			this.knots = knots;

			/**
			 * An array of control points.
			 *
			 * @type {Array<Vector4>}
			 */
			this.controlPoints = [];

			/**
			 * Index of the start knot into the `knots` array.
			 *
			 * @type {number}
			 */
			this.startKnot = startKnot || 0;

			/**
			 * Index of the end knot into the `knots` array.
			 *
			 * @type {number}
			 */
			this.endKnot = endKnot || knotsLength;

			for ( let i = 0; i < pointsLength; ++ i ) {

				// ensure Vector4 for control points
				const point = controlPoints[ i ];
				this.controlPoints[ i ] = new three.Vector4( point.x, point.y, point.z, point.w );

			}

		}

		/**
		 * This method returns a vector in 3D space for the given interpolation factor.
		 *
		 * @param {number} t - A interpolation factor representing a position on the curve. Must be in the range `[0,1]`.
		 * @param {Vector3} [optionalTarget] - The optional target vector the result is written to.
		 * @return {Vector3} The position on the curve.
		 */
		getPoint( t, optionalTarget = new three.Vector3() ) {

			const point = optionalTarget;

			const u = this.knots[ this.startKnot ] + t * ( this.knots[ this.endKnot ] - this.knots[ this.startKnot ] ); // linear mapping t->u

			// following results in (wx, wy, wz, w) homogeneous point
			const hpoint = calcBSplinePoint( this.degree, this.knots, this.controlPoints, u );

			if ( hpoint.w !== 1.0 ) {

				// project to 3D space: (wx, wy, wz, w) -> (x, y, z, 1)
				hpoint.divideScalar( hpoint.w );

			}

			return point.set( hpoint.x, hpoint.y, hpoint.z );

		}

		/**
		 * Returns a unit vector tangent for the given interpolation factor.
		 *
		 * @param {number} t - The interpolation factor.
		 * @param {Vector3} [optionalTarget] - The optional target vector the result is written to.
		 * @return {Vector3} The tangent vector.
		 */
		getTangent( t, optionalTarget = new three.Vector3() ) {

			const tangent = optionalTarget;

			const u = this.knots[ 0 ] + t * ( this.knots[ this.knots.length - 1 ] - this.knots[ 0 ] );
			const ders = calcNURBSDerivatives( this.degree, this.knots, this.controlPoints, u, 1 );
			tangent.copy( ders[ 1 ] ).normalize();

			return tangent;

		}

		toJSON() {

			const data = super.toJSON();

			data.degree = this.degree;
			data.knots = [ ...this.knots ];
			data.controlPoints = this.controlPoints.map( p => p.toArray() );
			data.startKnot = this.startKnot;
			data.endKnot = this.endKnot;

			return data;

		}

		fromJSON( json ) {

			super.fromJSON( json );

			this.degree = json.degree;
			this.knots = [ ...json.knots ];
			this.controlPoints = json.controlPoints.map( p => new three.Vector4( p[ 0 ], p[ 1 ], p[ 2 ], p[ 3 ] ) );
			this.startKnot = json.startKnot;
			this.endKnot = json.endKnot;

			return this;

		}

	}

	let fbxTree;
	let connections;
	let sceneGraph;

	/**
	 * A loader for the FBX format.
	 *
	 * Requires FBX file to be >= 7.0 and in ASCII or >= 6400 in Binary format.
	 * Versions lower than this may load but will probably have errors.
	 *
	 * Needs Support:
	 * - Morph normals / blend shape normals
	 *
	 * FBX format references:
	 * - [C++ SDK reference](https://help.autodesk.com/view/FBX/2017/ENU/?guid=__cpp_ref_index_html)
	 *
	 * Binary format specification:
	 * - [FBX binary file format specification](https://code.blender.org/2013/08/fbx-binary-file-format-specification/)
	 *
	 * ```js
	 * const loader = new FBXLoader();
	 * const object = await loader.loadAsync( 'models/fbx/stanford-bunny.fbx' );
	 * scene.add( object );
	 * ```
	 *
	 * @augments Loader
	 * @three_import import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
	 */
	class FBXLoader extends three.Loader {

		/**
		 * Constructs a new FBX loader.
		 *
		 * @param {LoadingManager} [manager] - The loading manager.
		 */
		constructor( manager ) {

			super( manager );

		}

		/**
		 * Starts loading from the given URL and passes the loaded FBX asset
		 * to the `onLoad()` callback.
		 *
		 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
		 * @param {function(Group)} onLoad - Executed when the loading process has been finished.
		 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
		 * @param {onErrorCallback} onError - Executed when errors occur.
		 */
		load( url, onLoad, onProgress, onError ) {

			const scope = this;

			const path = ( scope.path === '' ) ? three.LoaderUtils.extractUrlBase( url ) : scope.path;

			const loader = new three.FileLoader( this.manager );
			loader.setPath( scope.path );
			loader.setResponseType( 'arraybuffer' );
			loader.setRequestHeader( scope.requestHeader );
			loader.setWithCredentials( scope.withCredentials );

			loader.load( url, function ( buffer ) {

				try {

					onLoad( scope.parse( buffer, path ) );

				} catch ( e ) {

					if ( onError ) {

						onError( e );

					} else {

						console.error( e );

					}

					scope.manager.itemError( url );

				}

			}, onProgress, onError );

		}

		/**
		 * Parses the given FBX data and returns the resulting group.
		 *
		 * @param {ArrayBuffer} FBXBuffer - The raw FBX data as an array buffer.
		 * @param {string} path - The URL base path.
		 * @return {Group} An object representing the parsed asset.
		 */
		parse( FBXBuffer, path ) {

			if ( isFbxFormatBinary( FBXBuffer ) ) {

				fbxTree = new BinaryParser().parse( FBXBuffer );

			} else {

				const FBXText = convertArrayBufferToString( FBXBuffer );

				if ( ! isFbxFormatASCII( FBXText ) ) {

					throw new Error( 'THREE.FBXLoader: Unknown format.' );

				}

				if ( getFbxVersion( FBXText ) < 7000 ) {

					throw new Error( 'THREE.FBXLoader: FBX version not supported, FileVersion: ' + getFbxVersion( FBXText ) );

				}

				fbxTree = new TextParser().parse( FBXText );

			}

			// console.log( fbxTree );

			const textureLoader = new three.TextureLoader( this.manager ).setPath( this.resourcePath || path ).setCrossOrigin( this.crossOrigin );

			return new FBXTreeParser( textureLoader, this.manager ).parse( fbxTree );

		}

	}

	// Parse the FBXTree object returned by the BinaryParser or TextParser and return a Group
	class FBXTreeParser {

		constructor( textureLoader, manager ) {

			this.textureLoader = textureLoader;
			this.manager = manager;

		}

		parse() {

			connections = this.parseConnections();

			const images = this.parseImages();
			const textures = this.parseTextures( images );
			const materials = this.parseMaterials( textures );
			const deformers = this.parseDeformers();
			const geometryMap = new GeometryParser().parse( deformers );

			this.parseScene( deformers, geometryMap, materials );

			return sceneGraph;

		}

		// Parses FBXTree.Connections which holds parent-child connections between objects (e.g. material -> texture, model->geometry )
		// and details the connection type
		parseConnections() {

			const connectionMap = new Map();

			if ( 'Connections' in fbxTree ) {

				const rawConnections = fbxTree.Connections.connections;

				rawConnections.forEach( function ( rawConnection ) {

					const fromID = rawConnection[ 0 ];
					const toID = rawConnection[ 1 ];
					const relationship = rawConnection[ 2 ];

					if ( ! connectionMap.has( fromID ) ) {

						connectionMap.set( fromID, {
							parents: [],
							children: []
						} );

					}

					const parentRelationship = { ID: toID, relationship: relationship };
					connectionMap.get( fromID ).parents.push( parentRelationship );

					if ( ! connectionMap.has( toID ) ) {

						connectionMap.set( toID, {
							parents: [],
							children: []
						} );

					}

					const childRelationship = { ID: fromID, relationship: relationship };
					connectionMap.get( toID ).children.push( childRelationship );

				} );

			}

			return connectionMap;

		}

		// Parse FBXTree.Objects.Video for embedded image data
		// These images are connected to textures in FBXTree.Objects.Textures
		// via FBXTree.Connections.
		parseImages() {

			const images = {};
			const blobs = {};

			if ( 'Video' in fbxTree.Objects ) {

				const videoNodes = fbxTree.Objects.Video;

				for ( const nodeID in videoNodes ) {

					const videoNode = videoNodes[ nodeID ];

					const id = parseInt( nodeID );

					images[ id ] = videoNode.RelativeFilename || videoNode.Filename;

					// raw image data is in videoNode.Content
					if ( 'Content' in videoNode ) {

						const arrayBufferContent = ( videoNode.Content instanceof ArrayBuffer ) && ( videoNode.Content.byteLength > 0 );
						const base64Content = ( typeof videoNode.Content === 'string' ) && ( videoNode.Content !== '' );

						if ( arrayBufferContent || base64Content ) {

							const image = this.parseImage( videoNodes[ nodeID ] );

							blobs[ videoNode.RelativeFilename || videoNode.Filename ] = image;

						}

					}

				}

			}

			for ( const id in images ) {

				const filename = images[ id ];

				if ( blobs[ filename ] !== undefined ) images[ id ] = blobs[ filename ];
				else images[ id ] = images[ id ].split( '\\' ).pop();

			}

			return images;

		}

		// Parse embedded image data in FBXTree.Video.Content
		parseImage( videoNode ) {

			const content = videoNode.Content;
			const fileName = videoNode.RelativeFilename || videoNode.Filename;
			const extension = fileName.slice( fileName.lastIndexOf( '.' ) + 1 ).toLowerCase();

			let type;

			switch ( extension ) {

				case 'bmp':

					type = 'image/bmp';
					break;

				case 'jpg':
				case 'jpeg':

					type = 'image/jpeg';
					break;

				case 'png':

					type = 'image/png';
					break;

				case 'tif':

					type = 'image/tiff';
					break;

				case 'tga':

					if ( this.manager.getHandler( '.tga' ) === null ) {

						console.warn( 'FBXLoader: TGA loader not found, skipping ', fileName );

					}

					type = 'image/tga';
					break;

				case 'webp':

					type = 'image/webp';
					break;

				default:

					console.warn( 'FBXLoader: Image type "' + extension + '" is not supported.' );
					return;

			}

			if ( typeof content === 'string' ) { // ASCII format

				return 'data:' + type + ';base64,' + content;

			} else { // Binary Format

				const array = new Uint8Array( content );
				return window.URL.createObjectURL( new Blob( [ array ], { type: type } ) );

			}

		}

		// Parse nodes in FBXTree.Objects.Texture
		// These contain details such as UV scaling, cropping, rotation etc and are connected
		// to images in FBXTree.Objects.Video
		parseTextures( images ) {

			const textureMap = new Map();

			if ( 'Texture' in fbxTree.Objects ) {

				const textureNodes = fbxTree.Objects.Texture;
				for ( const nodeID in textureNodes ) {

					const texture = this.parseTexture( textureNodes[ nodeID ], images );
					textureMap.set( parseInt( nodeID ), texture );

				}

			}

			return textureMap;

		}

		// Parse individual node in FBXTree.Objects.Texture
		parseTexture( textureNode, images ) {

			const texture = this.loadTexture( textureNode, images );

			texture.ID = textureNode.id;

			texture.name = textureNode.attrName;

			const wrapModeU = textureNode.WrapModeU;
			const wrapModeV = textureNode.WrapModeV;

			const valueU = wrapModeU !== undefined ? wrapModeU.value : 0;
			const valueV = wrapModeV !== undefined ? wrapModeV.value : 0;

			// http://download.autodesk.com/us/fbx/SDKdocs/FBX_SDK_Help/files/fbxsdkref/class_k_fbx_texture.html#889640e63e2e681259ea81061b85143a
			// 0: repeat(default), 1: clamp

			texture.wrapS = valueU === 0 ? three.RepeatWrapping : three.ClampToEdgeWrapping;
			texture.wrapT = valueV === 0 ? three.RepeatWrapping : three.ClampToEdgeWrapping;

			if ( 'Scaling' in textureNode ) {

				const values = textureNode.Scaling.value;

				texture.repeat.x = values[ 0 ];
				texture.repeat.y = values[ 1 ];

			}

			if ( 'Translation' in textureNode ) {

				const values = textureNode.Translation.value;

				texture.offset.x = values[ 0 ];
				texture.offset.y = values[ 1 ];

			}

			return texture;

		}

		// load a texture specified as a blob or data URI, or via an external URL using TextureLoader
		loadTexture( textureNode, images ) {

			const extension = textureNode.FileName.split( '.' ).pop().toLowerCase();

			let loader = this.manager.getHandler( `.${extension}` );
			if ( loader === null ) loader = this.textureLoader;

			const loaderPath = loader.path;

			if ( ! loaderPath ) {

				loader.setPath( this.textureLoader.path );

			}

			const children = connections.get( textureNode.id ).children;

			let fileName;

			if ( children !== undefined && children.length > 0 && images[ children[ 0 ].ID ] !== undefined ) {

				fileName = images[ children[ 0 ].ID ];

				if ( fileName.indexOf( 'blob:' ) === 0 || fileName.indexOf( 'data:' ) === 0 ) {

					loader.setPath( undefined );

				}

			}

			if ( fileName === undefined ) {

				console.warn( 'FBXLoader: Undefined filename, creating placeholder texture.' );
				return new three.Texture();

			}

			const texture = loader.load( fileName );

			// revert to initial path
			loader.setPath( loaderPath );

			return texture;

		}

		// Parse nodes in FBXTree.Objects.Material
		parseMaterials( textureMap ) {

			const materialMap = new Map();

			if ( 'Material' in fbxTree.Objects ) {

				const materialNodes = fbxTree.Objects.Material;

				for ( const nodeID in materialNodes ) {

					const material = this.parseMaterial( materialNodes[ nodeID ], textureMap );

					if ( material !== null ) materialMap.set( parseInt( nodeID ), material );

				}

			}

			return materialMap;

		}

		// Parse single node in FBXTree.Objects.Material
		// Materials are connected to texture maps in FBXTree.Objects.Textures
		// FBX format currently only supports Lambert and Phong shading models
		parseMaterial( materialNode, textureMap ) {

			const ID = materialNode.id;
			const name = materialNode.attrName;
			let type = materialNode.ShadingModel;

			// Case where FBX wraps shading model in property object.
			if ( typeof type === 'object' ) {

				type = type.value;

			}

			// Ignore unused materials which don't have any connections.
			if ( ! connections.has( ID ) ) return null;

			const parameters = this.parseParameters( materialNode, textureMap, ID );

			let material;

			switch ( type.toLowerCase() ) {

				case 'phong':
					material = new three.MeshPhongMaterial();
					break;
				case 'lambert':
					material = new three.MeshLambertMaterial();
					break;
				default:
					console.warn( 'THREE.FBXLoader: unknown material type "%s". Defaulting to MeshPhongMaterial.', type );
					material = new three.MeshPhongMaterial();
					break;

			}

			material.setValues( parameters );
			material.name = name;

			return material;

		}

		// Parse FBX material and return parameters suitable for a three.js material
		// Also parse the texture map and return any textures associated with the material
		parseParameters( materialNode, textureMap, ID ) {

			const parameters = {};

			if ( materialNode.BumpFactor ) {

				parameters.bumpScale = materialNode.BumpFactor.value;

			}

			if ( materialNode.Diffuse ) {

				parameters.color = three.ColorManagement.colorSpaceToWorking( new three.Color().fromArray( materialNode.Diffuse.value ), three.SRGBColorSpace );

			} else if ( materialNode.DiffuseColor && ( materialNode.DiffuseColor.type === 'Color' || materialNode.DiffuseColor.type === 'ColorRGB' ) ) {

				// The blender exporter exports diffuse here instead of in materialNode.Diffuse
				parameters.color = three.ColorManagement.colorSpaceToWorking( new three.Color().fromArray( materialNode.DiffuseColor.value ), three.SRGBColorSpace );

			}

			if ( materialNode.DisplacementFactor ) {

				parameters.displacementScale = materialNode.DisplacementFactor.value;

			}

			if ( materialNode.Emissive ) {

				parameters.emissive = three.ColorManagement.colorSpaceToWorking( new three.Color().fromArray( materialNode.Emissive.value ), three.SRGBColorSpace );

			} else if ( materialNode.EmissiveColor && ( materialNode.EmissiveColor.type === 'Color' || materialNode.EmissiveColor.type === 'ColorRGB' ) ) {

				// The blender exporter exports emissive color here instead of in materialNode.Emissive
				parameters.emissive = three.ColorManagement.colorSpaceToWorking( new three.Color().fromArray( materialNode.EmissiveColor.value ), three.SRGBColorSpace );

			}

			if ( materialNode.EmissiveFactor ) {

				parameters.emissiveIntensity = parseFloat( materialNode.EmissiveFactor.value );

			}

			// the transparency handling is implemented based on Blender's approach:
			// https://github.com/blender/blender/blob/main/scripts/addons_core/io_scene_fbx/import_fbx.py

			parameters.opacity = 1 - ( materialNode.TransparencyFactor ? parseFloat( materialNode.TransparencyFactor.value ) : 0 );

			if ( parameters.opacity === 1 || parameters.opacity === 0 ) {

				parameters.opacity = ( materialNode.Opacity ? parseFloat( materialNode.Opacity.value ) : null );

				if ( parameters.opacity === null ) {

					// Default to opaque. Some exporters (e.g. 3ds Max) define TransparentColor
					// as white (1,1,1) without intending transparency, which makes the Unity-style
					// fallback of `1 - TransparentColor.r` produce incorrect zero opacity.
					parameters.opacity = 1;

				}

			}

			if ( parameters.opacity < 1.0 ) {

				parameters.transparent = true;

			}

			if ( materialNode.ReflectionFactor ) {

				parameters.reflectivity = materialNode.ReflectionFactor.value;

			}

			if ( materialNode.Shininess ) {

				parameters.shininess = materialNode.Shininess.value;

			}

			if ( materialNode.Specular ) {

				parameters.specular = three.ColorManagement.colorSpaceToWorking( new three.Color().fromArray( materialNode.Specular.value ), three.SRGBColorSpace );

			} else if ( materialNode.SpecularColor && materialNode.SpecularColor.type === 'Color' ) {

				// The blender exporter exports specular color here instead of in materialNode.Specular
				parameters.specular = three.ColorManagement.colorSpaceToWorking( new three.Color().fromArray( materialNode.SpecularColor.value ), three.SRGBColorSpace );

			}

			const scope = this;
			connections.get( ID ).children.forEach( function ( child ) {

				const type = child.relationship;

				switch ( type ) {

					case 'Bump':
						parameters.bumpMap = scope.getTexture( textureMap, child.ID );
						break;

					case 'Maya|TEX_ao_map':
						parameters.aoMap = scope.getTexture( textureMap, child.ID );
						break;

					case 'DiffuseColor':
					case 'Maya|TEX_color_map':
						parameters.map = scope.getTexture( textureMap, child.ID );
						if ( parameters.map !== undefined ) {

							parameters.map.colorSpace = three.SRGBColorSpace;

						}

						break;

					case 'DisplacementColor':
						parameters.displacementMap = scope.getTexture( textureMap, child.ID );
						break;

					case 'EmissiveColor':
						parameters.emissiveMap = scope.getTexture( textureMap, child.ID );
						if ( parameters.emissiveMap !== undefined ) {

							parameters.emissiveMap.colorSpace = three.SRGBColorSpace;

						}

						break;

					case 'NormalMap':
					case 'Maya|TEX_normal_map':
						parameters.normalMap = scope.getTexture( textureMap, child.ID );
						break;

					case 'ReflectionColor':
						parameters.envMap = scope.getTexture( textureMap, child.ID );
						if ( parameters.envMap !== undefined ) {

							parameters.envMap.mapping = three.EquirectangularReflectionMapping;
							parameters.envMap.colorSpace = three.SRGBColorSpace;

						}

						break;

					case 'SpecularColor':
						parameters.specularMap = scope.getTexture( textureMap, child.ID );
						if ( parameters.specularMap !== undefined ) {

							parameters.specularMap.colorSpace = three.SRGBColorSpace;

						}

						break;

					case 'TransparentColor':
					case 'TransparencyFactor':
						parameters.alphaMap = scope.getTexture( textureMap, child.ID );
						parameters.transparent = true;
						break;

					case 'AmbientColor':
					case 'ShininessExponent': // AKA glossiness map
					case 'SpecularFactor': // AKA specularLevel
					case 'VectorDisplacementColor': // NOTE: Seems to be a copy of DisplacementColor
					default:
						console.warn( 'THREE.FBXLoader: %s map is not supported in three.js, skipping texture.', type );
						break;

				}

			} );

			return parameters;

		}

		// get a texture from the textureMap for use by a material.
		getTexture( textureMap, id ) {

			// if the texture is a layered texture, just use the first layer and issue a warning
			if ( 'LayeredTexture' in fbxTree.Objects && id in fbxTree.Objects.LayeredTexture ) {

				console.warn( 'THREE.FBXLoader: layered textures are not supported in three.js. Discarding all but first layer.' );
				id = connections.get( id ).children[ 0 ].ID;

			}

			return textureMap.get( id );

		}

		// Parse nodes in FBXTree.Objects.Deformer
		// Deformer node can contain skinning or Vertex Cache animation data, however only skinning is supported here
		// Generates map of Skeleton-like objects for use later when generating and binding skeletons.
		parseDeformers() {

			const skeletons = {};
			const morphTargets = {};

			if ( 'Deformer' in fbxTree.Objects ) {

				const DeformerNodes = fbxTree.Objects.Deformer;

				for ( const nodeID in DeformerNodes ) {

					const deformerNode = DeformerNodes[ nodeID ];

					const relationships = connections.get( parseInt( nodeID ) );

					if ( deformerNode.attrType === 'Skin' ) {

						const skeleton = this.parseSkeleton( relationships, DeformerNodes );
						skeleton.ID = nodeID;

						if ( relationships.parents.length > 1 ) console.warn( 'THREE.FBXLoader: skeleton attached to more than one geometry is not supported.' );
						skeleton.geometryID = relationships.parents[ 0 ].ID;

						skeletons[ nodeID ] = skeleton;

					} else if ( deformerNode.attrType === 'BlendShape' ) {

						const morphTarget = {
							id: nodeID,
						};

						morphTarget.rawTargets = this.parseMorphTargets( relationships, DeformerNodes );
						morphTarget.id = nodeID;

						if ( relationships.parents.length > 1 ) console.warn( 'THREE.FBXLoader: morph target attached to more than one geometry is not supported.' );

						morphTargets[ nodeID ] = morphTarget;

					}

				}

			}

			return {

				skeletons: skeletons,
				morphTargets: morphTargets,

			};

		}

		// Parse single nodes in FBXTree.Objects.Deformer
		// The top level skeleton node has type 'Skin' and sub nodes have type 'Cluster'
		// Each skin node represents a skeleton and each cluster node represents a bone
		parseSkeleton( relationships, deformerNodes ) {

			const rawBones = [];

			relationships.children.forEach( function ( child ) {

				const boneNode = deformerNodes[ child.ID ];

				if ( boneNode.attrType !== 'Cluster' ) return;

				const rawBone = {

					ID: child.ID,
					indices: [],
					weights: [],
					transformLink: new three.Matrix4().fromArray( boneNode.TransformLink.a ),

				};

				if ( 'Indexes' in boneNode ) {

					rawBone.indices = boneNode.Indexes.a;
					rawBone.weights = boneNode.Weights.a;

				}

				rawBones.push( rawBone );

			} );

			return {

				rawBones: rawBones,
				bones: []

			};

		}

		// The top level morph deformer node has type "BlendShape" and sub nodes have type "BlendShapeChannel"
		parseMorphTargets( relationships, deformerNodes ) {

			const rawMorphTargets = [];

			for ( let i = 0; i < relationships.children.length; i ++ ) {

				const child = relationships.children[ i ];

				const morphTargetNode = deformerNodes[ child.ID ];

				const rawMorphTarget = {

					name: morphTargetNode.attrName,
					initialWeight: morphTargetNode.DeformPercent,
					id: morphTargetNode.id,
					fullWeights: morphTargetNode.FullWeights.a

				};

				if ( morphTargetNode.attrType !== 'BlendShapeChannel' ) return;

				rawMorphTarget.geoID = connections.get( parseInt( child.ID ) ).children.filter( function ( child ) {

					return child.relationship === undefined;

				} )[ 0 ].ID;

				rawMorphTargets.push( rawMorphTarget );

			}

			return rawMorphTargets;

		}

		// create the main Group() to be returned by the loader
		parseScene( deformers, geometryMap, materialMap ) {

			sceneGraph = new three.Group();

			const modelMap = this.parseModels( deformers.skeletons, geometryMap, materialMap );

			const modelNodes = fbxTree.Objects.Model;

			const scope = this;
			modelMap.forEach( function ( model ) {

				const modelNode = modelNodes[ model.ID ];
				scope.setLookAtProperties( model, modelNode );

				const parentConnections = connections.get( model.ID ).parents;

				parentConnections.forEach( function ( connection ) {

					const parent = modelMap.get( connection.ID );
					if ( parent !== undefined ) parent.add( model );

				} );

				if ( model.parent === null ) {

					sceneGraph.add( model );

				}


			} );

			this.addGlobalSceneSettings();

			sceneGraph.traverse( function ( node ) {

				if ( node.userData.transformData ) {

					if ( node.parent ) {

						node.userData.transformData.parentMatrix = node.parent.matrix;
						node.userData.transformData.parentMatrixWorld = node.parent.matrixWorld;

					}

					const transform = generateTransform( node.userData.transformData );

					node.applyMatrix4( transform );
					node.updateWorldMatrix();

				}

			} );

			// Like Blender's FBX importer, use the BindPose section to set the
			// rest pose for bones that are not part of a skin cluster. The BindPose
			// provides a more authoritative rest pose than the Lcl properties which
			// may represent an animation frame rather than the true rest state.
			// Bones WITH clusters will get their bind pose from TransformLink
			// (set via bindSkeleton below), which takes priority.
			const bindPoseMatrices = this.parsePoseNodes();
			const clusterBoneIDs = new Set();

			for ( const ID in deformers.skeletons ) {

				deformers.skeletons[ ID ].rawBones.forEach( function ( _, i ) {

					const bone = deformers.skeletons[ ID ].bones[ i ];
					if ( bone ) clusterBoneIDs.add( bone.ID );

				} );

			}

			const tempMatrix = new three.Matrix4();

			sceneGraph.traverse( function ( node ) {

				if ( node.isBone && node.ID !== undefined && ! clusterBoneIDs.has( node.ID ) ) {

					const bindPose = bindPoseMatrices[ node.ID ];

					if ( bindPose !== undefined ) {

						if ( node.parent ) {

							tempMatrix.copy( node.parent.matrixWorld ).invert();
							tempMatrix.multiply( bindPose );

						} else {

							tempMatrix.copy( bindPose );

						}

						tempMatrix.decompose( node.position, node.quaternion, node.scale );
						node.updateMatrix();
						node.matrixWorld.copy( bindPose );

					}

				}

			} );

			// Bind skeletons after transforms are applied so that bind matrices
			// are computed from the final scene state. This ensures the rest pose
			// is correct even when the FBX file's Cluster TransformLink matrices
			// differ from the reconstructed bone transforms (common in files
			// without a BindPose section).
			this.bindSkeleton( deformers.skeletons, geometryMap, modelMap );

			const animations = new AnimationParser().parse();

			// if all the models where already combined in a single group, just return that
			if ( sceneGraph.children.length === 1 && sceneGraph.children[ 0 ].isGroup ) {

				sceneGraph.children[ 0 ].animations = animations;
				sceneGraph = sceneGraph.children[ 0 ];

			}

			sceneGraph.animations = animations;

			// Apply coordinate system correction. FBX files can use different
			// up-axis conventions (Y-up or Z-up). Three.js uses Y-up, so rotate
			// the scene when the file uses Z-up (UpAxis === 2).

			if ( 'GlobalSettings' in fbxTree && 'UpAxis' in fbxTree.GlobalSettings ) {

				const upAxis = fbxTree.GlobalSettings.UpAxis.value;

				if ( upAxis === 2 ) {

					console.warn( 'THREE.FBXLoader: You are loading an asset with a Z-UP coordinate system. The loader just rotates the asset to transform it into Y-UP. The vertex data are not converted.' );

					sceneGraph.rotation.set( - Math.PI / 2, 0, 0 );

				}

			}

		}

		// parse nodes in FBXTree.Objects.Model
		parseModels( skeletons, geometryMap, materialMap ) {

			const modelMap = new Map();
			const modelNodes = fbxTree.Objects.Model;

			for ( const nodeID in modelNodes ) {

				const id = parseInt( nodeID );
				const node = modelNodes[ nodeID ];
				const relationships = connections.get( id );

				let model = this.buildSkeleton( relationships, skeletons, id, node.attrName );

				if ( ! model ) {

					switch ( node.attrType ) {

						case 'Camera':
							model = this.createCamera( relationships );
							break;
						case 'Light':
							model = this.createLight( relationships );
							break;
						case 'Mesh':
							model = this.createMesh( relationships, geometryMap, materialMap );
							break;
						case 'NurbsCurve':
							model = this.createCurve( relationships, geometryMap );
							break;
						case 'LimbNode':
						case 'Root':
							model = new three.Bone();
							break;
						case 'Null':
						default:
							model = new three.Group();
							break;

					}

					model.name = node.attrName ? three.PropertyBinding.sanitizeNodeName( node.attrName ) : '';
					model.userData.originalName = node.attrName;

					model.ID = id;

				}

				this.getTransformData( model, node );
				modelMap.set( id, model );

			}

			return modelMap;

		}

		buildSkeleton( relationships, skeletons, id, name ) {

			let bone = null;

			relationships.parents.forEach( function ( parent ) {

				for ( const ID in skeletons ) {

					const skeleton = skeletons[ ID ];

					skeleton.rawBones.forEach( function ( rawBone, i ) {

						if ( rawBone.ID === parent.ID ) {

							const subBone = bone;
							bone = new three.Bone();

							bone.matrixWorld.copy( rawBone.transformLink );

							// set name and id here - otherwise in cases where "subBone" is created it will not have a name / id

							bone.name = name ? three.PropertyBinding.sanitizeNodeName( name ) : '';
							bone.userData.originalName = name;
							bone.ID = id;

							skeleton.bones[ i ] = bone;

							// In cases where a bone is shared between multiple meshes
							// duplicate the bone here and add it as a child of the first bone
							if ( subBone !== null ) {

								bone.add( subBone );

							}

						}

					} );

				}

			} );

			return bone;

		}

		// create a PerspectiveCamera or OrthographicCamera
		createCamera( relationships ) {

			let model;
			let cameraAttribute;

			relationships.children.forEach( function ( child ) {

				const attr = fbxTree.Objects.NodeAttribute[ child.ID ];

				if ( attr !== undefined ) {

					cameraAttribute = attr;

				}

			} );

			if ( cameraAttribute === undefined ) {

				model = new three.Object3D();

			} else {

				let type = 0;
				if ( cameraAttribute.CameraProjectionType !== undefined && cameraAttribute.CameraProjectionType.value === 1 ) {

					type = 1;

				}

				let nearClippingPlane = 1;
				if ( cameraAttribute.NearPlane !== undefined ) {

					nearClippingPlane = cameraAttribute.NearPlane.value / 1000;

				}

				let farClippingPlane = 1000;
				if ( cameraAttribute.FarPlane !== undefined ) {

					farClippingPlane = cameraAttribute.FarPlane.value / 1000;

				}


				let width = window.innerWidth;
				let height = window.innerHeight;

				if ( cameraAttribute.AspectWidth !== undefined && cameraAttribute.AspectHeight !== undefined ) {

					width = cameraAttribute.AspectWidth.value;
					height = cameraAttribute.AspectHeight.value;

				}

				const aspect = width / height;

				let fov = 45;
				if ( cameraAttribute.FieldOfView !== undefined ) {

					fov = cameraAttribute.FieldOfView.value;

				}

				const focalLength = cameraAttribute.FocalLength ? cameraAttribute.FocalLength.value : null;

				switch ( type ) {

					case 0: // Perspective
						model = new three.PerspectiveCamera( fov, aspect, nearClippingPlane, farClippingPlane );
						if ( focalLength !== null ) model.setFocalLength( focalLength );
						break;

					case 1: // Orthographic
						console.warn( 'THREE.FBXLoader: Orthographic cameras not supported yet.' );
						model = new three.Object3D();
						break;

					default:
						console.warn( 'THREE.FBXLoader: Unknown camera type ' + type + '.' );
						model = new three.Object3D();
						break;

				}

			}

			return model;

		}

		// Create a DirectionalLight, PointLight or SpotLight
		createLight( relationships ) {

			let model;
			let lightAttribute;

			relationships.children.forEach( function ( child ) {

				const attr = fbxTree.Objects.NodeAttribute[ child.ID ];

				if ( attr !== undefined ) {

					lightAttribute = attr;

				}

			} );

			if ( lightAttribute === undefined ) {

				model = new three.Object3D();

			} else {

				let type;

				// LightType can be undefined for Point lights
				if ( lightAttribute.LightType === undefined ) {

					type = 0;

				} else {

					type = lightAttribute.LightType.value;

				}

				let color = 0xffffff;

				if ( lightAttribute.Color !== undefined ) {

					color = three.ColorManagement.colorSpaceToWorking( new three.Color().fromArray( lightAttribute.Color.value ), three.SRGBColorSpace );

				}

				let intensity = ( lightAttribute.Intensity === undefined ) ? 1 : lightAttribute.Intensity.value / 100;

				// light disabled
				if ( lightAttribute.CastLightOnObject !== undefined && lightAttribute.CastLightOnObject.value === 0 ) {

					intensity = 0;

				}

				let distance = 0;
				if ( lightAttribute.FarAttenuationEnd !== undefined ) {

					if ( lightAttribute.EnableFarAttenuation !== undefined && lightAttribute.EnableFarAttenuation.value === 0 ) {

						distance = 0;

					} else {

						distance = lightAttribute.FarAttenuationEnd.value;

					}

				}

				// TODO: could this be calculated linearly from FarAttenuationStart to FarAttenuationEnd?
				const decay = 1;

				switch ( type ) {

					case 0: // Point
						model = new three.PointLight( color, intensity, distance, decay );
						break;

					case 1: // Directional
						model = new three.DirectionalLight( color, intensity );
						break;

					case 2: // Spot
						let angle = Math.PI / 3;
						let penumbra = 0;

						if ( lightAttribute.OuterAngle !== undefined ) {

							angle = three.MathUtils.degToRad( lightAttribute.OuterAngle.value );

							if ( lightAttribute.InnerAngle !== undefined ) {

								penumbra = 1 - ( lightAttribute.InnerAngle.value / lightAttribute.OuterAngle.value );
								penumbra = Math.max( 0, penumbra ); // penumbra must be in the range [0,1]

							}

						} else if ( lightAttribute.InnerAngle !== undefined ) {

							// fallback if only InnerAngle is defined

							angle = three.MathUtils.degToRad( lightAttribute.InnerAngle.value );

						}

						model = new three.SpotLight( color, intensity, distance, angle, penumbra, decay );
						break;

					default:
						console.warn( 'THREE.FBXLoader: Unknown light type ' + lightAttribute.LightType.value + ', defaulting to a PointLight.' );
						model = new three.PointLight( color, intensity );
						break;

				}

				if ( lightAttribute.CastShadows !== undefined && lightAttribute.CastShadows.value === 1 ) {

					model.castShadow = true;

				}

			}

			return model;

		}

		createMesh( relationships, geometryMap, materialMap ) {

			let model;
			let geometry = null;
			let material = null;
			const materials = [];

			// get geometry and materials(s) from connections
			relationships.children.forEach( function ( child ) {

				if ( geometryMap.has( child.ID ) ) {

					geometry = geometryMap.get( child.ID );

				}

				if ( materialMap.has( child.ID ) ) {

					materials.push( materialMap.get( child.ID ) );

				}

			} );

			if ( materials.length > 1 ) {

				material = materials;

			} else if ( materials.length > 0 ) {

				material = materials[ 0 ];

			} else {

				material = new three.MeshPhongMaterial( {
					name: three.Loader.DEFAULT_MATERIAL_NAME,
					color: 0xcccccc
				} );
				materials.push( material );

			}

			if ( 'color' in geometry.attributes ) {

				materials.forEach( function ( material ) {

					material.vertexColors = true;

				} );

			}

			// Sanitization: If geometry has groups, then it must match the provided material array.
			// If not, we need to clean up the `group.materialIndex` properties inside the groups and point at a (new) default material.
			// This isn't well defined; Unity creates default material, while Blender implicitly uses the previous material in the list.
			if ( geometry.groups.length > 0 ) {

				let needsDefaultMaterial = false;

				for ( let i = 0, il = geometry.groups.length; i < il; i ++ ) {

					const group = geometry.groups[ i ];

					if ( group.materialIndex < 0 || group.materialIndex >= materials.length ) {

						group.materialIndex = materials.length;
						needsDefaultMaterial = true;

					}

				}

				if ( needsDefaultMaterial ) {

					const defaultMaterial = new three.MeshPhongMaterial();
					materials.push( defaultMaterial );

				}

			}

			if ( geometry.FBX_Deformer ) {

				model = new three.SkinnedMesh( geometry, material );
				model.normalizeSkinWeights();

			} else {

				model = new three.Mesh( geometry, material );

			}

			return model;

		}

		createCurve( relationships, geometryMap ) {

			const geometry = relationships.children.reduce( function ( geo, child ) {

				if ( geometryMap.has( child.ID ) ) geo = geometryMap.get( child.ID );

				return geo;

			}, null );

			// FBX does not list materials for Nurbs lines, so we'll just put our own in here.
			const material = new three.LineBasicMaterial( {
				name: three.Loader.DEFAULT_MATERIAL_NAME,
				color: 0x3300ff,
				linewidth: 1
			} );
			return new three.Line( geometry, material );

		}

		// parse the model node for transform data
		getTransformData( model, modelNode ) {

			const transformData = {};

			if ( 'InheritType' in modelNode ) transformData.inheritType = parseInt( modelNode.InheritType.value );

			if ( 'RotationOrder' in modelNode ) transformData.eulerOrder = getEulerOrder( modelNode.RotationOrder.value );
			else transformData.eulerOrder = getEulerOrder( 0 );

			if ( 'Lcl_Translation' in modelNode ) transformData.translation = modelNode.Lcl_Translation.value;

			if ( 'PreRotation' in modelNode ) transformData.preRotation = modelNode.PreRotation.value;
			if ( 'Lcl_Rotation' in modelNode ) transformData.rotation = modelNode.Lcl_Rotation.value;
			if ( 'PostRotation' in modelNode ) transformData.postRotation = modelNode.PostRotation.value;

			if ( 'Lcl_Scaling' in modelNode ) transformData.scale = modelNode.Lcl_Scaling.value;

			if ( 'ScalingOffset' in modelNode ) transformData.scalingOffset = modelNode.ScalingOffset.value;
			if ( 'ScalingPivot' in modelNode ) transformData.scalingPivot = modelNode.ScalingPivot.value;

			if ( 'RotationOffset' in modelNode ) transformData.rotationOffset = modelNode.RotationOffset.value;
			if ( 'RotationPivot' in modelNode ) transformData.rotationPivot = modelNode.RotationPivot.value;

			model.userData.transformData = transformData;

		}

		setLookAtProperties( model, modelNode ) {

			if ( 'LookAtProperty' in modelNode ) {

				const children = connections.get( model.ID ).children;

				children.forEach( function ( child ) {

					if ( child.relationship === 'LookAtProperty' ) {

						const lookAtTarget = fbxTree.Objects.Model[ child.ID ];

						if ( 'Lcl_Translation' in lookAtTarget ) {

							const pos = lookAtTarget.Lcl_Translation.value;

							// DirectionalLight, SpotLight
							if ( model.target !== undefined ) {

								model.target.position.fromArray( pos );
								sceneGraph.add( model.target );

							} else { // Cameras and other Object3Ds

								model.lookAt( new three.Vector3().fromArray( pos ) );

							}

						}

					}

				} );

			}

		}

		bindSkeleton( skeletons, geometryMap, modelMap ) {

			for ( const ID in skeletons ) {

				const skeleton = skeletons[ ID ];

				// Compute bone inverses from TransformLink rather than from the
				// bones' current matrixWorld. The TransformLink matrices represent
				// each bone's global transform at the time the skin weights were
				// painted, which may differ from the scene-reconstructed transforms.
				const boneInverses = [];

				for ( let i = 0, l = skeleton.bones.length; i < l; i ++ ) {

					const inverse = new three.Matrix4();

					if ( skeleton.bones[ i ] && skeleton.rawBones[ i ] ) {

						inverse.copy( skeleton.rawBones[ i ].transformLink ).invert();

					}

					boneInverses.push( inverse );

				}

				const parents = connections.get( parseInt( skeleton.ID ) ).parents;

				parents.forEach( function ( parent ) {

					if ( geometryMap.has( parent.ID ) ) {

						const geoID = parent.ID;
						const geoRelationships = connections.get( geoID );

						geoRelationships.parents.forEach( function ( geoConnParent ) {

							if ( modelMap.has( geoConnParent.ID ) ) {

								const model = modelMap.get( geoConnParent.ID );

								// Use the mesh's current matrixWorld as bind matrix.
								// The BindPose section is intentionally not used here
								// since it may contain scale/rotation from the model
								// hierarchy that is inconsistent with the TransformLink-
								// based bone inverses. Always provide a bind matrix to
								// prevent bind() from calling calculateInverses() which
								// would overwrite the bone inverses computed above.
								model.updateMatrixWorld( true );

								model.bind( new three.Skeleton( skeleton.bones, boneInverses ), model.matrixWorld );

							}

						} );

					}

				} );

			}

		}

		// Parse BindPose nodes and return a map of node ID to bind matrix.
		parsePoseNodes() {

			const bindMatrices = {};

			if ( 'Pose' in fbxTree.Objects ) {

				const BindPoseNode = fbxTree.Objects.Pose;

				for ( const nodeID in BindPoseNode ) {

					if ( BindPoseNode[ nodeID ].attrType === 'BindPose' && BindPoseNode[ nodeID ].NbPoseNodes > 0 ) {

						const poseNodes = BindPoseNode[ nodeID ].PoseNode;

						if ( Array.isArray( poseNodes ) ) {

							poseNodes.forEach( function ( poseNode ) {

								bindMatrices[ poseNode.Node ] = new three.Matrix4().fromArray( poseNode.Matrix.a );

							} );

						} else {

							bindMatrices[ poseNodes.Node ] = new three.Matrix4().fromArray( poseNodes.Matrix.a );

						}

					}

				}

			}

			return bindMatrices;

		}

		addGlobalSceneSettings() {

			if ( 'GlobalSettings' in fbxTree ) {

				if ( 'AmbientColor' in fbxTree.GlobalSettings ) {

					// Parse ambient color - if it's not set to black (default), create an ambient light

					const ambientColor = fbxTree.GlobalSettings.AmbientColor.value;
					const r = ambientColor[ 0 ];
					const g = ambientColor[ 1 ];
					const b = ambientColor[ 2 ];

					if ( r !== 0 || g !== 0 || b !== 0 ) {

						const color = new three.Color().setRGB( r, g, b, three.SRGBColorSpace );
						sceneGraph.add( new three.AmbientLight( color, 1 ) );

					}

				}

				if ( 'UnitScaleFactor' in fbxTree.GlobalSettings ) {

					sceneGraph.userData.unitScaleFactor = fbxTree.GlobalSettings.UnitScaleFactor.value;

				}

			}

		}

	}

	// parse Geometry data from FBXTree and return map of BufferGeometries
	class GeometryParser {

		constructor() {

			this.negativeMaterialIndices = false;

		}

		// Parse nodes in FBXTree.Objects.Geometry
		parse( deformers ) {

			const geometryMap = new Map();

			if ( 'Geometry' in fbxTree.Objects ) {

				const geoNodes = fbxTree.Objects.Geometry;

				for ( const nodeID in geoNodes ) {

					const relationships = connections.get( parseInt( nodeID ) );
					const geo = this.parseGeometry( relationships, geoNodes[ nodeID ], deformers );

					geometryMap.set( parseInt( nodeID ), geo );

				}

			}

			// report warnings

			if ( this.negativeMaterialIndices === true ) {

				console.warn( 'THREE.FBXLoader: The FBX file contains invalid (negative) material indices. The asset might not render as expected.' );

			}

			return geometryMap;

		}

		// Parse single node in FBXTree.Objects.Geometry
		parseGeometry( relationships, geoNode, deformers ) {

			switch ( geoNode.attrType ) {

				case 'Mesh':
					return this.parseMeshGeometry( relationships, geoNode, deformers );

				case 'NurbsCurve':
					return this.parseNurbsGeometry( geoNode );

			}

		}

		// Parse single node mesh geometry in FBXTree.Objects.Geometry
		parseMeshGeometry( relationships, geoNode, deformers ) {

			const skeletons = deformers.skeletons;
			const morphTargets = [];

			const modelNodes = relationships.parents.map( function ( parent ) {

				return fbxTree.Objects.Model[ parent.ID ];

			} );

			// don't create geometry if it is not associated with any models
			if ( modelNodes.length === 0 ) return;

			const skeleton = relationships.children.reduce( function ( skeleton, child ) {

				if ( skeletons[ child.ID ] !== undefined ) skeleton = skeletons[ child.ID ];

				return skeleton;

			}, null );

			relationships.children.forEach( function ( child ) {

				if ( deformers.morphTargets[ child.ID ] !== undefined ) {

					morphTargets.push( deformers.morphTargets[ child.ID ] );

				}

			} );

			// Assume one model and get the preRotation from that
			// if there is more than one model associated with the geometry this may cause problems
			const modelNode = modelNodes[ 0 ];

			const transformData = {};

			if ( 'RotationOrder' in modelNode ) transformData.eulerOrder = getEulerOrder( modelNode.RotationOrder.value );
			if ( 'InheritType' in modelNode ) transformData.inheritType = parseInt( modelNode.InheritType.value );

			if ( 'GeometricTranslation' in modelNode ) transformData.translation = modelNode.GeometricTranslation.value;
			if ( 'GeometricRotation' in modelNode ) transformData.rotation = modelNode.GeometricRotation.value;
			if ( 'GeometricScaling' in modelNode ) transformData.scale = modelNode.GeometricScaling.value;

			const transform = generateTransform( transformData );

			return this.genGeometry( geoNode, skeleton, morphTargets, transform );

		}

		// Generate a BufferGeometry from a node in FBXTree.Objects.Geometry
		genGeometry( geoNode, skeleton, morphTargets, preTransform ) {

			const geo = new three.BufferGeometry();
			if ( geoNode.attrName ) geo.name = geoNode.attrName;

			const geoInfo = this.parseGeoNode( geoNode, skeleton );
			const buffers = this.genBuffers( geoInfo );

			const positionAttribute = new three.Float32BufferAttribute( buffers.vertex, 3 );

			positionAttribute.applyMatrix4( preTransform );

			geo.setAttribute( 'position', positionAttribute );

			if ( buffers.colors.length > 0 ) {

				geo.setAttribute( 'color', new three.Float32BufferAttribute( buffers.colors, 3 ) );

			}

			if ( skeleton ) {

				geo.setAttribute( 'skinIndex', new three.Uint16BufferAttribute( buffers.weightsIndices, 4 ) );

				geo.setAttribute( 'skinWeight', new three.Float32BufferAttribute( buffers.vertexWeights, 4 ) );

				// used later to bind the skeleton to the model
				geo.FBX_Deformer = skeleton;

			}

			if ( buffers.normal.length > 0 ) {

				const normalMatrix = new three.Matrix3().getNormalMatrix( preTransform );

				const normalAttribute = new three.Float32BufferAttribute( buffers.normal, 3 );
				normalAttribute.applyNormalMatrix( normalMatrix );

				geo.setAttribute( 'normal', normalAttribute );

			}

			buffers.uvs.forEach( function ( uvBuffer, i ) {

				const name = i === 0 ? 'uv' : `uv${ i }`;

				geo.setAttribute( name, new three.Float32BufferAttribute( buffers.uvs[ i ], 2 ) );

			} );

			if ( geoInfo.material && geoInfo.material.mappingType !== 'AllSame' ) {

				// Convert the material indices of each vertex into rendering groups on the geometry.
				let prevMaterialIndex = buffers.materialIndex[ 0 ];
				let startIndex = 0;

				buffers.materialIndex.forEach( function ( currentIndex, i ) {

					if ( currentIndex !== prevMaterialIndex ) {

						geo.addGroup( startIndex, i - startIndex, prevMaterialIndex );

						prevMaterialIndex = currentIndex;
						startIndex = i;

					}

				} );

				// the loop above doesn't add the last group, do that here.
				if ( geo.groups.length > 0 ) {

					const lastGroup = geo.groups[ geo.groups.length - 1 ];
					const lastIndex = lastGroup.start + lastGroup.count;

					if ( lastIndex !== buffers.materialIndex.length ) {

						geo.addGroup( lastIndex, buffers.materialIndex.length - lastIndex, prevMaterialIndex );

					}

				}

				// case where there are multiple materials but the whole geometry is only
				// using one of them
				if ( geo.groups.length === 0 ) {

					geo.addGroup( 0, buffers.materialIndex.length, buffers.materialIndex[ 0 ] );

				}

			}

			this.addMorphTargets( geo, geoNode, morphTargets, preTransform );

			return geo;

		}

		parseGeoNode( geoNode, skeleton ) {

			const geoInfo = {};

			geoInfo.vertexPositions = ( geoNode.Vertices !== undefined ) ? geoNode.Vertices.a : [];
			geoInfo.vertexIndices = ( geoNode.PolygonVertexIndex !== undefined ) ? geoNode.PolygonVertexIndex.a : [];

			if ( geoNode.LayerElementColor && geoNode.LayerElementColor[ 0 ].Colors ) {

				geoInfo.color = this.parseVertexColors( geoNode.LayerElementColor[ 0 ] );

			}

			if ( geoNode.LayerElementMaterial ) {

				geoInfo.material = this.parseMaterialIndices( geoNode.LayerElementMaterial[ 0 ] );

			}

			if ( geoNode.LayerElementNormal ) {

				geoInfo.normal = this.parseNormals( geoNode.LayerElementNormal[ 0 ] );

			}

			if ( geoNode.LayerElementUV ) {

				geoInfo.uv = [];

				let i = 0;
				while ( geoNode.LayerElementUV[ i ] ) {

					if ( geoNode.LayerElementUV[ i ].UV ) {

						geoInfo.uv.push( this.parseUVs( geoNode.LayerElementUV[ i ] ) );

					}

					i ++;

				}

			}

			geoInfo.weightTable = {};

			if ( skeleton !== null ) {

				geoInfo.skeleton = skeleton;

				skeleton.rawBones.forEach( function ( rawBone, i ) {

					// loop over the bone's vertex indices and weights
					rawBone.indices.forEach( function ( index, j ) {

						if ( geoInfo.weightTable[ index ] === undefined ) geoInfo.weightTable[ index ] = [];

						geoInfo.weightTable[ index ].push( {

							id: i,
							weight: rawBone.weights[ j ],

						} );

					} );

				} );

			}

			return geoInfo;

		}

		genBuffers( geoInfo ) {

			const buffers = {
				vertex: [],
				normal: [],
				colors: [],
				uvs: [],
				materialIndex: [],
				vertexWeights: [],
				weightsIndices: [],
			};

			let polygonIndex = 0;
			let faceLength = 0;
			let displayedWeightsWarning = false;

			// these will hold data for a single face
			let facePositionIndexes = [];
			let faceNormals = [];
			let faceColors = [];
			let faceUVs = [];
			let faceWeights = [];
			let faceWeightIndices = [];

			const scope = this;
			geoInfo.vertexIndices.forEach( function ( vertexIndex, polygonVertexIndex ) {

				let materialIndex;
				let endOfFace = false;

				// Face index and vertex index arrays are combined in a single array
				// A cube with quad faces looks like this:
				// PolygonVertexIndex: *24 {
				//  a: 0, 1, 3, -3, 2, 3, 5, -5, 4, 5, 7, -7, 6, 7, 1, -1, 1, 7, 5, -4, 6, 0, 2, -5
				//  }
				// Negative numbers mark the end of a face - first face here is 0, 1, 3, -3
				// to find index of last vertex bit shift the index: ^ - 1
				if ( vertexIndex < 0 ) {

					vertexIndex = vertexIndex ^ -1; // equivalent to ( x * -1 ) - 1
					endOfFace = true;

				}

				let weightIndices = [];
				let weights = [];

				facePositionIndexes.push( vertexIndex * 3, vertexIndex * 3 + 1, vertexIndex * 3 + 2 );

				if ( geoInfo.color ) {

					const data = getData( polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.color );

					faceColors.push( data[ 0 ], data[ 1 ], data[ 2 ] );

				}

				if ( geoInfo.skeleton ) {

					if ( geoInfo.weightTable[ vertexIndex ] !== undefined ) {

						geoInfo.weightTable[ vertexIndex ].forEach( function ( wt ) {

							weights.push( wt.weight );
							weightIndices.push( wt.id );

						} );


					}

					if ( weights.length > 4 ) {

						if ( ! displayedWeightsWarning ) {

							console.warn( 'THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.' );
							displayedWeightsWarning = true;

						}

						const wIndex = [ 0, 0, 0, 0 ];
						const Weight = [ 0, 0, 0, 0 ];

						weights.forEach( function ( weight, weightIndex ) {

							let currentWeight = weight;
							let currentIndex = weightIndices[ weightIndex ];

							Weight.forEach( function ( comparedWeight, comparedWeightIndex, comparedWeightArray ) {

								if ( currentWeight > comparedWeight ) {

									comparedWeightArray[ comparedWeightIndex ] = currentWeight;
									currentWeight = comparedWeight;

									const tmp = wIndex[ comparedWeightIndex ];
									wIndex[ comparedWeightIndex ] = currentIndex;
									currentIndex = tmp;

								}

							} );

						} );

						weightIndices = wIndex;
						weights = Weight;

					}

					// if the weight array is shorter than 4 pad with 0s
					while ( weights.length < 4 ) {

						weights.push( 0 );
						weightIndices.push( 0 );

					}

					for ( let i = 0; i < 4; ++ i ) {

						faceWeights.push( weights[ i ] );
						faceWeightIndices.push( weightIndices[ i ] );

					}

				}

				if ( geoInfo.normal ) {

					const data = getData( polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.normal );

					faceNormals.push( data[ 0 ], data[ 1 ], data[ 2 ] );

				}

				if ( geoInfo.material && geoInfo.material.mappingType !== 'AllSame' ) {

					materialIndex = getData( polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.material )[ 0 ];

					if ( materialIndex < 0 ) {

						scope.negativeMaterialIndices = true;
						materialIndex = 0; // fallback

					}

				}

				if ( geoInfo.uv ) {

					geoInfo.uv.forEach( function ( uv, i ) {

						const data = getData( polygonVertexIndex, polygonIndex, vertexIndex, uv );

						if ( faceUVs[ i ] === undefined ) {

							faceUVs[ i ] = [];

						}

						faceUVs[ i ].push( data[ 0 ] );
						faceUVs[ i ].push( data[ 1 ] );

					} );

				}

				faceLength ++;

				if ( endOfFace ) {

					scope.genFace( buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength );

					polygonIndex ++;
					faceLength = 0;

					// reset arrays for the next face
					facePositionIndexes = [];
					faceNormals = [];
					faceColors = [];
					faceUVs = [];
					faceWeights = [];
					faceWeightIndices = [];

				}

			} );

			return buffers;

		}

		// See https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
		getNormalNewell( vertices ) {

			const normal = new three.Vector3( 0.0, 0.0, 0.0 );

			for ( let i = 0; i < vertices.length; i ++ ) {

				const current = vertices[ i ];
				const next = vertices[ ( i + 1 ) % vertices.length ];

				normal.x += ( current.y - next.y ) * ( current.z + next.z );
				normal.y += ( current.z - next.z ) * ( current.x + next.x );
				normal.z += ( current.x - next.x ) * ( current.y + next.y );

			}

			normal.normalize();

			return normal;

		}

		getNormalTangentAndBitangent( vertices ) {

			const normalVector = this.getNormalNewell( vertices );
			// Avoid up being equal or almost equal to normalVector
			const up = Math.abs( normalVector.z ) > 0.5 ? new three.Vector3( 0.0, 1.0, 0.0 ) : new three.Vector3( 0.0, 0.0, 1.0 );
			const tangent = up.cross( normalVector ).normalize();
			const bitangent = normalVector.clone().cross( tangent ).normalize();

			return {
				normal: normalVector,
				tangent: tangent,
				bitangent: bitangent
			};

		}

		flattenVertex( vertex, normalTangent, normalBitangent ) {

			return new three.Vector2(
				vertex.dot( normalTangent ),
				vertex.dot( normalBitangent )
			);

		}

		// Generate data for a single face in a geometry. If the face is a quad then split it into 2 tris
		genFace( buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength ) {

			let triangles;

			if ( faceLength > 3 ) {

				// Triangulate n-gon using earcut

				const vertices = [];
				// in morphing scenario vertexPositions represent morphPositions
				// while baseVertexPositions represent the original geometry's positions
				const positions = geoInfo.baseVertexPositions || geoInfo.vertexPositions;
				for ( let i = 0; i < facePositionIndexes.length; i += 3 ) {

					vertices.push(
						new three.Vector3(
							positions[ facePositionIndexes[ i ] ],
							positions[ facePositionIndexes[ i + 1 ] ],
							positions[ facePositionIndexes[ i + 2 ] ]
						)
					);

				}

				const { tangent, bitangent } = this.getNormalTangentAndBitangent( vertices );
				const triangulationInput = [];

				for ( const vertex of vertices ) {

					triangulationInput.push( this.flattenVertex( vertex, tangent, bitangent ) );

				}

				// When vertices is an array of [0,0,0] elements (which is the case for vertices not participating in morph)
				// the triangulationInput will be an array of [0,0] elements
				// resulting in an array of 0 triangles being returned from ShapeUtils.triangulateShape
				// leading to not pushing into buffers.vertex the redundant vertices (the vertices that are not morphed).
				// That's why, in order to support morphing scenario, "positions" is looking first for baseVertexPositions,
				// so that we don't end up with an array of 0 triangles for the faces not participating in morph.
				triangles = three.ShapeUtils.triangulateShape( triangulationInput, [] );

			} else {

				// Regular triangle, skip earcut triangulation step
				triangles = [[ 0, 1, 2 ]];

			}

			for ( const [ i0, i1, i2 ] of triangles ) {

				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i0 * 3 ] ] );
				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i0 * 3 + 1 ] ] );
				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i0 * 3 + 2 ] ] );

				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i1 * 3 ] ] );
				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i1 * 3 + 1 ] ] );
				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i1 * 3 + 2 ] ] );

				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i2 * 3 ] ] );
				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i2 * 3 + 1 ] ] );
				buffers.vertex.push( geoInfo.vertexPositions[ facePositionIndexes[ i2 * 3 + 2 ] ] );

				if ( geoInfo.skeleton ) {

					buffers.vertexWeights.push( faceWeights[ i0 * 4 ] );
					buffers.vertexWeights.push( faceWeights[ i0 * 4 + 1 ] );
					buffers.vertexWeights.push( faceWeights[ i0 * 4 + 2 ] );
					buffers.vertexWeights.push( faceWeights[ i0 * 4 + 3 ] );

					buffers.vertexWeights.push( faceWeights[ i1 * 4 ] );
					buffers.vertexWeights.push( faceWeights[ i1 * 4 + 1 ] );
					buffers.vertexWeights.push( faceWeights[ i1 * 4 + 2 ] );
					buffers.vertexWeights.push( faceWeights[ i1 * 4 + 3 ] );

					buffers.vertexWeights.push( faceWeights[ i2 * 4 ] );
					buffers.vertexWeights.push( faceWeights[ i2 * 4 + 1 ] );
					buffers.vertexWeights.push( faceWeights[ i2 * 4 + 2 ] );
					buffers.vertexWeights.push( faceWeights[ i2 * 4 + 3 ] );

					buffers.weightsIndices.push( faceWeightIndices[ i0 * 4 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i0 * 4 + 1 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i0 * 4 + 2 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i0 * 4 + 3 ] );

					buffers.weightsIndices.push( faceWeightIndices[ i1 * 4 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i1 * 4 + 1 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i1 * 4 + 2 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i1 * 4 + 3 ] );

					buffers.weightsIndices.push( faceWeightIndices[ i2 * 4 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i2 * 4 + 1 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i2 * 4 + 2 ] );
					buffers.weightsIndices.push( faceWeightIndices[ i2 * 4 + 3 ] );

				}

				if ( geoInfo.color ) {

					buffers.colors.push( faceColors[ i0 * 3 ] );
					buffers.colors.push( faceColors[ i0 * 3 + 1 ] );
					buffers.colors.push( faceColors[ i0 * 3 + 2 ] );

					buffers.colors.push( faceColors[ i1 * 3 ] );
					buffers.colors.push( faceColors[ i1 * 3 + 1 ] );
					buffers.colors.push( faceColors[ i1 * 3 + 2 ] );

					buffers.colors.push( faceColors[ i2 * 3 ] );
					buffers.colors.push( faceColors[ i2 * 3 + 1 ] );
					buffers.colors.push( faceColors[ i2 * 3 + 2 ] );

				}

				if ( geoInfo.material && geoInfo.material.mappingType !== 'AllSame' ) {

					buffers.materialIndex.push( materialIndex );
					buffers.materialIndex.push( materialIndex );
					buffers.materialIndex.push( materialIndex );

				}

				if ( geoInfo.normal ) {

					buffers.normal.push( faceNormals[ i0 * 3 ] );
					buffers.normal.push( faceNormals[ i0 * 3 + 1 ] );
					buffers.normal.push( faceNormals[ i0 * 3 + 2 ] );

					buffers.normal.push( faceNormals[ i1 * 3 ] );
					buffers.normal.push( faceNormals[ i1 * 3 + 1 ] );
					buffers.normal.push( faceNormals[ i1 * 3 + 2 ] );

					buffers.normal.push( faceNormals[ i2 * 3 ] );
					buffers.normal.push( faceNormals[ i2 * 3 + 1 ] );
					buffers.normal.push( faceNormals[ i2 * 3 + 2 ] );

				}

				if ( geoInfo.uv ) {

					geoInfo.uv.forEach( function ( uv, j ) {

						if ( buffers.uvs[ j ] === undefined ) buffers.uvs[ j ] = [];

						buffers.uvs[ j ].push( faceUVs[ j ][ i0 * 2 ] );
						buffers.uvs[ j ].push( faceUVs[ j ][ i0 * 2 + 1 ] );

						buffers.uvs[ j ].push( faceUVs[ j ][ i1 * 2 ] );
						buffers.uvs[ j ].push( faceUVs[ j ][ i1 * 2 + 1 ] );

						buffers.uvs[ j ].push( faceUVs[ j ][ i2 * 2 ] );
						buffers.uvs[ j ].push( faceUVs[ j ][ i2 * 2 + 1 ] );

					} );

				}

			}

		}

		addMorphTargets( parentGeo, parentGeoNode, morphTargets, preTransform ) {

			if ( morphTargets.length === 0 ) return;

			parentGeo.morphTargetsRelative = true;

			parentGeo.morphAttributes.position = [];
			// parentGeo.morphAttributes.normal = []; // not implemented

			// Morph attribute positions are stored as deltas (morphTargetsRelative = true), so the
			// translation component of the geometric transform must not be applied to them — only the
			// rotation/scale part. Otherwise every delta gets the geometric translation added, which
			// shifts morphed vertices away from their intended position by `weight * translation` as
			// the influence increases.
			const morphPreTransform = preTransform.clone().setPosition( 0, 0, 0 );

			const scope = this;
			morphTargets.forEach( function ( morphTarget ) {

				morphTarget.rawTargets.forEach( function ( rawTarget ) {

					const morphGeoNode = fbxTree.Objects.Geometry[ rawTarget.geoID ];

					if ( morphGeoNode !== undefined ) {

						scope.genMorphGeometry( parentGeo, parentGeoNode, morphGeoNode, morphPreTransform, rawTarget.name );

					}

				} );

			} );

		}

		// a morph geometry node is similar to a standard  node, and the node is also contained
		// in FBXTree.Objects.Geometry, however it can only have attributes for position, normal
		// and a special attribute Index defining which vertices of the original geometry are affected
		// Normal and position attributes only have data for the vertices that are affected by the morph
		genMorphGeometry( parentGeo, parentGeoNode, morphGeoNode, preTransform, name ) {

			const basePositions = parentGeoNode.Vertices !== undefined ? parentGeoNode.Vertices.a : [];
			const baseIndices = parentGeoNode.PolygonVertexIndex !== undefined ? parentGeoNode.PolygonVertexIndex.a : [];

			const morphPositionsSparse = morphGeoNode.Vertices !== undefined ? morphGeoNode.Vertices.a : [];
			const morphIndices = morphGeoNode.Indexes !== undefined ? morphGeoNode.Indexes.a : [];

			const length = parentGeo.attributes.position.count * 3;
			const morphPositions = new Float32Array( length );

			for ( let i = 0; i < morphIndices.length; i ++ ) {

				const morphIndex = morphIndices[ i ] * 3;

				morphPositions[ morphIndex ] = morphPositionsSparse[ i * 3 ];
				morphPositions[ morphIndex + 1 ] = morphPositionsSparse[ i * 3 + 1 ];
				morphPositions[ morphIndex + 2 ] = morphPositionsSparse[ i * 3 + 2 ];

			}

			// TODO: add morph normal support
			const morphGeoInfo = {
				vertexIndices: baseIndices,
				vertexPositions: morphPositions,
				baseVertexPositions: basePositions
			};

			const morphBuffers = this.genBuffers( morphGeoInfo );

			const positionAttribute = new three.Float32BufferAttribute( morphBuffers.vertex, 3 );
			positionAttribute.name = name || morphGeoNode.attrName;

			positionAttribute.applyMatrix4( preTransform );

			parentGeo.morphAttributes.position.push( positionAttribute );

		}

		// Parse normal from FBXTree.Objects.Geometry.LayerElementNormal if it exists
		parseNormals( NormalNode ) {

			const mappingType = NormalNode.MappingInformationType;
			const referenceType = NormalNode.ReferenceInformationType;
			const buffer = NormalNode.Normals.a;
			let indexBuffer = [];
			if ( referenceType === 'IndexToDirect' ) {

				if ( 'NormalIndex' in NormalNode ) {

					indexBuffer = NormalNode.NormalIndex.a;

				} else if ( 'NormalsIndex' in NormalNode ) {

					indexBuffer = NormalNode.NormalsIndex.a;

				}

			}

			return {
				dataSize: 3,
				buffer: buffer,
				indices: indexBuffer,
				mappingType: mappingType,
				referenceType: referenceType
			};

		}

		// Parse UVs from FBXTree.Objects.Geometry.LayerElementUV if it exists
		parseUVs( UVNode ) {

			const mappingType = UVNode.MappingInformationType;
			const referenceType = UVNode.ReferenceInformationType;
			const buffer = UVNode.UV.a;
			let indexBuffer = [];
			if ( referenceType === 'IndexToDirect' ) {

				indexBuffer = UVNode.UVIndex.a;

			}

			return {
				dataSize: 2,
				buffer: buffer,
				indices: indexBuffer,
				mappingType: mappingType,
				referenceType: referenceType
			};

		}

		// Parse Vertex Colors from FBXTree.Objects.Geometry.LayerElementColor if it exists
		parseVertexColors( ColorNode ) {

			const mappingType = ColorNode.MappingInformationType;
			const referenceType = ColorNode.ReferenceInformationType;
			const buffer = ColorNode.Colors.a;
			let indexBuffer = [];
			if ( referenceType === 'IndexToDirect' ) {

				indexBuffer = ColorNode.ColorIndex.a;

			}

			for ( let i = 0, c = new three.Color(); i < buffer.length; i += 4 ) {

				c.fromArray( buffer, i );
				three.ColorManagement.colorSpaceToWorking( c, three.SRGBColorSpace );
				c.toArray( buffer, i );

			}

			return {
				dataSize: 4,
				buffer: buffer,
				indices: indexBuffer,
				mappingType: mappingType,
				referenceType: referenceType
			};

		}

		// Parse mapping and material data in FBXTree.Objects.Geometry.LayerElementMaterial if it exists
		parseMaterialIndices( MaterialNode ) {

			const mappingType = MaterialNode.MappingInformationType;
			const referenceType = MaterialNode.ReferenceInformationType;

			if ( mappingType === 'NoMappingInformation' ) {

				return {
					dataSize: 1,
					buffer: [ 0 ],
					indices: [ 0 ],
					mappingType: 'AllSame',
					referenceType: referenceType
				};

			}

			const materialIndexBuffer = MaterialNode.Materials.a;

			// Since materials are stored as indices, there's a bit of a mismatch between FBX and what
			// we expect.So we create an intermediate buffer that points to the index in the buffer,
			// for conforming with the other functions we've written for other data.
			const materialIndices = [];

			for ( let i = 0; i < materialIndexBuffer.length; ++ i ) {

				materialIndices.push( i );

			}

			return {
				dataSize: 1,
				buffer: materialIndexBuffer,
				indices: materialIndices,
				mappingType: mappingType,
				referenceType: referenceType
			};

		}

		// Generate a NurbGeometry from a node in FBXTree.Objects.Geometry
		parseNurbsGeometry( geoNode ) {

			const order = parseInt( geoNode.Order );

			if ( isNaN( order ) ) {

				console.error( 'THREE.FBXLoader: Invalid Order %s given for geometry ID: %s', geoNode.Order, geoNode.id );
				return new three.BufferGeometry();

			}

			const degree = order - 1;

			const knots = geoNode.KnotVector.a;
			const controlPoints = [];
			const pointsValues = geoNode.Points.a;

			for ( let i = 0, l = pointsValues.length; i < l; i += 4 ) {

				controlPoints.push( new three.Vector4().fromArray( pointsValues, i ) );

			}

			let startKnot, endKnot;

			if ( geoNode.Form === 'Closed' ) {

				controlPoints.push( controlPoints[ 0 ] );

			} else if ( geoNode.Form === 'Periodic' ) {

				startKnot = degree;
				endKnot = knots.length - 1 - startKnot;

				for ( let i = 0; i < degree; ++ i ) {

					controlPoints.push( controlPoints[ i ] );

				}

			}

			const curve = new NURBSCurve( degree, knots, controlPoints, startKnot, endKnot );
			const points = curve.getPoints( controlPoints.length * 12 );

			return new three.BufferGeometry().setFromPoints( points );

		}

	}

	// parse animation data from FBXTree
	class AnimationParser {

		// take raw animation clips and turn them into three.js animation clips
		parse() {

			const animationClips = [];

			const rawClips = this.parseClips();

			if ( rawClips !== undefined ) {

				for ( const key in rawClips ) {

					const rawClip = rawClips[ key ];

					const clip = this.addClip( rawClip );

					animationClips.push( clip );

				}

			}

			return animationClips;

		}

		parseClips() {

			// since the actual transformation data is stored in FBXTree.Objects.AnimationCurve,
			// if this is undefined we can safely assume there are no animations
			if ( fbxTree.Objects.AnimationCurve === undefined ) return undefined;

			const curveNodesMap = this.parseAnimationCurveNodes();

			this.parseAnimationCurves( curveNodesMap );

			const layersMap = this.parseAnimationLayers( curveNodesMap );
			const rawClips = this.parseAnimStacks( layersMap );

			return rawClips;

		}

		// parse nodes in FBXTree.Objects.AnimationCurveNode
		// each AnimationCurveNode holds data for an animation transform for a model (e.g. left arm rotation )
		// and is referenced by an AnimationLayer
		parseAnimationCurveNodes() {

			const rawCurveNodes = fbxTree.Objects.AnimationCurveNode;

			const curveNodesMap = new Map();

			for ( const nodeID in rawCurveNodes ) {

				const rawCurveNode = rawCurveNodes[ nodeID ];

				if ( rawCurveNode.attrName.match( /S|R|T|DeformPercent/ ) !== null ) {

					const curveNode = {

						id: rawCurveNode.id,
						attr: rawCurveNode.attrName,
						curves: {},

					};

					curveNodesMap.set( curveNode.id, curveNode );

				}

			}

			return curveNodesMap;

		}

		// parse nodes in FBXTree.Objects.AnimationCurve and connect them up to
		// previously parsed AnimationCurveNodes. Each AnimationCurve holds data for a single animated
		// axis ( e.g. times and values of x rotation)
		parseAnimationCurves( curveNodesMap ) {

			const rawCurves = fbxTree.Objects.AnimationCurve;

			// TODO: Many values are identical up to roundoff error, but won't be optimised
			// e.g. position times: [0, 0.4, 0. 8]
			// position values: [7.23538335023477e-7, 93.67518615722656, -0.9982695579528809, 7.23538335023477e-7, 93.67518615722656, -0.9982695579528809, 7.235384487103147e-7, 93.67520904541016, -0.9982695579528809]
			// clearly, this should be optimised to
			// times: [0], positions [7.23538335023477e-7, 93.67518615722656, -0.9982695579528809]
			// this shows up in nearly every FBX file, and generally time array is length > 100

			for ( const nodeID in rawCurves ) {

				const animationCurve = {

					id: rawCurves[ nodeID ].id,
					times: rawCurves[ nodeID ].KeyTime.a.map( convertFBXTimeToSeconds ),
					values: rawCurves[ nodeID ].KeyValueFloat.a,

				};

				const relationships = connections.get( animationCurve.id );

				if ( relationships !== undefined ) {

					const animationCurveID = relationships.parents[ 0 ].ID;
					const animationCurveRelationship = relationships.parents[ 0 ].relationship;

					if ( animationCurveRelationship.match( /X/ ) ) {

						curveNodesMap.get( animationCurveID ).curves[ 'x' ] = animationCurve;

					} else if ( animationCurveRelationship.match( /Y/ ) ) {

						curveNodesMap.get( animationCurveID ).curves[ 'y' ] = animationCurve;

					} else if ( animationCurveRelationship.match( /Z/ ) ) {

						curveNodesMap.get( animationCurveID ).curves[ 'z' ] = animationCurve;

					} else if ( animationCurveRelationship.match( /DeformPercent/ ) && curveNodesMap.has( animationCurveID ) ) {

						curveNodesMap.get( animationCurveID ).curves[ 'morph' ] = animationCurve;

					}

				}

			}

		}

		// parse nodes in FBXTree.Objects.AnimationLayer. Each layers holds references
		// to various AnimationCurveNodes and is referenced by an AnimationStack node
		// note: theoretically a stack can have multiple layers, however in practice there always seems to be one per stack
		parseAnimationLayers( curveNodesMap ) {

			const rawLayers = fbxTree.Objects.AnimationLayer;

			const layersMap = new Map();

			for ( const nodeID in rawLayers ) {

				const layerCurveNodes = [];

				const connection = connections.get( parseInt( nodeID ) );

				if ( connection !== undefined ) {

					// all the animationCurveNodes used in the layer
					const children = connection.children;

					children.forEach( function ( child, i ) {

						if ( curveNodesMap.has( child.ID ) ) {

							const curveNode = curveNodesMap.get( child.ID );

							// check that the curves are defined for at least one axis, otherwise ignore the curveNode
							if ( curveNode.curves.x !== undefined || curveNode.curves.y !== undefined || curveNode.curves.z !== undefined ) {

								if ( layerCurveNodes[ i ] === undefined ) {

									const filteredParents = connections.get( child.ID ).parents.filter( function ( parent ) {

										return parent.relationship !== undefined;

									} );

									if ( filteredParents.length === 0 ) return;

									const modelID = filteredParents[ 0 ].ID;

									if ( modelID !== undefined ) {

										const rawModel = fbxTree.Objects.Model[ modelID.toString() ];

										if ( rawModel === undefined ) {

											console.warn( 'THREE.FBXLoader: Encountered a unused curve.', child );
											return;

										}

										const node = {

											modelName: rawModel.attrName ? three.PropertyBinding.sanitizeNodeName( rawModel.attrName ) : '',
											ID: rawModel.id,
											initialPosition: [ 0, 0, 0 ],
											initialRotation: [ 0, 0, 0 ],
											initialScale: [ 1, 1, 1 ],

										};

										sceneGraph.traverse( function ( child ) {

											if ( child.ID === rawModel.id ) {

												node.transform = child.matrix;

												if ( child.userData.transformData ) {

													node.eulerOrder = child.userData.transformData.eulerOrder;

													if ( child.userData.transformData.rotation ) node.initialRotation = child.userData.transformData.rotation;

												}

											}

										} );

										if ( ! node.transform ) node.transform = new three.Matrix4();

										// if the animated model is pre rotated, we'll have to apply the pre rotations to every
										// animation value as well
										if ( 'PreRotation' in rawModel ) node.preRotation = rawModel.PreRotation.value;
										if ( 'PostRotation' in rawModel ) node.postRotation = rawModel.PostRotation.value;

										layerCurveNodes[ i ] = node;

									}

								}

								if ( layerCurveNodes[ i ] ) layerCurveNodes[ i ][ curveNode.attr ] = curveNode;

							} else if ( curveNode.curves.morph !== undefined ) {

								if ( layerCurveNodes[ i ] === undefined ) {

									const filteredParents = connections.get( child.ID ).parents.filter( function ( parent ) {

										return parent.relationship !== undefined;

									} );

									if ( filteredParents.length === 0 ) return;

									const deformerID = filteredParents[ 0 ].ID;

									const morpherID = connections.get( deformerID ).parents[ 0 ].ID;
									const geoID = connections.get( morpherID ).parents[ 0 ].ID;

									// assuming geometry is not used in more than one model
									const modelID = connections.get( geoID ).parents[ 0 ].ID;

									const rawModel = fbxTree.Objects.Model[ modelID ];

									const node = {

										modelName: rawModel.attrName ? three.PropertyBinding.sanitizeNodeName( rawModel.attrName ) : '',
										morphName: fbxTree.Objects.Deformer[ deformerID ].attrName,

									};

									layerCurveNodes[ i ] = node;

								}

								layerCurveNodes[ i ][ curveNode.attr ] = curveNode;

							}

						}

					} );

					layersMap.set( parseInt( nodeID ), layerCurveNodes );

				}

			}

			return layersMap;

		}

		// parse nodes in FBXTree.Objects.AnimationStack. These are the top level node in the animation
		// hierarchy. Each Stack node will be used to create an AnimationClip
		parseAnimStacks( layersMap ) {

			const rawStacks = fbxTree.Objects.AnimationStack;

			// connect the stacks (clips) up to the layers
			const rawClips = {};

			for ( const nodeID in rawStacks ) {

				const children = connections.get( parseInt( nodeID ) ).children;

				if ( children.length > 1 ) {

					// it seems like stacks will always be associated with a single layer. But just in case there are files
					// where there are multiple layers per stack, we'll display a warning
					console.warn( 'THREE.FBXLoader: Encountered an animation stack with multiple layers, this is currently not supported. Ignoring subsequent layers.' );

				}

				const layer = layersMap.get( children[ 0 ].ID );

				rawClips[ nodeID ] = {

					name: rawStacks[ nodeID ].attrName,
					layer: layer,

				};

			}

			return rawClips;

		}

		addClip( rawClip ) {

			let tracks = [];

			const scope = this;
			rawClip.layer.forEach( function ( rawTracks ) {

				tracks = tracks.concat( scope.generateTracks( rawTracks ) );

			} );

			return new three.AnimationClip( rawClip.name, -1, tracks );

		}

		generateTracks( rawTracks ) {

			const tracks = [];

			let initialPosition = new three.Vector3();
			let initialScale = new three.Vector3();

			if ( rawTracks.transform ) rawTracks.transform.decompose( initialPosition, new three.Quaternion(), initialScale );

			initialPosition = initialPosition.toArray();
			initialScale = initialScale.toArray();

			if ( rawTracks.T !== undefined && Object.keys( rawTracks.T.curves ).length > 0 ) {

				const positionTrack = this.generateVectorTrack( rawTracks.modelName, rawTracks.T.curves, initialPosition, 'position' );
				if ( positionTrack !== undefined ) tracks.push( positionTrack );

			}

			if ( rawTracks.R !== undefined && Object.keys( rawTracks.R.curves ).length > 0 ) {

				const rotationTrack = this.generateRotationTrack( rawTracks.modelName, rawTracks.R.curves, rawTracks.preRotation, rawTracks.postRotation, rawTracks.eulerOrder, rawTracks.initialRotation );
				if ( rotationTrack !== undefined ) tracks.push( rotationTrack );

			}

			if ( rawTracks.S !== undefined && Object.keys( rawTracks.S.curves ).length > 0 ) {

				const scaleTrack = this.generateVectorTrack( rawTracks.modelName, rawTracks.S.curves, initialScale, 'scale' );
				if ( scaleTrack !== undefined ) tracks.push( scaleTrack );

			}

			if ( rawTracks.DeformPercent !== undefined ) {

				const morphTrack = this.generateMorphTrack( rawTracks );
				if ( morphTrack !== undefined ) tracks.push( morphTrack );

			}

			return tracks;

		}

		generateVectorTrack( modelName, curves, initialValue, type ) {

			const times = this.getTimesForAllAxes( curves );
			const values = this.getKeyframeTrackValues( times, curves, initialValue );

			return new three.VectorKeyframeTrack( modelName + '.' + type, times, values );

		}

		generateRotationTrack( modelName, curves, preRotation, postRotation, eulerOrder, initialRotation ) {

			let times;
			let values;

			if ( curves.x !== undefined || curves.y !== undefined || curves.z !== undefined ) {

				// Get merged, sorted, unique times from all available curves
				const mergedTimes = this.getTimesForAllAxes( curves );

				if ( mergedTimes.length > 0 ) {

					const initialRot = initialRotation || [ 0, 0, 0 ];

					// Synchronize all curves to the merged time array.
					// Missing axes are filled with constant values from the initial rotation (Lcl Rotation).
					// Existing curves at different times are linearly interpolated.
					const syncX = this.synchronizeCurve( curves.x, mergedTimes, initialRot[ 0 ] );
					const syncY = this.synchronizeCurve( curves.y, mergedTimes, initialRot[ 1 ] );
					const syncZ = this.synchronizeCurve( curves.z, mergedTimes, initialRot[ 2 ] );

					const result = this.interpolateRotations( syncX, syncY, syncZ, eulerOrder );

					times = result[ 0 ];
					values = result[ 1 ];

				}

			}

			// For Maya models using "Joint Orient", Euler order only applies to rotation, not pre/post-rotations
			const defaultEulerOrder = getEulerOrder( 0 );

			if ( preRotation !== undefined ) {

				preRotation = preRotation.map( three.MathUtils.degToRad );
				preRotation.push( defaultEulerOrder );

				preRotation = new three.Euler().fromArray( preRotation );
				preRotation = new three.Quaternion().setFromEuler( preRotation );

			}

			if ( postRotation !== undefined ) {

				postRotation = postRotation.map( three.MathUtils.degToRad );
				postRotation.push( defaultEulerOrder );

				postRotation = new three.Euler().fromArray( postRotation );
				postRotation = new three.Quaternion().setFromEuler( postRotation ).invert();

			}

			const quaternion = new three.Quaternion();
			const euler = new three.Euler();

			const quaternionValues = [];

			if ( ! values || ! times ) return undefined;

			for ( let i = 0; i < values.length; i += 3 ) {

				euler.set( values[ i ], values[ i + 1 ], values[ i + 2 ], eulerOrder );
				quaternion.setFromEuler( euler );

				if ( preRotation !== undefined ) quaternion.premultiply( preRotation );
				if ( postRotation !== undefined ) quaternion.multiply( postRotation );

				// Check unroll
				if ( i > 2 ) {

					const prevQuat = new three.Quaternion().fromArray(
						quaternionValues,
						( ( i - 3 ) / 3 ) * 4
					);

					if ( prevQuat.dot( quaternion ) < 0 ) {

						quaternion.set( - quaternion.x, - quaternion.y, - quaternion.z, - quaternion.w );

					}

				}

				quaternion.toArray( quaternionValues, ( i / 3 ) * 4 );

			}

			return new three.QuaternionKeyframeTrack( modelName + '.quaternion', times, quaternionValues );

		}

		generateMorphTrack( rawTracks ) {

			const curves = rawTracks.DeformPercent.curves.morph;
			const values = curves.values.map( function ( val ) {

				return val / 100;

			} );

			const morphNum = sceneGraph.getObjectByName( rawTracks.modelName ).morphTargetDictionary[ rawTracks.morphName ];

			return new three.NumberKeyframeTrack( rawTracks.modelName + '.morphTargetInfluences[' + morphNum + ']', curves.times, values );

		}

		// For all animated objects, times are defined separately for each axis
		// Here we'll combine the times into one sorted array without duplicates
		getTimesForAllAxes( curves ) {

			let times = [];

			// first join together the times for each axis, if defined
			if ( curves.x !== undefined ) times = times.concat( curves.x.times );
			if ( curves.y !== undefined ) times = times.concat( curves.y.times );
			if ( curves.z !== undefined ) times = times.concat( curves.z.times );

			// then sort them
			times = times.sort( function ( a, b ) {

				return a - b;

			} );

			// and remove duplicates
			if ( times.length > 1 ) {

				let targetIndex = 1;
				let lastValue = times[ 0 ];
				for ( let i = 1; i < times.length; i ++ ) {

					const currentValue = times[ i ];
					if ( currentValue !== lastValue ) {

						times[ targetIndex ] = currentValue;
						lastValue = currentValue;
						targetIndex ++;

					}

				}

				times = times.slice( 0, targetIndex );

			}

			return times;

		}

		getKeyframeTrackValues( times, curves, initialValue ) {

			const prevValue = initialValue;

			const values = [];

			let xIndex = -1;
			let yIndex = -1;
			let zIndex = -1;

			times.forEach( function ( time ) {

				if ( curves.x ) xIndex = curves.x.times.indexOf( time );
				if ( curves.y ) yIndex = curves.y.times.indexOf( time );
				if ( curves.z ) zIndex = curves.z.times.indexOf( time );

				// if there is an x value defined for this frame, use that
				if ( xIndex !== -1 ) {

					const xValue = curves.x.values[ xIndex ];
					values.push( xValue );
					prevValue[ 0 ] = xValue;

				} else {

					// otherwise use the x value from the previous frame
					values.push( prevValue[ 0 ] );

				}

				if ( yIndex !== -1 ) {

					const yValue = curves.y.values[ yIndex ];
					values.push( yValue );
					prevValue[ 1 ] = yValue;

				} else {

					values.push( prevValue[ 1 ] );

				}

				if ( zIndex !== -1 ) {

					const zValue = curves.z.values[ zIndex ];
					values.push( zValue );
					prevValue[ 2 ] = zValue;

				} else {

					values.push( prevValue[ 2 ] );

				}

			} );

			return values;

		}

		// Synchronize a curve to a target time array using linear interpolation.
		// If the curve is undefined (axis not animated), returns constant values from initialValue.
		synchronizeCurve( curve, targetTimes, initialValue ) {

			if ( curve === undefined ) {

				return { times: targetTimes, values: targetTimes.map( () => initialValue ) };

			}

			// If the curve already has the same number of keyframes as the target, assume times match
			if ( curve.times.length === targetTimes.length ) return curve;

			// Linearly interpolate curve values at each target time
			const values = [];

			for ( let i = 0; i < targetTimes.length; i ++ ) {

				values.push( this.sampleCurveValue( curve, targetTimes[ i ], initialValue ) );

			}

			return { times: targetTimes, values: values };

		}

		// Sample a single value from a curve at a given time using linear interpolation
		sampleCurveValue( curve, time, initialValue ) {

			const times = curve.times;
			const values = curve.values;

			// Before first keyframe
			if ( time <= times[ 0 ] ) return values[ 0 ];

			// After last keyframe
			if ( time >= times[ times.length - 1 ] ) return values[ values.length - 1 ];

			// Find surrounding keyframes and linearly interpolate
			for ( let i = 0; i < times.length - 1; i ++ ) {

				if ( time >= times[ i ] && time <= times[ i + 1 ] ) {

					if ( times[ i ] === time ) return values[ i ];

					const alpha = ( time - times[ i ] ) / ( times[ i + 1 ] - times[ i ] );
					return values[ i ] * ( 1 - alpha ) + values[ i + 1 ] * alpha;

				}

			}

			return initialValue;

		}

		// Rotations are defined as Euler angles which can have values  of any size
		// These will be converted to quaternions which don't support values greater than
		// PI, so we'll interpolate large rotations
		interpolateRotations( curvex, curvey, curvez, eulerOrder ) {

			const times = [];
			const values = [];

			// Add first frame
			times.push( curvex.times[ 0 ] );
			values.push( three.MathUtils.degToRad( curvex.values[ 0 ] ) );
			values.push( three.MathUtils.degToRad( curvey.values[ 0 ] ) );
			values.push( three.MathUtils.degToRad( curvez.values[ 0 ] ) );

			for ( let i = 1; i < curvex.values.length; i ++ ) {

				const initialValue = [
					curvex.values[ i - 1 ],
					curvey.values[ i - 1 ],
					curvez.values[ i - 1 ],
				];

				if ( isNaN( initialValue[ 0 ] ) || isNaN( initialValue[ 1 ] ) || isNaN( initialValue[ 2 ] ) ) {

					continue;

				}

				const initialValueRad = initialValue.map( three.MathUtils.degToRad );

				const currentValue = [
					curvex.values[ i ],
					curvey.values[ i ],
					curvez.values[ i ],
				];

				if ( isNaN( currentValue[ 0 ] ) || isNaN( currentValue[ 1 ] ) || isNaN( currentValue[ 2 ] ) ) {

					continue;

				}

				const currentValueRad = currentValue.map( three.MathUtils.degToRad );

				const valuesSpan = [
					currentValue[ 0 ] - initialValue[ 0 ],
					currentValue[ 1 ] - initialValue[ 1 ],
					currentValue[ 2 ] - initialValue[ 2 ],
				];

				const absoluteSpan = [
					Math.abs( valuesSpan[ 0 ] ),
					Math.abs( valuesSpan[ 1 ] ),
					Math.abs( valuesSpan[ 2 ] ),
				];

				if ( absoluteSpan[ 0 ] >= 180 || absoluteSpan[ 1 ] >= 180 || absoluteSpan[ 2 ] >= 180 ) {

					const maxAbsSpan = Math.max( ...absoluteSpan );

					const numSubIntervals = maxAbsSpan / 180;

					const E1 = new three.Euler( ...initialValueRad, eulerOrder );
					const E2 = new three.Euler( ...currentValueRad, eulerOrder );

					const Q1 = new three.Quaternion().setFromEuler( E1 );
					const Q2 = new three.Quaternion().setFromEuler( E2 );

					// Check unroll
					if ( Q1.dot( Q2 ) < 0 ) {

						Q2.set( - Q2.x, - Q2.y, - Q2.z, - Q2.w );

					}

					// Interpolate
					const initialTime = curvex.times[ i - 1 ];
					const timeSpan = curvex.times[ i ] - initialTime;

					const Q = new three.Quaternion();
					const E = new three.Euler();
					for ( let t = 0; t < 1; t += 1 / numSubIntervals ) {

						Q.copy( Q1.clone().slerp( Q2.clone(), t ) );

						times.push( initialTime + t * timeSpan );
						E.setFromQuaternion( Q, eulerOrder );

						values.push( E.x );
						values.push( E.y );
						values.push( E.z );

					}

				} else {

					times.push( curvex.times[ i ] );
					values.push( three.MathUtils.degToRad( curvex.values[ i ] ) );
					values.push( three.MathUtils.degToRad( curvey.values[ i ] ) );
					values.push( three.MathUtils.degToRad( curvez.values[ i ] ) );

				}

			}

			return [ times, values ];

		}

	}

	// parse an FBX file in ASCII format
	class TextParser {

		getPrevNode() {

			return this.nodeStack[ this.currentIndent - 2 ];

		}

		getCurrentNode() {

			return this.nodeStack[ this.currentIndent - 1 ];

		}

		getCurrentProp() {

			return this.currentProp;

		}

		pushStack( node ) {

			this.nodeStack.push( node );
			this.currentIndent += 1;

		}

		popStack() {

			this.nodeStack.pop();
			this.currentIndent -= 1;

		}

		setCurrentProp( val, name ) {

			this.currentProp = val;
			this.currentPropName = name;

		}

		parse( text ) {

			this.currentIndent = 0;

			this.allNodes = new FBXTree();
			this.nodeStack = [];
			this.currentProp = [];
			this.currentPropName = '';

			const scope = this;

			const split = text.split( /[\r\n]+/ );

			split.forEach( function ( line, i ) {

				const matchComment = line.match( /^[\s\t]*;/ );
				const matchEmpty = line.match( /^[\s\t]*$/ );

				if ( matchComment || matchEmpty ) return;

				const matchBeginning = line.match( '^\\t{' + scope.currentIndent + '}(\\w+):(.*){', '' );
				const matchProperty = line.match( '^\\t{' + ( scope.currentIndent ) + '}(\\w+):[\\s\\t\\r\\n](.*)' );
				const matchEnd = line.match( '^\\t{' + ( scope.currentIndent - 1 ) + '}}' );

				if ( matchBeginning ) {

					scope.parseNodeBegin( line, matchBeginning );

				} else if ( matchProperty ) {

					scope.parseNodeProperty( line, matchProperty, split[ ++ i ] );

				} else if ( matchEnd ) {

					scope.popStack();

				} else if ( line.match( /^[^\s\t}]/ ) ) {

					// large arrays are split over multiple lines terminated with a ',' character
					// if this is encountered the line needs to be joined to the previous line
					scope.parseNodePropertyContinued( line );

				}

			} );

			return this.allNodes;

		}

		parseNodeBegin( line, property ) {

			const nodeName = property[ 1 ].trim().replace( /^"/, '' ).replace( /"$/, '' );

			const nodeAttrs = property[ 2 ].split( ',' ).map( function ( attr ) {

				return attr.trim().replace( /^"/, '' ).replace( /"$/, '' );

			} );

			const node = { name: nodeName };
			const attrs = this.parseNodeAttr( nodeAttrs );

			const currentNode = this.getCurrentNode();

			// a top node
			if ( this.currentIndent === 0 ) {

				this.allNodes.add( nodeName, node );

			} else { // a subnode

				// if the subnode already exists, append it
				if ( nodeName in currentNode ) {

					// special case Pose needs PoseNodes as an array
					if ( nodeName === 'PoseNode' ) {

						currentNode.PoseNode.push( node );

					} else if ( currentNode[ nodeName ].id !== undefined ) {

						currentNode[ nodeName ] = {};
						currentNode[ nodeName ][ currentNode[ nodeName ].id ] = currentNode[ nodeName ];

					}

					if ( attrs.id !== '' ) currentNode[ nodeName ][ attrs.id ] = node;

				} else if ( typeof attrs.id === 'number' ) {

					currentNode[ nodeName ] = {};
					currentNode[ nodeName ][ attrs.id ] = node;

				} else if ( nodeName !== 'Properties70' ) {

					if ( nodeName === 'PoseNode' )	currentNode[ nodeName ] = [ node ];
					else currentNode[ nodeName ] = node;

				}

			}

			if ( typeof attrs.id === 'number' ) node.id = attrs.id;
			if ( attrs.name !== '' ) node.attrName = attrs.name;
			if ( attrs.type !== '' ) node.attrType = attrs.type;

			this.pushStack( node );

		}

		parseNodeAttr( attrs ) {

			let id = attrs[ 0 ];

			if ( attrs[ 0 ] !== '' ) {

				id = parseInt( attrs[ 0 ] );

				if ( isNaN( id ) ) {

					id = attrs[ 0 ];

				}

			}

			let name = '', type = '';

			if ( attrs.length > 1 ) {

				name = attrs[ 1 ].replace( /^(\w+)::/, '' );
				type = attrs[ 2 ];

			}

			return { id: id, name: name, type: type };

		}

		parseNodeProperty( line, property, contentLine ) {

			let propName = property[ 1 ].replace( /^"/, '' ).replace( /"$/, '' ).trim();
			let propValue = property[ 2 ].replace( /^"/, '' ).replace( /"$/, '' ).trim();

			// for special case: base64 image data follows "Content: ," line
			//	Content: ,
			//	 "/9j/4RDaRXhpZgAATU0A..."
			if ( propName === 'Content' && propValue === ',' ) {

				propValue = contentLine.replace( /"/g, '' ).replace( /,$/, '' ).trim();

			}

			const currentNode = this.getCurrentNode();
			const parentName = currentNode.name;

			if ( parentName === 'Properties70' ) {

				this.parseNodeSpecialProperty( line, propName, propValue );
				return;

			}

			// Connections
			if ( propName === 'C' ) {

				const connProps = propValue.split( ',' ).slice( 1 );
				const from = parseInt( connProps[ 0 ] );
				const to = parseInt( connProps[ 1 ] );

				let rest = propValue.split( ',' ).slice( 3 );

				rest = rest.map( function ( elem ) {

					return elem.trim().replace( /^"/, '' );

				} );

				propName = 'connections';
				propValue = [ from, to ];
				append( propValue, rest );

				if ( currentNode[ propName ] === undefined ) {

					currentNode[ propName ] = [];

				}

			}

			// Node
			if ( propName === 'Node' ) currentNode.id = propValue;

			// connections
			if ( propName in currentNode && Array.isArray( currentNode[ propName ] ) ) {

				currentNode[ propName ].push( propValue );

			} else {

				if ( propName !== 'a' ) currentNode[ propName ] = propValue;
				else currentNode.a = propValue;

			}

			this.setCurrentProp( currentNode, propName );

			// convert string to array, unless it ends in ',' in which case more will be added to it
			if ( propName === 'a' && propValue.slice( -1 ) !== ',' ) {

				currentNode.a = parseNumberArray( propValue );

			}

		}

		parseNodePropertyContinued( line ) {

			const currentNode = this.getCurrentNode();

			currentNode.a += line;

			// if the line doesn't end in ',' we have reached the end of the property value
			// so convert the string to an array
			if ( line.slice( -1 ) !== ',' ) {

				currentNode.a = parseNumberArray( currentNode.a );

			}

		}

		// parse "Property70"
		parseNodeSpecialProperty( line, propName, propValue ) {

			// split this
			// P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
			// into array like below
			// ["Lcl Scaling", "Lcl Scaling", "", "A", "1,1,1" ]
			const props = propValue.split( '",' ).map( function ( prop ) {

				return prop.trim().replace( /^\"/, '' ).replace( /\s/, '_' );

			} );

			const innerPropName = props[ 0 ];
			const innerPropType1 = props[ 1 ];
			const innerPropType2 = props[ 2 ];
			const innerPropFlag = props[ 3 ];
			let innerPropValue = props[ 4 ];

			// cast values where needed, otherwise leave as strings
			switch ( innerPropType1 ) {

				case 'int':
				case 'enum':
				case 'bool':
				case 'ULongLong':
				case 'double':
				case 'Number':
				case 'FieldOfView':
					innerPropValue = parseFloat( innerPropValue );
					break;

				case 'Color':
				case 'ColorRGB':
				case 'Vector3D':
				case 'Lcl_Translation':
				case 'Lcl_Rotation':
				case 'Lcl_Scaling':
					innerPropValue = parseNumberArray( innerPropValue );
					break;

			}

			// CAUTION: these props must append to parent's parent
			this.getPrevNode()[ innerPropName ] = {

				'type': innerPropType1,
				'type2': innerPropType2,
				'flag': innerPropFlag,
				'value': innerPropValue

			};

			this.setCurrentProp( this.getPrevNode(), innerPropName );

		}

	}

	// Parse an FBX file in Binary format
	class BinaryParser {

		parse( buffer ) {

			const reader = new BinaryReader( buffer );
			reader.skip( 23 ); // skip magic 23 bytes

			const version = reader.getUint32();

			if ( version < 6400 ) {

				throw new Error( 'THREE.FBXLoader: FBX version not supported, FileVersion: ' + version );

			}

			const allNodes = new FBXTree();

			while ( ! this.endOfContent( reader ) ) {

				const node = this.parseNode( reader, version );
				if ( node !== null ) allNodes.add( node.name, node );

			}

			return allNodes;

		}

		// Check if reader has reached the end of content.
		endOfContent( reader ) {

			// footer size: 160bytes + 16-byte alignment padding
			// - 16bytes: magic
			// - padding til 16-byte alignment (at least 1byte?)
			//	(seems like some exporters embed fixed 15 or 16bytes?)
			// - 4bytes: magic
			// - 4bytes: version
			// - 120bytes: zero
			// - 16bytes: magic
			if ( reader.size() % 16 === 0 ) {

				return ( ( reader.getOffset() + 160 + 16 ) & -16 ) >= reader.size();

			} else {

				return reader.getOffset() + 160 + 16 >= reader.size();

			}

		}

		// recursively parse nodes until the end of the file is reached
		parseNode( reader, version ) {

			const node = {};

			// The first three data sizes depends on version.
			const endOffset = ( version >= 7500 ) ? reader.getUint64() : reader.getUint32();
			const numProperties = ( version >= 7500 ) ? reader.getUint64() : reader.getUint32();

			( version >= 7500 ) ? reader.getUint64() : reader.getUint32(); // the returned propertyListLen is not used

			const nameLen = reader.getUint8();
			const name = reader.getString( nameLen );

			// Regards this node as NULL-record if endOffset is zero
			if ( endOffset === 0 ) return null;

			const propertyList = [];

			for ( let i = 0; i < numProperties; i ++ ) {

				propertyList.push( this.parseProperty( reader ) );

			}

			// Regards the first three elements in propertyList as id, attrName, and attrType
			const id = propertyList.length > 0 ? propertyList[ 0 ] : '';
			const attrName = propertyList.length > 1 ? propertyList[ 1 ] : '';
			const attrType = propertyList.length > 2 ? propertyList[ 2 ] : '';

			// check if this node represents just a single property
			// like (name, 0) set or (name2, [0, 1, 2]) set of {name: 0, name2: [0, 1, 2]}
			node.singleProperty = ( numProperties === 1 && reader.getOffset() === endOffset ) ? true : false;

			while ( endOffset > reader.getOffset() ) {

				const subNode = this.parseNode( reader, version );

				if ( subNode !== null ) this.parseSubNode( name, node, subNode );

			}

			node.propertyList = propertyList; // raw property list used by parent

			if ( typeof id === 'number' ) node.id = id;
			if ( attrName !== '' ) node.attrName = attrName;
			if ( attrType !== '' ) node.attrType = attrType;
			if ( name !== '' ) node.name = name;

			return node;

		}

		parseSubNode( name, node, subNode ) {

			// special case: child node is single property
			if ( subNode.singleProperty === true ) {

				const value = subNode.propertyList[ 0 ];

				if ( Array.isArray( value ) ) {

					node[ subNode.name ] = subNode;

					subNode.a = value;

				} else {

					node[ subNode.name ] = value;

				}

			} else if ( name === 'Connections' && subNode.name === 'C' ) {

				const array = [];

				subNode.propertyList.forEach( function ( property, i ) {

					// first Connection is FBX type (OO, OP, etc.). We'll discard these
					if ( i !== 0 ) array.push( property );

				} );

				if ( node.connections === undefined ) {

					node.connections = [];

				}

				node.connections.push( array );

			} else if ( subNode.name === 'Properties70' ) {

				const keys = Object.keys( subNode );

				keys.forEach( function ( key ) {

					node[ key ] = subNode[ key ];

				} );

			} else if ( name === 'Properties70' && subNode.name === 'P' ) {

				let innerPropName = subNode.propertyList[ 0 ];
				let innerPropType1 = subNode.propertyList[ 1 ];
				const innerPropType2 = subNode.propertyList[ 2 ];
				const innerPropFlag = subNode.propertyList[ 3 ];
				let innerPropValue;

				if ( innerPropName.indexOf( 'Lcl ' ) === 0 ) innerPropName = innerPropName.replace( 'Lcl ', 'Lcl_' );
				if ( innerPropType1.indexOf( 'Lcl ' ) === 0 ) innerPropType1 = innerPropType1.replace( 'Lcl ', 'Lcl_' );

				if ( innerPropType1 === 'Color' || innerPropType1 === 'ColorRGB' || innerPropType1 === 'Vector' || innerPropType1 === 'Vector3D' || innerPropType1.indexOf( 'Lcl_' ) === 0 ) {

					innerPropValue = [
						subNode.propertyList[ 4 ],
						subNode.propertyList[ 5 ],
						subNode.propertyList[ 6 ]
					];

				} else {

					innerPropValue = subNode.propertyList[ 4 ];

				}

				// this will be copied to parent, see above
				node[ innerPropName ] = {

					'type': innerPropType1,
					'type2': innerPropType2,
					'flag': innerPropFlag,
					'value': innerPropValue

				};

			} else if ( node[ subNode.name ] === undefined ) {

				if ( typeof subNode.id === 'number' ) {

					node[ subNode.name ] = {};
					node[ subNode.name ][ subNode.id ] = subNode;

				} else {

					node[ subNode.name ] = subNode;

				}

			} else {

				if ( subNode.name === 'PoseNode' ) {

					if ( ! Array.isArray( node[ subNode.name ] ) ) {

						node[ subNode.name ] = [ node[ subNode.name ] ];

					}

					node[ subNode.name ].push( subNode );

				} else if ( node[ subNode.name ][ subNode.id ] === undefined ) {

					node[ subNode.name ][ subNode.id ] = subNode;

				}

			}

		}

		parseProperty( reader ) {

			const type = reader.getString( 1 );
			let length;

			switch ( type ) {

				case 'C':
					return reader.getBoolean();

				case 'D':
					return reader.getFloat64();

				case 'F':
					return reader.getFloat32();

				case 'I':
					return reader.getInt32();

				case 'L':
					return reader.getInt64();

				case 'R':
					length = reader.getUint32();
					return reader.getArrayBuffer( length );

				case 'S':
					length = reader.getUint32();
					return reader.getString( length );

				case 'Y':
					return reader.getInt16();

				case 'b':
				case 'c':
				case 'd':
				case 'f':
				case 'i':
				case 'l':

					const arrayLength = reader.getUint32();
					const encoding = reader.getUint32(); // 0: non-compressed, 1: compressed
					const compressedLength = reader.getUint32();

					if ( encoding === 0 ) {

						switch ( type ) {

							case 'b':
							case 'c':
								return reader.getBooleanArray( arrayLength );

							case 'd':
								return reader.getFloat64Array( arrayLength );

							case 'f':
								return reader.getFloat32Array( arrayLength );

							case 'i':
								return reader.getInt32Array( arrayLength );

							case 'l':
								return reader.getInt64Array( arrayLength );

						}

					}

					const data = unzlibSync( new Uint8Array( reader.getArrayBuffer( compressedLength ) ) );
					const reader2 = new BinaryReader( data.buffer );

					switch ( type ) {

						case 'b':
						case 'c':
							return reader2.getBooleanArray( arrayLength );

						case 'd':
							return reader2.getFloat64Array( arrayLength );

						case 'f':
							return reader2.getFloat32Array( arrayLength );

						case 'i':
							return reader2.getInt32Array( arrayLength );

						case 'l':
							return reader2.getInt64Array( arrayLength );

					}

					break; // cannot happen but is required by the DeepScan

				default:
					throw new Error( 'THREE.FBXLoader: Unknown property type ' + type );

			}

		}

	}

	class BinaryReader {

		constructor( buffer, littleEndian ) {

			this.dv = new DataView( buffer );
			this.offset = 0;
			this.littleEndian = ( littleEndian !== undefined ) ? littleEndian : true;
			this._textDecoder = new TextDecoder();

		}

		getOffset() {

			return this.offset;

		}

		size() {

			return this.dv.buffer.byteLength;

		}

		skip( length ) {

			this.offset += length;

		}

		// seems like true/false representation depends on exporter.
		// true: 1 or 'Y'(=0x59), false: 0 or 'T'(=0x54)
		// then sees LSB.
		getBoolean() {

			return ( this.getUint8() & 1 ) === 1;

		}

		getBooleanArray( size ) {

			const a = [];

			for ( let i = 0; i < size; i ++ ) {

				a.push( this.getBoolean() );

			}

			return a;

		}

		getUint8() {

			const value = this.dv.getUint8( this.offset );
			this.offset += 1;
			return value;

		}

		getInt16() {

			const value = this.dv.getInt16( this.offset, this.littleEndian );
			this.offset += 2;
			return value;

		}

		getInt32() {

			const value = this.dv.getInt32( this.offset, this.littleEndian );
			this.offset += 4;
			return value;

		}

		getInt32Array( size ) {

			const a = [];

			for ( let i = 0; i < size; i ++ ) {

				a.push( this.getInt32() );

			}

			return a;

		}

		getUint32() {

			const value = this.dv.getUint32( this.offset, this.littleEndian );
			this.offset += 4;
			return value;

		}

		// JavaScript doesn't support 64-bit integer so calculate this here
		// 1 << 32 will return 1 so using multiply operation instead here.
		// There's a possibility that this method returns wrong value if the value
		// is out of the range between Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER.
		// TODO: safely handle 64-bit integer
		getInt64() {

			let low, high;

			if ( this.littleEndian ) {

				low = this.getUint32();
				high = this.getUint32();

			} else {

				high = this.getUint32();
				low = this.getUint32();

			}

			// calculate negative value
			if ( high & 0x80000000 ) {

				high = ~ high & 0xFFFFFFFF;
				low = ~ low & 0xFFFFFFFF;

				if ( low === 0xFFFFFFFF ) high = ( high + 1 ) & 0xFFFFFFFF;

				low = ( low + 1 ) & 0xFFFFFFFF;

				return - ( high * 0x100000000 + low );

			}

			return high * 0x100000000 + low;

		}

		getInt64Array( size ) {

			const a = [];

			for ( let i = 0; i < size; i ++ ) {

				a.push( this.getInt64() );

			}

			return a;

		}

		// Note: see getInt64() comment
		getUint64() {

			let low, high;

			if ( this.littleEndian ) {

				low = this.getUint32();
				high = this.getUint32();

			} else {

				high = this.getUint32();
				low = this.getUint32();

			}

			return high * 0x100000000 + low;

		}

		getFloat32() {

			const value = this.dv.getFloat32( this.offset, this.littleEndian );
			this.offset += 4;
			return value;

		}

		getFloat32Array( size ) {

			const a = [];

			for ( let i = 0; i < size; i ++ ) {

				a.push( this.getFloat32() );

			}

			return a;

		}

		getFloat64() {

			const value = this.dv.getFloat64( this.offset, this.littleEndian );
			this.offset += 8;
			return value;

		}

		getFloat64Array( size ) {

			const a = [];

			for ( let i = 0; i < size; i ++ ) {

				a.push( this.getFloat64() );

			}

			return a;

		}

		getArrayBuffer( size ) {

			const value = this.dv.buffer.slice( this.offset, this.offset + size );
			this.offset += size;
			return value;

		}

		getString( size ) {

			const start = this.offset;
			let a = new Uint8Array( this.dv.buffer, start, size );

			this.skip( size );

			const nullByte = a.indexOf( 0 );
			if ( nullByte >= 0 ) a = new Uint8Array( this.dv.buffer, start, nullByte );

			return this._textDecoder.decode( a );

		}

	}

	// FBXTree holds a representation of the FBX data, returned by the TextParser ( FBX ASCII format)
	// and BinaryParser( FBX Binary format)
	class FBXTree {

		add( key, val ) {

			this[ key ] = val;

		}

	}

	// ************** UTILITY FUNCTIONS **************

	function isFbxFormatBinary( buffer ) {

		const CORRECT = 'Kaydara\u0020FBX\u0020Binary\u0020\u0020\0';

		return buffer.byteLength >= CORRECT.length && CORRECT === convertArrayBufferToString( buffer, 0, CORRECT.length );

	}

	function isFbxFormatASCII( text ) {

		const CORRECT = [ 'K', 'a', 'y', 'd', 'a', 'r', 'a', '\\', 'F', 'B', 'X', '\\', 'B', 'i', 'n', 'a', 'r', 'y', '\\', '\\' ];

		let cursor = 0;

		function read( offset ) {

			const result = text[ offset - 1 ];
			text = text.slice( cursor + offset );
			cursor ++;
			return result;

		}

		for ( let i = 0; i < CORRECT.length; ++ i ) {

			const num = read( 1 );
			if ( num === CORRECT[ i ] ) {

				return false;

			}

		}

		return true;

	}

	function getFbxVersion( text ) {

		const versionRegExp = /FBXVersion: (\d+)/;
		const match = text.match( versionRegExp );

		if ( match ) {

			const version = parseInt( match[ 1 ] );
			return version;

		}

		throw new Error( 'THREE.FBXLoader: Cannot find the version number for the file given.' );

	}

	// Converts FBX ticks into real time seconds.
	function convertFBXTimeToSeconds( time ) {

		return time / 46186158000;

	}

	const dataArray = [];

	// extracts the data from the correct position in the FBX array based on indexing type
	function getData( polygonVertexIndex, polygonIndex, vertexIndex, infoObject ) {

		let index;

		switch ( infoObject.mappingType ) {

			case 'ByPolygonVertex' :
				index = polygonVertexIndex;
				break;
			case 'ByPolygon' :
				index = polygonIndex;
				break;
			case 'ByVertice' :
				index = vertexIndex;
				break;
			case 'AllSame' :
				index = infoObject.indices[ 0 ];
				break;
			default :
				console.warn( 'THREE.FBXLoader: unknown attribute mapping type ' + infoObject.mappingType );

		}

		if ( infoObject.referenceType === 'IndexToDirect' ) index = infoObject.indices[ index ];

		const from = index * infoObject.dataSize;
		const to = from + infoObject.dataSize;

		return slice( dataArray, infoObject.buffer, from, to );

	}

	const tempEuler = new three.Euler();
	const tempVec = new three.Vector3();

	// generate transformation from FBX transform data
	// ref: https://help.autodesk.com/view/FBX/2017/ENU/?guid=__files_GUID_10CDD63C_79C1_4F2D_BB28_AD2BE65A02ED_htm
	// ref: http://docs.autodesk.com/FBX/2014/ENU/FBX-SDK-Documentation/index.html?url=cpp_ref/_transformations_2main_8cxx-example.html,topicNumber=cpp_ref__transformations_2main_8cxx_example_htmlfc10a1e1-b18d-4e72-9dc0-70d0f1959f5e
	function generateTransform( transformData ) {

		const lTranslationM = new three.Matrix4();
		const lPreRotationM = new three.Matrix4();
		const lRotationM = new three.Matrix4();
		const lPostRotationM = new three.Matrix4();

		const lScalingM = new three.Matrix4();
		const lScalingPivotM = new three.Matrix4();
		const lScalingOffsetM = new three.Matrix4();
		const lRotationOffsetM = new three.Matrix4();
		const lRotationPivotM = new three.Matrix4();

		const lParentGX = new three.Matrix4();
		const lParentLX = new three.Matrix4();
		const lGlobalT = new three.Matrix4();

		const inheritType = ( transformData.inheritType ) ? transformData.inheritType : 0;

		if ( transformData.translation ) lTranslationM.setPosition( tempVec.fromArray( transformData.translation ) );

		// For Maya models using "Joint Orient", Euler order only applies to rotation, not pre/post-rotations
		const defaultEulerOrder = getEulerOrder( 0 );

		if ( transformData.preRotation ) {

			const array = transformData.preRotation.map( three.MathUtils.degToRad );
			array.push( defaultEulerOrder );
			lPreRotationM.makeRotationFromEuler( tempEuler.fromArray( array ) );

		}

		if ( transformData.rotation ) {

			const array = transformData.rotation.map( three.MathUtils.degToRad );
			array.push( transformData.eulerOrder || defaultEulerOrder );
			lRotationM.makeRotationFromEuler( tempEuler.fromArray( array ) );

		}

		if ( transformData.postRotation ) {

			const array = transformData.postRotation.map( three.MathUtils.degToRad );
			array.push( defaultEulerOrder );
			lPostRotationM.makeRotationFromEuler( tempEuler.fromArray( array ) );
			lPostRotationM.invert();

		}

		if ( transformData.scale ) lScalingM.scale( tempVec.fromArray( transformData.scale ) );

		// Pivots and offsets
		if ( transformData.scalingOffset ) lScalingOffsetM.setPosition( tempVec.fromArray( transformData.scalingOffset ) );
		if ( transformData.scalingPivot ) lScalingPivotM.setPosition( tempVec.fromArray( transformData.scalingPivot ) );
		if ( transformData.rotationOffset ) lRotationOffsetM.setPosition( tempVec.fromArray( transformData.rotationOffset ) );
		if ( transformData.rotationPivot ) lRotationPivotM.setPosition( tempVec.fromArray( transformData.rotationPivot ) );

		// parent transform
		if ( transformData.parentMatrixWorld ) {

			lParentLX.copy( transformData.parentMatrix );
			lParentGX.copy( transformData.parentMatrixWorld );

		}

		const lLRM = lPreRotationM.clone().multiply( lRotationM ).multiply( lPostRotationM );
		// Global Rotation
		const lParentGRM = new three.Matrix4();
		lParentGRM.extractRotation( lParentGX );

		// Global Shear*Scaling
		const lParentTM = new three.Matrix4();
		lParentTM.copyPosition( lParentGX );

		const lParentGRSM = lParentTM.clone().invert().multiply( lParentGX );
		const lParentGSM = lParentGRM.clone().invert().multiply( lParentGRSM );
		const lLSM = lScalingM;

		const lGlobalRS = new three.Matrix4();

		if ( inheritType === 0 ) {

			lGlobalRS.copy( lParentGRM ).multiply( lLRM ).multiply( lParentGSM ).multiply( lLSM );

		} else if ( inheritType === 1 ) {

			lGlobalRS.copy( lParentGRM ).multiply( lParentGSM ).multiply( lLRM ).multiply( lLSM );

		} else {

			const lParentLSM = new three.Matrix4().scale( new three.Vector3().setFromMatrixScale( lParentLX ) );
			const lParentLSM_inv = lParentLSM.clone().invert();
			const lParentGSM_noLocal = lParentGSM.clone().multiply( lParentLSM_inv );

			lGlobalRS.copy( lParentGRM ).multiply( lLRM ).multiply( lParentGSM_noLocal ).multiply( lLSM );

		}

		const lRotationPivotM_inv = lRotationPivotM.clone().invert();
		const lScalingPivotM_inv = lScalingPivotM.clone().invert();
		// Calculate the local transform matrix
		let lTransform = lTranslationM.clone().multiply( lRotationOffsetM ).multiply( lRotationPivotM ).multiply( lPreRotationM ).multiply( lRotationM ).multiply( lPostRotationM ).multiply( lRotationPivotM_inv ).multiply( lScalingOffsetM ).multiply( lScalingPivotM ).multiply( lScalingM ).multiply( lScalingPivotM_inv );

		const lLocalTWithAllPivotAndOffsetInfo = new three.Matrix4().copyPosition( lTransform );

		const lGlobalTranslation = lParentGX.clone().multiply( lLocalTWithAllPivotAndOffsetInfo );
		lGlobalT.copyPosition( lGlobalTranslation );

		lTransform = lGlobalT.clone().multiply( lGlobalRS );

		// from global to local
		lTransform.premultiply( lParentGX.invert() );

		return lTransform;

	}

	// Returns the three.js intrinsic Euler order corresponding to FBX extrinsic Euler order
	// ref: http://help.autodesk.com/view/FBX/2017/ENU/?guid=__cpp_ref_class_fbx_euler_html
	function getEulerOrder( order ) {

		order = order || 0;

		const enums = [
			'ZYX', // -> XYZ extrinsic
			'YZX', // -> XZY extrinsic
			'XZY', // -> YZX extrinsic
			'ZXY', // -> YXZ extrinsic
			'YXZ', // -> ZXY extrinsic
			'XYZ', // -> ZYX extrinsic
			//'SphericXYZ', // not possible to support
		];

		if ( order === 6 ) {

			console.warn( 'THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect.' );
			return enums[ 0 ];

		}

		return enums[ order ];

	}

	// Parses comma separated list of numbers and returns them an array.
	// Used internally by the TextParser
	function parseNumberArray( value ) {

		const array = value.split( ',' ).map( function ( val ) {

			return parseFloat( val );

		} );

		return array;

	}

	function convertArrayBufferToString( buffer, from, to ) {

		if ( from === undefined ) from = 0;
		if ( to === undefined ) to = buffer.byteLength;

		return new TextDecoder().decode( new Uint8Array( buffer, from, to ) );

	}

	function append( a, b ) {

		for ( let i = 0, j = a.length, l = b.length; i < l; i ++, j ++ ) {

			a[ j ] = b[ i ];

		}

	}

	function slice( a, b, from, to ) {

		for ( let i = from, j = 0; i < to; i ++, j ++ ) {

			a[ j ] = b[ i ];

		}

		return a;

	}

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
	  Land2["shore"] = "shore";
	  Land2["land"] = "land";
	  Land2["sand"] = "sand";
	  Land2["tundra"] = "tundra";
	  Land2["snow"] = "snow";
	  return Land2;
	})(Land || {});
	var LandColor = {
	  ["land" /* land */]: 8694355,
	  ["shore" /* shore */]: 5205120,
	  ["sea" /* sea */]: 2766476,
	  ["sand" /* sand */]: 11446117,
	  ["tundra" /* tundra */]: 16777215,
	  ["snow" /* snow */]: 16777215
	};
	var LandPriority = {
	  ["sea" /* sea */]: 0,
	  ["shore" /* shore */]: 1,
	  ["land" /* land */]: 2,
	  ["sand" /* sand */]: 3,
	  ["tundra" /* tundra */]: 3,
	  ["snow" /* snow */]: 3
	};
	var UnitActions = /* @__PURE__ */ ((UnitActions2) => {
	  UnitActions2["attack"] = "attack";
	  UnitActions2["walk"] = "walk";
	  UnitActions2["distanceAttack"] = "distanceAttack";
	  UnitActions2["death"] = "death";
	  UnitActions2["idle"] = "idle";
	  UnitActions2["defence"] = "defence";
	  return UnitActions2;
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

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;       // world-space (x,z) offset of this tile instance
attribute vec3 style;        // x = atlas cell index, y = modifier bitmask (reserved for hill/etc.), z = edge-blend priority
attribute vec3 neighborsA;   // atlas cell index of SE/S/SW neighbor (-1 = none)
attribute vec3 neighborsB;   // atlas cell index of NW/N/NE neighbor (-1 = none)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 shore
attribute vec3 neighborsKindB; // NW/N/NE

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

    float waterEdge = clamp(best.x, 0.0, 1.0);
    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0);
    float beachT = smoothstep(e0, 1.0, waterEdge);

    // overshoot slightly past waterLevel: the water layer's own rim rests
    // almost exactly at waterLevel too (its wave damps out towards its edge -
    // see water.vertex.ts), so without this gap the two meshes would be
    // near-coincident at the shore and z-fight (flickery dark patches). Sand
    // continuing a bit under shallow water is also how a real beach looks.
    float sinkY = beachT * waterLevel * 1.2;
    vec3 pos = vec3(offset.x + position.x, position.y + sinkY, offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // analytic slope of sinkY w.r.t. local (x,z), via the chain rule through
    // smoothstep, for lighting - see water.vertex.ts for the same idea applied
    // to waves. Only the single dominant edge direction is considered, which is
    // exact away from corners and a reasonable approximation right at them.
    float xN = clamp((waterEdge - e0) / (1.0 - e0), 0.0, 1.0);
    float dSmooth = waterEdge > 0.0 ? 6.0 * xN * (1.0 - xN) / (1.0 - e0) : 0.0;
    vec2 slope = waterLevel * 1.2 * dSmooth * (best.yz / apothem);
    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));

    vUV = uv;
    vBorder = clamp(length(local) / hexSize, 0.0, 1.0);
    vTerrain = style.x;
    vModifiers = style.y;
    vPriority = style.z;
    vBeachT = beachT;
    vTexCoord = cellIndexToUV(style.x);
    vNeighborsA = neighborsA;
    vNeighborsB = neighborsB;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
}
`;

	// src/shaders/terrain.fragment.ts
	var TERRAIN_FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D map;
uniform vec4 textureAtlasMeta;
uniform float sandAtlasIndex;

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
// edge, fading to 0 towards the opposite side of the hex.
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

    return mix(inputColor, neighborColor, clamp(factor, 0.0, 1.0));
}

void main() {
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

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;
attribute vec3 style;        // x = atlas cell index (unused here), y = modifiers, z = priority (0 = sea, 1 = shore)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 shore
attribute vec3 neighborsKindB; // NW/N/NE

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

void main() {
    vec2 worldXZ = offset + position.xz;
    vec3 hs = waveHeightAndSlope(worldXZ, uTime);

    // fade the wave out towards each tile's own rim so it never overlaps the
    // land mesh's beach slope at the coastline (no continuous ocean across
    // tiles, but no cracks/z-fighting against the shore either).
    float rim = clamp(length(position.xz) / hexSize, 0.0, 1.0);
    float damp = 1.0 - smoothstep(0.6, 1.0, rim);

    float waveY = hs.x * damp;
    vec2 slope = hs.yz * damp;

    vec3 pos = vec3(offset.x + position.x, waterLevel + waveY, offset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));
    vWorldPos = pos;

    vUV = uv;
    vBorder = clamp(length(position.xz) / hexSize, 0.0, 1.0);
    vPriority = style.z;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;

    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;
    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;
}
`;

	// src/shaders/water.fragment.ts
	var WATER_FRAGMENT_SHADER = `
precision highp float;

uniform vec4 textureAtlasMeta;

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

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);
const vec3 sparkleColor = vec3(1.0, 0.97, 0.85);
const vec3 skyTint = vec3(0.85, 0.95, 1.0);

// Picks the single strongest edge among the 6 whose neighbor both passes the
// one-directional priority gate and is itself water (a sea tile bordering a
// shallower shore tile), returning (bestFactor, kind). Mirrors the land
// shader's strongestWaterEdge() (see terrain.vertex.ts).
//
// Water deliberately does NOT also blend towards a "sand" color near land
// neighbors: the land layer already draws that transition itself (a real 3D
// beach slope down to waterLevel, see terrain.vertex.ts/fragment.ts's vBeachT) -
// water only needs to render its own flat shallow/deep color underneath it.
// An earlier version of this shader tried to *also* fade the water side to a
// sand tone at the coast, which reproducibly rendered as dark blotches right
// at the shoreline; the root cause wasn't pinned down despite ruling out the
// blend order, texture vs. flat color, specular/fresnel/grid, and mediump vs.
// highp precision - dropping the redundant blend sidesteps it entirely, and
// the land-side beach slope already covers this visually.
vec2 strongestWaterEdge(vec2 best, float kind, float priority, float factor) {
    if (kind < 0.5 || priority <= vPriority) return best;
    if (factor > best.x) return vec2(factor, kind);
    return best;
}

void main() {
    // self color: this mesh only ever contains sea (priority 0) / shore
    // (priority 1) tiles (see TerrainMesh's WATER_TYPES split), so vPriority
    // alone is enough to tell which one a given instance is.
    vec4 texColor = vec4(vPriority < 0.5 ? waterColorDeep : waterColorShallow, 1.0);

    // water-to-water (e.g. sea blending towards a shallower shore): blend once,
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

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;

	// src/objects/TerrainMesh.ts
	var WATER_TYPES = ["sea" /* sea */, "shore" /* shore */];
	var TerrainMesh = class extends three.Group {
	  constructor(map, options) {
	    super();
	    this.options = options;
	    this.tileIndex = /* @__PURE__ */ new Map();
	    this.atlasCellIndex = {};
	    this.clock = 0;
	    this.map = map;
	    this.waterAnimationEnabled = options.waterAnimation !== false;
	    this.buildAtlasCellIndex();
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
	    this.buildCitySprites();
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
	  //-1 no tile, 0 non-water, 1 sea, 2 shore - drives the land layer's beach
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
	      neighborsKindB: new Float32Array(tiles.length * 3)
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
	  buildLandLayer(tiles) {
	    if (tiles.length === 0) return;
	    const geometry = this.buildInstancedGeometry(tiles, 0);
	    tiles.forEach((tile, i) => this.tileIndex.set(`${tile.x},${tile.y}`, i));
	    this.landMaterial = new three.RawShaderMaterial({
	      uniforms: {
	        map: { value: this.loadAtlasTexture() },
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
	    this.waterMaterial = new three.RawShaderMaterial({
	      uniforms: {
	        uTime: { value: 0 },
	        waveAmplitude: { value: this.options.waterWaveAmplitude ?? 1.6 },
	        waveFrequency: { value: 0.045 * (this.options.waterWaveFrequency ?? 1) },
	        waveSpeed: { value: this.options.waterWaveSpeed ?? 1 },
	        sparkleIntensity: { value: this.options.waterSparkleIntensity ?? 1 },
	        fresnelIntensity: { value: this.options.waterFresnelIntensity ?? 1 },
	        waterColorDeep: { value: new three.Color(this.options.waterColorDeep ?? LandColor["sea" /* sea */]) },
	        waterColorShallow: { value: new three.Color(this.options.waterColorShallow ?? LandColor["shore" /* shore */]) },
	        ...this.commonUniforms()
	      },
	      vertexShader: WATER_VERTEX_SHADER,
	      fragmentShader: WATER_FRAGMENT_SHADER
	    });
	    this.waterMesh = new three.Mesh(geometry, this.waterMaterial);
	    this.waterMesh.frustumCulled = false;
	    this.add(this.waterMesh);
	  }
	  //Demo placeholder: labels sand tiles as a "city" (there's no dedicated city
	  //flag in TileInfo yet). Kept as-is from the previous Hex.ts behavior.
	  buildCitySprites() {
	    const { size } = this.options;
	    for (let x = 0; x < this.map.w; x++) {
	      for (let y = 0; y < this.map.h; y++) {
	        const tile = this.map.data[x]?.[y];
	        if (!tile || tile.type !== "sand" /* sand */) continue;
	        const center = getHexCenter(x, y, size);
	        const sprite = makeTextSprite(" City name ", {
	          fontsize: 32,
	          fontface: "Georgia",
	          borderColor: { r: 0, g: 0, b: 255, a: 0.8 }
	        });
	        sprite.position.set(center.x, Math.round(size / 5), center.y);
	        this.add(sprite);
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
	  //Index of a tile within the land layer's instanced attributes, for future
	  //point updates (e.g. HexMap.setTile) without rebuilding the whole geometry.
	  getInstanceIndex(x, y) {
	    return this.tileIndex.get(`${x},${y}`);
	  }
	  get mesh() {
	    return this.landMesh;
	  }
	};
	function createForest(map, options) {
	  const { size } = options;
	  const treesPerTile = options.treesPerTile ?? 20;
	  const treeSize = Math.max(1, Math.round(size / 10));
	  const woodTiles = [];
	  for (let x = 0; x < map.w; x++) {
	    for (let y = 0; y < map.h; y++) {
	      if (map.data[x]?.[y]?.wood) woodTiles.push({ x, y });
	    }
	  }
	  if (woodTiles.length === 0) return null;
	  const geometry = new three.ConeGeometry(1, 1, 6);
	  const material = new three.MeshLambertMaterial({ color: options.color ?? 746300 });
	  const mesh = new three.InstancedMesh(geometry, material, woodTiles.length * treesPerTile);
	  mesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
	  mesh.frustumCulled = false;
	  const polygon = HEXPolygon({ x: 0, y: 0 }, size - treeSize).map((p) => [p.x, p.y]);
	  const matrix = new three.Matrix4();
	  let instance = 0;
	  for (const tile of woodTiles) {
	    const center = getHexCenter(tile.x, tile.y, size);
	    const placed = [];
	    let attempts = 0;
	    while (placed.length < treesPerTile && attempts < treesPerTile * 20) {
	      attempts++;
	      const lx = getRandomInt(-size, size);
	      const ly = getRandomInt(-size, size);
	      if (pointInPolygon(polygon, [lx, ly]) !== -1) continue;
	      const overlaps = placed.some((p) => Math.abs(p.x - lx) < treeSize && Math.abs(p.y - ly) < treeSize);
	      if (overlaps) continue;
	      placed.push({ x: lx, y: ly });
	      const height = treeSize * getRandomInt(2, 5);
	      matrix.makeScale(treeSize, height, treeSize);
	      matrix.setPosition(center.x + lx, height / 2, center.y + ly);
	      mesh.setMatrixAt(instance, matrix);
	      instance++;
	    }
	  }
	  mesh.count = instance;
	  mesh.instanceMatrix.needsUpdate = true;
	  return mesh;
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
	  waterColorShallow: LandColor["shore" /* shore */],
	  waterColorDeep: LandColor["sea" /* sea */],
	  waterWaveAmplitude: 1.6,
	  waterWaveFrequency: 1,
	  waterWaveSpeed: 1,
	  waterSparkleIntensity: 1,
	  waterFresnelIntensity: 1,
	  beachWidth: 0.35
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
	      waterDepth: options.waterDepth ?? (options.size ?? DEFAULT_OPTIONS.size) * 0.25
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
	    const atlas = await fetch(atlasUrl).then((r) => r.json());
	    this.terrain = new TerrainMesh(mapData, {
	      size: this.options.size,
	      texturesBaseUrl: this.options.texturesBaseUrl,
	      atlas,
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
	      waterDepth: this.options.waterDepth,
	      beachWidth: this.options.beachWidth
	    });
	    this.scene.add(this.terrain);
	    const forest = createForest(mapData, { size: this.options.size, treesPerTile: this.options.treesPerTile });
	    if (forest) this.scene.add(forest);
	    this.emit("load", void 0);
	  }
	  getTile(x, y) {
	    return this.mapData?.data[x]?.[y];
	  }
	  get gridVisible() {
	    return this.terrain?.gridVisible ?? this.options.gridVisible;
	  }
	  set gridVisible(value) {
	    this.options.gridVisible = value;
	    if (this.terrain) this.terrain.gridVisible = value;
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
	    this.options = {
	      animateFrameRate: 50,
	      //Framerate: how much per second run animate function
	      animateSpeed: 1,
	      //Animate speed: how much seconds spend to move from 1 cell to second cell
	      size: 40,
	      //Map size to calculate unit position on map
	      type: "viking_boat",
	      //File name to load
	      format: "fbx",
	      //File format to load
	      x: 0,
	      y: 0,
	      scale: 0.15,
	      positionY: 4,
	      actions: new Array(),
	      id: "new id"
	    };
	    setOptions(this, options);
	  }
	  async setUnit() {
	    let response = await fetch(`Assets/units/${this.options.type}.json`);
	    if (response.ok) {
	      let data = await response.json();
	      setOptions(this, data);
	      switch (this.options.format) {
	        case "fbx":
	          this._unit = await this.fbxLoader();
	          break;
	        default:
	          console.log("Cant load unit file. Unsupported file format");
	      }
	      if (this._unit) {
	        this._unit.position.setY(this.options.positionY);
	        this._unit.scale.set(this.options.scale, this.options.scale, this.options.scale);
	        let position = getHexCenter(this.options.x, this.options.y, this.options.size);
	        this._unit.position.setX(position.x);
	        this._unit.position.setZ(position.y);
	      }
	    }
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
	      let point3ForRoute = new three.Vector3(position.x, 4, position.y);
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
	    this.needAnimate = true;
	    this.emit("start_move", { id: this.id, from: path[0], to: this.position, path });
	    this.animation(path.length);
	  }
	  async fbxLoader() {
	    let fileToLoad = `Assets/models/${this.options.type}.${this.options.format}`;
	    return new Promise((resolve, reject) => {
	      const fbxLoader = new FBXLoader();
	      fbxLoader.load(
	        fileToLoad,
	        (object) => {
	          resolve(object);
	        },
	        (xhr) => {
	          console.log(xhr.loaded / xhr.total * 100 + "% loaded");
	        },
	        (error) => {
	          reject(error);
	          console.log(error);
	        }
	      );
	    });
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
	        }
	        await wait(Math.floor(1e3 / this.options.animateFrameRate));
	      }
	      this.emit("end_move", { id: this.id, position: this.position });
	    }
	  }
	};

	// src/helpers/pathfinder.ts
	var PathFinder = class {
	  constructor(map, restricted) {
	    this.firstrowlong = false;
	    this.mapSizeX = map.w;
	    this.mapSizeY = map.h;
	    this.mapArray = map.data;
	    this.restricted = restricted;
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
	            if (openlist_g[node_x][node_y] < openlist_g[lowest_x][lowest_y]) {
	              parent_x[lowest_x][lowest_y] = node_x;
	              parent_y[lowest_x][lowest_y] = node_y;
	              openlist_g[lowest_x][lowest_y] = openlist_g[node_x][node_y] + 10;
	              openlist_f[lowest_x][lowest_y] = openlist_g[lowest_x][lowest_y] + openlist_h[lowest_x][lowest_y];
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
	    if (this.restricted[this.mapArray[x][y]["type"]] == false) {
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
	  // calculate distance between two hexes
	  hex_distance(x1, y1, x2, y2) {
	    let dx = Math.abs(x1 - x2);
	    let dy = Math.abs(y2 - y1);
	    return Math.sqrt(dx * dx + dy * dy);
	  }
	};

	// src/gameengine.ts
	var GameEngine = class extends EventEmitter {
	  constructor(options) {
	    super();
	    this._unitsList = {};
	    this.options = {
	      preventCellClick: true
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
	      this._map.add(unit.unit);
	      this._unitsList[unit.id] = unit;
	      this._mapData.data[unit.position.x][unit.position.y].unit = unit.id;
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
	  findPath(start, stop) {
	    const restrictions = {
	      sea: true,
	      shore: true,
	      land: false,
	      sand: true,
	      tundra: false,
	      snow: false
	    };
	    const pathFinder = new PathFinder(this._mapData, restrictions);
	    return pathFinder.find(start.x, start.y, stop.x, stop.y);
	  }
	};

	exports.EventEmitter = EventEmitter;
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
