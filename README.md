<div align="center">

<h1>💰 Ruang Saku</h1>

<p><em>Aplikasi pencatat keuangan pribadi yang ramping, modern, dan siap produksi.</em></p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=nextdotjs)](https://nextjs.org/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?logo=vercel)](https://vercel.com/)
[![Live Site](https://img.shields.io/badge/Live_Site-ruang-saku-peach-0052CC?logo=vercel)](https://ruang-saku-peach.vercel.app/)
![GitHub top language](https://img.shields.io/github/languages/top/yovie21/Ruang-Saku)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MySQL](https://img.shields.io/badge/Database-MySQL-4479A1?logo=mysql)](https://www.mysql.com/)
[![NextAuth.js](https://img.shields.io/badge/Auth-NextAuth.js-111?logo=nextauth)](https://next-auth.js.org/)
[![Vercel Speed Insights](https://img.shields.io/badge/Speed_Insights-Enabled-0052CC?logo=vercel)](https://vercel.com/docs/speed-insights)

</div>

---

<p align="center">
  <a href="#fitur">Fitur</a> •
  <a href="#teknologi">Teknologi</a> •
  <a href="#instalasi">Instalasi</a> •
  <a href="#deploy">Deploy</a> •
  <a href="#kontribusi">Kontribusi</a>
</p>

<p align="center">
  <a href="https://ruang-saku-peach.vercel.app">Lihat Demo →</a>
</p>

---

## ✨ Fitur

### 🔐 **Keamanan & Privasi**
- 🔑 **PIN 4–6 digit** untuk mengunci aplikasi setiap sesi
- 🖐️ **Biometrik** (sidik jari / wajah / Windows Hello) dengan WebAuthn
- 🛡️ **Privacy Mode** — sembunyikan nominal dengan satu tap
- 🔒 **Google OAuth** dengan role-based access (admin/user)

### 💸 **Manajemen Keuangan Lengkap**
- 📊 **Dashboard real-time** — saldo, pemasukan, pengeluaran, tren 30 hari
- 📝 **Transaksi** — income, expense, transfer, dengan filter & pencarian
- 🏦 **Multi-akun** — bank, e-wallet, tunai dengan saldo terbuka
- 💎 **Category management** — custom kategori dengan warna & usage stats
- 📈 **Anggaran bulanan** — warning & over-budget alerts
- 🎯 **Goal & Tabungan** — target jumlah dengan alokasi & riwayat
- 🔄 **Jadwal Rutin** — recurring transactions otomatis
- 💸 **Transfer antar-akun** — split transaksi
- 🏚️ **Utang & Piutang** — tracking cicilan & sisa
- 📊 **Laporan bulanan** — rekapitulasi dengan grafik & export CSV
- 📄 **PDF Report** — generate PDF langsung di browser
- 📸 **OCR Receipt Scanning** — baca struk via Tesseract.js

### 🎨 **UI/UX**
- 🌙 **Light & Dark mode** — auto-detect & persistent theme
- 📱 **PWA-ready** — installable, offline-capable, service worker
- 🧭 **Navigation sidebar** — beranda, transaksi, akun
- 🔔 **Browser Push Notifications** — notifikasi budget jebol
- 🎨 **Custom color palette** — design system internal

---

## 🛠️ Teknologi

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 14](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Auth** | [NextAuth.js](https://next-auth.js.org/) + Google OAuth |
| **Database** | [MySQL](https://www.mysql.com/) (cloud) |
| **Styling** | Custom CSS + Tailwind-ready |
| **OCR** | [Tesseract.js](https://github.com/naptha/tesseract.js) |
| **PDF** | [jsPDF](https://github.com/parallax/jsPDF) |
| **Hosting** | [Vercel](https://vercel.com/) |
| **Analytics** | [Vercel Speed Insights](https://vercel.com/docs/speed-insights) |
| **CI/CD** | GitHub Actions |

---

## ⚡ Vercel Speed Insights

Monitoring performa otomatis via [Vercel Speed Insights](https://vercel.com/docs/speed-insights).

- ✅ Core Web Vitals tracking
- ✅ FCP, LCP, CLS, INP monitoring
- ✅ Development mode excluded
- ✅ Auto-injected via `<SpeedInsights />` component

![Speed Insights](https://vercel.com/metrics/badge/ruang-saku?template=standard)

---

## 🚀 Instalasi

### Prasyarat
- [Node.js](https://nodejs.org/) ≥ 18
- [MySQL](https://www.mysql.com/) database
- [Google Cloud Console](https://console.cloud.google.com/) account (untuk OAuth)

### Clone & Setup

```bash
git clone https://github.com/yovie21/Ruang-Saku.git
cd Ruang-Saku

# Install dependencies
npm install

# Salin env file
cp .env.example .env.local
```

### Konfigurasi `.env.local`

```env
# Database
DATABASE_URL="mysql://user:pass@host:port/ruang_saku_db"
DB_HOST="localhost"
DB_USER="root"
DB_PASSWORD="password"
DB_PORT="3307"
DB_NAME="ruang_saku_db"

# NextAuth
NEXTAUTH_SECRET="generate-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_URL="https://your-domain.vercel.app"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Vercel Speed Insights (dapatkan dari Vercel Dashboard)
VERCEL_SPEED_INSIGHTS_ID=""
```

### Jalankan

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

---

## 🚢 Deploy ke Vercel

1. Push ke GitHub repository ini.
2. Impor repository dari [Vercel Dashboard](https://vercel.com/new).
3. Vercel mendeteksi Next.js otomatis → klik **Deploy**.
4. Tambahkan semua environment variables di **Project Settings > Environment Variables**.
5. Aktifkan **Speed Insights** di dashboard Vercel.

Atau gunakan CLI:

```bash
npx vercel --prod
```

---

## 📁 Struktur Proyek

```
Ruang-Saku/
├── app/
│   ├── page.tsx              # Dashboard utama
│   ├── layout.tsx            # Root layout + SpeedInsights
│   ├── login/                # Halaman login
│   ├── admin/                # Panel admin (role-based)
│   ├── api/                  # REST API routes
│   │   ├── accounts/
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── budgets/
│   │   ├── goals/
│   │   ├── recurring/
│   │   ├── splits/
│   │   ├── debts/
│   │   ├── transfers/
│   │   └── admin/
│   ├── globals.css           # Global styles
│   ├── providers.tsx         # Session provider
│   └── theme.tsx             # Theme & PWA install
├── lib/
│   ├── auth.ts               # Auth utilities
│   ├── db.ts                 # Database connection
│   ├── session.ts            # Session helpers
│   └── recurring.ts          # Recurring logic
├── public/                   # Static assets
├── .github/                  # GitHub configs
│   ├── workflows/            # CI/CD pipelines
│   └── ISSUE_TEMPLATE/       # Issue templates
├── outputs/                  # PRD, schema, docs
├── package.json
└── tsconfig.json
```

---

## 🔄 CI/CD Pipeline

![Build Status](https://github.com/yovie21/Ruang-Saku/actions/workflows/deploy.yml/badge.svg)

GitHub Actions otomatis menjalankan:
- **Lint & Typecheck** → setiap push/pull request
- **Build Test** → verifikasi build berhasil
- **Auto Deploy** → deploy ke Vercel setelah push ke `main`

---

## 🤝 Kontribusi

Kontribusi sangat diterima! Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan.

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

---

<p align="center">
  Dibuat dengan ❤️ oleh <a href="https://github.com/yovie21">yovie21</a>
</p>
