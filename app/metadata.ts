import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ruang Saku | Keuangan Pribadi",
  description:
    "Catat keuangan pribadi dengan lebih tenang. Kelola pengeluaran, target tabungan, dan rekap transaksi secara mudah di aplikasi Ruang Saku.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ruang Saku" },
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Ruang Saku — Aplikasi Keuangan Pribadi",
    description:
      "Catat keuangan pribadi dengan lebih tenang. Kelola pengeluaran, target tabungan, dan rekap transaksi.",
    type: "website",
    url: "https://ruang-saku-peach.vercel.app",
    images: [
      {
        url: "https://ruang-saku-peach.vercel.app/og-image.svg",
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
    images: ["https://ruang-saku-peach.vercel.app/og-image.svg"],
  },
};

export const dynamicMetadata: Metadata = {
  title: {
    default: "Ruang Saku | Keuangan Pribadi",
    template: "%s | Ruang Saku",
  },
};
