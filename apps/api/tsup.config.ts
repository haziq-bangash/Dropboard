import { defineConfig } from "tsup";

// Bundle everything: the distroless runtime image has no node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  noExternal: [/.*/],
  clean: true,
  // CommonJS dependencies (pg) call require() on Node built-ins; provide it inside the ESM bundle.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
