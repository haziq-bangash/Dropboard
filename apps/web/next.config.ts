import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const config = (phase: string): NextConfig => ({
  // The dev server gets its own output folder, so a production build (e2e, Docker) can never clobber it
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  output: "standalone",
  // Do not generate an AGENTS.md file into the repo when the dev server starts
  agentRules: false,
  // Trace from the monorepo root so workspace packages are included in the standalone build
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
  transpilePackages: ["@dropboard/spec", "@dropboard/engine"],
});

export default config;
