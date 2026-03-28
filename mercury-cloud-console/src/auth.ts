import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        const db = getDb();
        const row = (await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1))[0];
        if (!row || !row.passwordHash) return null;
        const ok = await bcrypt.compare(password, row.passwordHash);
        if (!ok) return null;
        return { id: row.id, email: row.email, role: row.role };
      },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 14,
  },
  callbacks: {
    async signIn({ user, account }) {
      // Only handle OAuth providers here; Credentials is handled in authorize()
      if (account?.provider !== "google") return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const db = getDb();
      const existing = (await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1))[0];
      if (existing) {
        // Link to existing account — carry over id and role
        user.id = existing.id;
        (user as { role?: string }).role = existing.role;
      } else {
        // Create new OAuth-only account (no password)
        const id = crypto.randomUUID();
        await db.insert(users)
          .values({ id, email, passwordHash: null, createdAt: new Date().toISOString() });
        user.id = id;
        (user as { role?: string }).role = "user";
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        if (token.email) session.user.email = token.email as string;
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
});
