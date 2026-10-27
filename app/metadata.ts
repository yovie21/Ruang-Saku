import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ruang Saku — Rekam Keuangan Pribadi",
  description:
    "Aplikasi keuangan pribadi Ruang Saku. Catat pengeluaran, atur target tabungan, dan lihat rekap bulanan sangat mudah. Mulai catat keuanganmu sekarang.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ruang Saku" },
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Ruang Saku — Aplikasi Keuangan Pribadi",
    description:
      "Catat keuangan pribadi dengan lebih tenang. Kelola pengeluaran, target tabungan, dan rekap transaksi secara mudah di aplikasi Ruang Saku.",
    type: "website",
    url: "https://ruangsakuapp.vercel.app",
    images: [
      {
        url: "https://ruangsakuapp.vercel.app/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Ruang Saku",
      },
    ],
    siteName: "Ruang Saku",
  },
  twitter: {
    card: "summary_large_image",
    site: "@yovie21",
    title: "Ruang Saku — Aplikasi Keuangan Pribadi",
    description:
      "Catat keuangan pribadi dengan lebih tenang. Kelola pengeluaran, target tabungan, dan rekap transaksi.",
    images: ["https://ruangsakuapp.vercel.app/og-image.svg"],
  },
};

export const dynamicMetadata: Metadata = {
  title: {
    default: "Ruang Saku | Rekam Keuangan Pribadi",
    template: "%s | Ruang Saku",
  },
};
