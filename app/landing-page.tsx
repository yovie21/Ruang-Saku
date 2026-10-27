"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import "./landing.css";

const features = [
  { no: "01", title: "Lihat semuanya dalam satu layar.", text: "Saldo, akun, anggaran, dan target tabungan tersusun rapi sejak pertama masuk.", image: "/ruang-saku-beranda.jpg", accent: true },
  { no: "02", title: "Tambah akun tanpa ribet.", text: "Hubungkan dompet, rekening, atau akun lain agar setiap rupiah punya tempat.", image: "/ruang-saku-tambah-akun.jpg", accent: false },
  { no: "03", title: "Catat transaksi saat itu juga.", text: "Pemasukan dan pengeluaran tercatat jelas, lengkap dengan kategori dan catatan.", image: "/ruang-saku-pilih-transaksi.jpg", accent: true },
  { no: "04", title: "Jaga pengeluaran tetap terarah.", text: "Tetapkan batas anggaran dan lihat pemakaiannya sebelum kebablasan.", image: "/04-anggaran.jpg", accent: false },
  { no: "05", title: "Pantau ringkasan setelah mencatat.", text: "Kalender arus kas dan ringkasan membantu membaca kebiasaan finansialmu.", image: "/05-pantau-ringkasan.jpg", accent: true },
  { no: "06", title: "Bangun target yang terasa nyata.", text: "Simpan progres target tabungan sedikit demi sedikit dengan arah yang jelas.", image: "/06-buat-target.jpg", accent: false },
  { no: "07", title: "Transfer antar akun dengan mudah.", text: "Gerakkan dana dari satu akun ke akun lain tanpa konversi, cepat dan aman.", image: "/07-transfer-akun.jpg", accent: true },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallButton(false);
    }
    setInstallPrompt(null);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    document.querySelectorAll(".feature-reveal, .close-reveal").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing">
      <header className="land-nav">
        <Link href="/" className="land-brand" aria-label="Ruang Saku beranda">
          <Image src="/logo.svg" alt="" width={36} height={36} priority />
          <span>ruang<span>saku</span></span>
        </Link>
        <nav id="landing-navigation" className={`land-nav-links ${menuOpen ? "is-open" : ""}`} aria-label="Navigasi landing page">
          <a href="#cara-kerja" onClick={() => setMenuOpen(false)}>Cara kerja</a>
          <a href="#fitur" onClick={() => setMenuOpen(false)}>Fitur</a>
        </nav>
        <div className="land-nav-actions">
          {showInstallButton && (
            <button
              type="button"
              className="land-install-button"
              onClick={handleInstall}
              aria-label="Instal Ruang Saku"
            >
              Instal aplikasi
            </button>
          )}
          <Link href="/login" className="land-hero-cta">Masuk</Link>
          <button
            type="button"
            className="land-menu-button"
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen(open => !open)}
          >
            <span className="sr-only">{menuOpen ? "Tutup menu" : "Buka menu"}</span>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="land-hero" aria-labelledby="hero-title">
        <div className="land-copy hero-reveal">
          <p className="land-kicker">RUANG KECIL UNTUK HAL YANG PENTING</p>
          <h1 id="hero-title"><span className="text-reveal-left">Uangmu punya arah.</span><br /><em><span className="text-reveal-right">Kamu punya kendali.</span></em></h1>
          <p className="land-lede">Catat pemasukan, pantau pengeluaran, dan susun rencana keuangan tanpa membuat semuanya terasa rumit.</p>
          <div className="land-actions">
            <Link href="/login" className="land-button cta-primary">Mulai mencatat</Link>
            <a href="#cara-kerja" className="land-text-link">Lihat cara kerjanya</a>
          </div>
          <p className="land-note">Gratis untuk mulai. Data keuanganmu tetap milikmu.</p>
        </div>
        <div className="land-visual hero-reveal" aria-label="Pratinjau dashboard Ruang Saku">
          <div className="land-visual-label"><span>RUANG SAKU / BERANDA</span><span>01 / 06</span></div>
          <Image className="land-screenshot" src="/ruang-saku-beranda.jpg" alt="Dashboard beranda Ruang Saku" width={1200} height={760} priority />
          <div className="land-caption"><span>Semua yang penting, langsung terlihat.</span><span className="land-mark">ruangsaku</span></div>
        </div>
      </section>

      <section className="land-intro" id="cara-kerja" aria-labelledby="intro-title">
        <p className="land-kicker">DIBUAT UNTUK KEHIDUPAN SEHARI-HARI</p>
        <h2 id="intro-title">Keuangan yang lebih jelas,<br /><em>hari-hari yang lebih tenang.</em></h2>
        <p>Tidak perlu spreadsheet rumit. Mulai dari satu catatan, lalu biarkan gambaran besarnya terbentuk.</p>
      </section>

      <section className="land-features" id="fitur" aria-label="Fitur Ruang Saku">
        {features.map((feature, index) => (
          <article key={feature.no} className={`land-feature feature-reveal ${feature.accent ? "feature-accent" : ""} ${index === 0 || index === 4 ? "land-feature-main" : "land-feature-side"}`} style={{ "--anim-delay": `${Math.min(index * 70, 280)}ms` } as CSSProperties}>
            <div className="land-feature-copy">
              <span className="land-feature-no">LANGKAH {feature.no}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
            <div className="land-feature-image">
              <figure>
                <Image src={feature.image} alt={`${feature.title} di aplikasi Ruang Saku`} width={1200} height={760} loading="lazy" />
                <figcaption>{feature.title}</figcaption>
              </figure>
            </div>
          </article>
        ))}
      </section>

      <section className="land-close close-reveal" aria-labelledby="close-title">
        <div>
          <p className="land-kicker">MULAI DARI CATATAN PERTAMA</p>
          <h2 id="close-title">Beri keuanganmu<br /><em>tempat yang lebih jelas.</em></h2>
        </div>
        <Link href="/login" className="land-button">Coba Ruang Saku</Link>
      </section>

      <footer className="land-footer">
        <Link href="/" className="land-brand"><Image src="/logo.svg" alt="" width={30} height={30} /><span>ruang<span>saku</span></span></Link>
        <span>Catat dengan tenang. Rencanakan dengan jelas.</span>
        <Link href="/login">Masuk ke aplikasi</Link>
      </footer>
    </main>
  );
}
