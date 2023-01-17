module.exports = {
    mode: "development",
    entry: "./build/index.js",
    output: {
        path: __dirname + "/public/js",
        filename: "three-hex-map.js",
        library: "three-hex-map",
        libraryTarget: "commonjs"
    },
    externals: {
        "three": "three"
    }
}