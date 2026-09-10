"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return <main className="auth-page"><section className="auth-copy"><div className="brand"><img className="brand-mark-img" src="/logo.svg" alt="Ruang Saku" width={34} height={34} /><span>ruang<span>saku</span></span></div><p className="eyebrow">KEUANGAN YANG LEBIH TENANG</p><h1>Setiap rupiah punya tempatnya.</h1><p>Masuk untuk mencatat, memantau saldo, dan membangun kebiasaan finansial yang lebih baik.</p><div className="auth-dots"><i /><i /><i /></div></section><section className="auth-panel"><div className="auth-box"><p className="eyebrow">SELAMAT DATANG</p><h2>Masuk ke Ruang Saku</h2><p className="auth-subtitle">Gunakan akun Google untuk melanjutkan. Akun baru akan dibuat otomatis.</p><button className="google-button" onClick={() => signIn("google", { callbackUrl: "/" })}><span className="google-g">G</span><span>Lanjutkan dengan Google</span></button><p className="auth-note">Dengan melanjutkan, Anda menyetujui kebijakan privasi dan ketentuan layanan Ruang Saku.</p></div></section></main>;
}
