"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type User = {
  id: string; email: string; name: string | null;
  role: string; created_at: string;
  account_count: number; transaction_count: number;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.role !== "admin") return;
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(data => { setUsers(data); setLoading(false); });
  }, [session]);

  async function toggleRole(id: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "user" : "admin";
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role: newRole })
    });
    setUsers(u => u.map(x => x.id === id ? { ...x, role: newRole } : x));
  }

  if (status === "loading" || loading) return <main className="auth-page"><p style={{margin:"auto"}}>Memuat…</p></main>;
  if (session?.user?.role !== "admin") return <main className="auth-page"><p style={{margin:"auto"}}>Akses ditolak. Halaman ini hanya untuk admin.</p></main>;

  return <main className="admin-page">
    <header className="admin-header">
      <div>
        <p className="eyebrow">PANEL ADMINISTRATOR</p>
        <h1>Kelola Pengguna</h1>
        <p>Total {users.length} pengguna terdaftar di Ruang Saku.</p>
      </div>
      <a href="/" className="back-link">← Kembali ke aplikasi</a>
    </header>
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr><th>Nama</th><th>Email</th><th>Role</th><th>Akun</th><th>Transaksi</th><th>Bergabung</th><th>Aksi</th></tr>
        </thead>
        <tbody>
          {users.map(u => <tr key={u.id}>
            <td>{u.name ?? <i style={{color:"#9aa5a2"}}>Tanpa nama</i>}</td>
            <td>{u.email}</td>
            <td><span className={"role-badge " + u.role}>{u.role}</span></td>
            <td>{u.account_count}</td>
            <td>{u.transaction_count}</td>
            <td>{new Date(u.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</td>
            <td>
              <button className="role-toggle" onClick={() => toggleRole(u.id, u.role)}>
                {u.role === "admin" ? "Turunkan ke user" : "Naikkan ke admin"}
              </button>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </main>;
}
