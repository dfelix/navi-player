// Used only by Jest (babel-jest), to turn ESM-only dependencies into CommonJS.
// The app itself is built by Vite.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }]],
};
