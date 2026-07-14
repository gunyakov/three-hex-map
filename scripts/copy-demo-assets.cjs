// Copies the built engine (dist/hex-map.global.js, a plain UMD/global bundle -
// see rollup.config.global.mjs) and its browser-side peer dependencies
// (three.js, dat.gui, stats.js) into public/, so public/index.html can load
// all of them as separate <script> files with no bundler involved for the
// demo page itself.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const copies = [
    ["dist/hex-map.global.js", "public/js/hex-map.global.js"],
    ["dist/hex-map.global.js.map", "public/js/hex-map.global.js.map"],
    ["node_modules/three/build/three.module.js", "public/js/vendor/three.module.js"],
    ["node_modules/three/build/three.core.js", "public/js/vendor/three.core.js"],
    ["node_modules/dat.gui/build/dat.gui.module.js", "public/js/vendor/dat.gui.module.js"],
    ["node_modules/dat.gui/build/dat.gui.css", "public/js/vendor/dat.gui.css"],
    // src/Stats.js (not the build/ dir) is the one that's an actual ES module
    // (`export { Stats as default }`) - matches how three/dat.gui are loaded
    // here, unlike build/stats.min.js which is a UMD bundle expecting a global.
    ["node_modules/stats.js/src/Stats.js", "public/js/vendor/stats.module.js"]
];

fs.mkdirSync(path.join(root, "public/js/vendor"), { recursive: true });

for (const [from, to] of copies) {
    fs.copyFileSync(path.join(root, from), path.join(root, to));
    console.log(`copied ${from} -> ${to}`);
}
