import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { PrismaClient } from "./generated/prisma/client";
import type { Mailer } from "./mail/mailer";
import { confirmEmailChange, resetPassword, verifyEmail } from "./mail/templates";

export function allowedOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o && o !== "*");
}

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * With a mailer: new accounts must confirm their email before signing in, and people can reset a forgotten password.
 * Without one, both stay off, so nobody gets locked out of an account they cannot confirm.
 */
export function createAuth(prisma: PrismaClient, mailer?: Mailer) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: allowedOrigins(),
    // Behind Cloud Run the client address arrives in X-Forwarded-For; without it every user shares one rate-limit bucket
    advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: Boolean(mailer),
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      ...(mailer && {
        sendResetPassword: async ({ user, url }) => {
          // not awaited: the response must not reveal whether the address has an account
          void mailer.send(resetPassword(user.email, url)).catch((e) => console.error("reset email failed:", e.message));
        },
      }),
    },
    ...(mailer && {
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        expiresIn: 60 * 60 * 24,
        sendVerificationEmail: async ({ user, url }) => {
          void mailer.send(verifyEmail(user.email, url)).catch((e) => console.error("verification email failed:", e.message));
        },
      },
    }),
    user: {
      // Deleting an account removes everything under it: projects and links go with the user, the rest is cleared here
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await prisma.aiGeneration.deleteMany({ where: { userId: user.id } });
          await prisma.verification.deleteMany({ where: { identifier: user.email } });
        },
      },
      // Changing an email needs mail to confirm it, so it is offered only when email is configured
      changeEmail: mailer
        ? {
            enabled: true,
            sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
              void mailer.send(confirmEmailChange(user.email, newEmail, url)).catch((e) => console.error("email change failed:", e.message));
            },
          }
        : { enabled: false },
    },
    // Google sign-in appears only when both values are set
    socialProviders: googleEnabled()
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } }
      : {},
  });
}

export type Auth = ReturnType<typeof createAuth>;
