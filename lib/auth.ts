import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { query, execute, uuid } from "./db";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const DEFAULT_CATEGORIES: { name: string; type: "income" | "expense" }[] = [
  { name: "Makan & Minum", type: "expense" },
  { name: "Transportasi", type: "expense" },
  { name: "Belanja", type: "expense" },
  { name: "Tagihan", type: "expense" },
  { name: "Kesehatan", type: "expense" },
  { name: "Hiburan", type: "expense" },
  { name: "Pendidikan", type: "expense" },
  { name: "Pemasukan", type: "income" },
  { name: "Lainnya", type: "expense" }
];

interface GoogleProfile {
  email: string;
  name?: string | null;
  picture?: string | null;
  sub?: string;
}

async function syncUser(profile: GoogleProfile): Promise<"admin" | "user"> {
  const email = profile.email.toLowerCase();
  const rows = await query<{ id: string; role: "admin" | "user" }>(
    "SELECT id, role FROM users WHERE email = ?",
    [email]
  );

  if (rows.length > 0) {
    await execute(
      "UPDATE users SET name = ?, image = ?, updated_at = NOW() WHERE id = ?",
      [profile.name ?? null, profile.picture ?? null, rows[0].id]
    );
    const isAdmin = adminEmails.includes(email);
    if (isAdmin && rows[0].role !== "admin") {
      await execute("UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = ?", [rows[0].id]);
    }
    if (profile.sub) {
      await execute(
        `INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, updated_at)
         VALUES (?, ?, 'google', ?, NOW())
         ON DUPLICATE KEY UPDATE updated_at = NOW()`,
        [uuid(), rows[0].id, profile.sub]
      );
    }
    return isAdmin ? "admin" : rows[0].role;
  }

  const userId = uuid();
  const role = adminEmails.includes(email) ? "admin" : "user";
  await execute(
    `INSERT INTO users (id, email, name, image, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [userId, email, profile.name ?? null, profile.picture ?? null, role]
  );
  if (profile.sub) {
    await execute(
      `INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, created_at, updated_at)
       VALUES (?, ?, 'google', ?, NOW(), NOW())`,
      [uuid(), userId, profile.sub]
    );
  }
  for (const cat of DEFAULT_CATEGORIES) {
    await execute(
      `INSERT INTO categories (id, user_id, name, type, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, TRUE, NOW(), NOW())`,
      [uuid(), userId, cat.name, cat.type]
    );
  }
  return role;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
    })
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const p = profile as unknown as GoogleProfile;
        const role = await syncUser({
          email: p.email ?? token.email ?? "",
          name: p.name,
          picture: p.picture,
          sub: p.sub
        });
        token.role = role;
        token.email = p.email ?? token.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.role = token.role === "admin" ? "admin" : "user";
      return session;
    }
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" }
};
