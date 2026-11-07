import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { PrismaClient } from "./generated/prisma/client";

export function allowedOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o && o !== "*");
}

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function createAuth(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: allowedOrigins(),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // Google sign-in appears only when both values are set
    socialProviders: googleEnabled()
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } }
      : {},
  });
}

export type Auth = ReturnType<typeof createAuth>;
