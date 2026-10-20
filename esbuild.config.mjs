import { build } from "esbuild";
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2022",
  outfile: "main.js",
  banner: { js: "/* Canvas PDF Viewcard | MIT License */" },
});
