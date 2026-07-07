
import { Texture, SpriteMaterial, Sprite } from "three";

//A THREE.Sprite is always centered on its own position - the label used to
//look off-center because the canvas backing its texture was left at the
//browser's default size (300x150) instead of being sized to the actual
//content, so the drawn box only filled the canvas's top-left corner while the
//sprite's centered quad mapped the *entire* (mostly empty) canvas onto the
//tile. Sizing the canvas to the content fixes that. `transparent: true` also
//stops the sprite's empty canvas background from being drawn as an opaque
//(visible) quad.
export function makeTextSprite( message:string, parameters:any ):Sprite
{
	if ( parameters === undefined ) parameters = {};

	let fontface = parameters.hasOwnProperty("fontface") ?
		parameters["fontface"] : "Arial";

	let fontsize = parameters.hasOwnProperty("fontsize") ?
		parameters["fontsize"] : 18;

	let borderThickness = parameters.hasOwnProperty("borderThickness") ?
		parameters["borderThickness"] : 4;

	let borderColor = parameters.hasOwnProperty("borderColor") ?
		parameters["borderColor"] : { r:0, g:0, b:0, a:1.0 };

	let backgroundColor = parameters.hasOwnProperty("backgroundColor") ?
		parameters["backgroundColor"] : { r:255, g:255, b:255, a:1.0 };

	let canvas:HTMLCanvasElement = document.createElement('canvas');
	let context:CanvasRenderingContext2D = canvas.getContext('2d');
	context.font = "Bold " + fontsize + "px " + fontface;

	// get size data (height depends only on font size)
	let metrics = context.measureText( message );
	let textWidth = metrics.width;

	// size the canvas to the actual content (instead of the 300x150 default)
	// so the sprite's centered quad matches the visible box exactly.
	const width = Math.ceil(textWidth + borderThickness * 2);
	const height = Math.ceil(fontsize * 1.4 + borderThickness * 2);
	canvas.width = width;
	canvas.height = height;

	// resizing the canvas resets its 2D context state, so re-apply the font
	context = canvas.getContext('2d');
	context.font = "Bold " + fontsize + "px " + fontface;

	// background color
	context.fillStyle   = "rgba(" + backgroundColor.r + "," + backgroundColor.g + ","
								  + backgroundColor.b + "," + backgroundColor.a + ")";
	// border color
	context.strokeStyle = "rgba(" + borderColor.r + "," + borderColor.g + ","
								  + borderColor.b + "," + borderColor.a + ")";

	context.lineWidth = borderThickness;
	roundRect(context, borderThickness/2, borderThickness/2, textWidth + borderThickness, fontsize * 1.4 + borderThickness, 6);
	// 1.4 is extra height factor for text below baseline: g,j,p,q.

	// text color
	context.fillStyle = "rgba(0, 0, 0, 1.0)";

	context.fillText( message, borderThickness, fontsize + borderThickness);

	// canvas contents will be used for a texture
	var texture = new Texture(canvas)
	texture.needsUpdate = true;

	var spriteMaterial = new SpriteMaterial(
		{ map: texture, transparent: true, depthWrite: false } );
	var sprite = new Sprite( spriteMaterial );

	// keep the same pixels-to-world-units scale the fixed 100x50 used to have
	// (100 world units per 300px-wide default canvas), but derived from the
	// canvas's real size so the label isn't stretched/squished.
	const scale = 100 / 300;
	sprite.scale.set(width * scale, height * scale, 1.0);
	return sprite;
}

// function for drawing rounded rectangles
function roundRect(ctx:CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number) 
{
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
    ctx.fill();
	ctx.stroke();   
}