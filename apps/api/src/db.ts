import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

/** Create a Prisma client over a small pg pool. Connections open lazily on first query. */
export function createPrisma(connectionString: string | undefined = process.env.DATABASE_URL) {
  // Keep the pool small: Cloud Run scales out, and managed Postgres has low connection limits.
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
