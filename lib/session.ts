import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { query } from "./db";

export async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const rows = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = ?",
    [session.user.email]
  );
  return rows.length > 0 ? rows[0].id : null;
}

export async function requireUser(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new Error("Unauthorized");
  return id;
}

export async function requireAdmin(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new Error("Unauthorized");
  const rows = await query<{ role: string }>("SELECT role FROM users WHERE id = ?", [id]);
  if (rows.length === 0 || rows[0].role !== "admin") throw new Error("Forbidden");
  return id;
}
