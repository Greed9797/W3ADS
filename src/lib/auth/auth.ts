import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { logAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/prisma";

const providers: NextAuthConfig["providers"] = [];

if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  );
}

async function safeLogAudit(input: Parameters<typeof logAudit>[0]) {
  try {
    await logAudit(input);
  } catch {
    // Audit failures must not block auth callbacks.
  }
}

const authSecret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "adstart-w3-local-development-secret");

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret,
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers,
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await safeLogAudit({
          action: "auth.login",
          userId: user.id,
          resourceType: "user",
          resourceId: user.id,
        });
      }
    },
    async signOut(message) {
      const sessionToken =
        "session" in message ? message.session?.sessionToken : message.token?.jti;

      if (sessionToken) {
        await safeLogAudit({
          action: "auth.logout",
          metadata: { sessionToken },
        });
      }
    },
  },
});
