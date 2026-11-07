import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  // Do not generate an AGENTS.md file into the repo when the dev server starts
  agentRules: false,
  // Trace from the monorepo root so workspace packages are included in the standalone build
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
  transpilePackages: ["@dropboard/spec", "@dropboard/engine"],
};

export default config;
