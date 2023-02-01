module.exports = {
    mode: "development",
    entry: "./build/index.js",
    output: {
        path: __dirname + "/public/js",
        filename: "bundle.js",
        library: "bundle",
        libraryTarget: "commonjs"
    },
    externals: {
        "three": "three",
    }
}