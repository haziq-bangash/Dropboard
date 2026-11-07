import { defineConfig } from "tsup";

// Bundle everything: the distroless runtime image has no node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  noExternal: [/.*/],
  clean: true,
});
