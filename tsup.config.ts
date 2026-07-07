import { defineConfig } from "tsup";

// ESM + CJS build for bundlers/Node. three.js is a peerDependency and stays
// external here — consumers supply their own copy. The browser <script> global
// build (dist/hex-map.global.js, with "three" mapped to window.THREE) is
// produced by a second pass with Rollup, see rollup.config.global.mjs.
//
// dts is generated separately via `tsc -p tsconfig.build.json` (see package.json's
// build:lib script), not tsup's built-in `dts: true`: tsup's dts bundler
// (rollup-plugin-dts) unconditionally injects a `baseUrl` compiler option, which
// TypeScript 6 now hard-errors on (baseUrl is deprecated) - a tsup/TS6
// incompatibility as of tsup 8.5.1, not something in our own tsconfig.
export default defineConfig({
    entry: { "hex-map": "src/index.ts" },
    format: ["esm", "cjs"],
    outDir: "dist",
    dts: false,
    sourcemap: true,
    clean: true,
    splitting: false,
    external: ["three"],
    outExtension({ format }) {
        return { js: format === "esm" ? ".mjs" : ".js" };
    }
});
