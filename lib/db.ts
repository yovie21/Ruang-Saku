import mysql, { type Pool, type PoolOptions } from "mysql2/promise";
import { randomUUID } from "crypto";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Parse mysql://user}:{password}@{host}:{port}/{db}
  const match = url.match(/^mysql:\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)$/);
  if (!match) throw new Error("Invalid DATABASE_URL format");
  const [, user, password, host, port, database] = match;

  const config: PoolOptions = {
    host,
    port: Number(port),
    user: decodeURIComponent(user),
    password: decodeURIComponent(password),
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: true }
  };
  pool = mysql.createPool(config);
  return pool;
}

export async function query<T = Record<string, unknown>[]>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

export async function execute(
  sql: string,
  params: (string | number | null)[] = []
): Promise<{ affectedRows: number; insertId: number }> {
  const [result] = await getPool().query(sql, params);
  const r = result as { affectedRows: number; insertId: number };
  return { affectedRows: r.affectedRows, insertId: r.insertId };
}

export function uuid(): string {
  return randomUUID();
}
