import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/babel-plugin.ts",
    "src/runtime.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["vite", "solid-js", "@babel/core"],
  outDir: "dist",
});
