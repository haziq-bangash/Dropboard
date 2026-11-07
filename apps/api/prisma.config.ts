import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Only needed for CLI commands (migrate); `generate` works without a database.
    url: process.env.DATABASE_URL ?? "postgres://dropboard:dropboard@localhost:5432/dropboard",
  },
});
