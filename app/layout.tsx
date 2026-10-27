import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { ThemeProvider } from "./theme";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://ruangsakuapp.vercel.app"),
  title: "Aplikasi Catatan Keuangan Pribadi | Ruang Saku",
  description: "Catat pemasukan dan pengeluaran harian, pantau saldo, atur anggaran, dan susun target tabungan dengan aplikasi keuangan pribadi Ruang Saku.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ruang Saku" },
  keywords: ["aplikasi pencatat keuangan", "catatan keuangan pribadi", "aplikasi pengatur keuangan", "catat pengeluaran harian", "atur anggaran bulanan", "aplikasi keuangan gratis", "rekam transaksi", "catatan pengeluaran bulanan", "budget tracker indonesia"],
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    title: "Aplikasi Catatan Keuangan Pribadi | Ruang Saku",
    description: "Catat pemasukan dan pengeluaran, pantau saldo, dan susun anggaran bulanan di Ruang Saku.",
    type: "website",
    url: "https://ruangsakuapp.vercel.app",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Ruang Saku, aplikasi catatan keuangan pribadi",
        type: "image/svg+xml"
      }
    ],
    siteName: "Ruang Saku"
  },
  twitter: {
    card: "summary_large_image",
    site: "@yovie21",
    title: "Aplikasi Catatan Keuangan Pribadi | Ruang Saku",
    description: "Catat pemasukan dan pengeluaran, pantau saldo, dan susun anggaran bulanan di Ruang Saku.",
    images: ["/og-image.svg"]
  },
  alternates: { canonical: "https://ruangsakuapp.vercel.app/" },
  category: "finance",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1513" },
    { media: "(prefers-color-scheme: light)", color: "#fbfcfa" }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "Ruang Saku",
              "url": "https://ruangsakuapp.vercel.app",
              "logo": "https://ruangsakuapp.vercel.app/logo.svg",
              "description": "Aplikasi keuangan pribadi untuk mencatat pengeluaran, target tabungan, dan rekap transaksi.",
              "sameAs": ["https://www.instagram.com/ruangsakuapp", "https://twitter.com/yovie21"],
              "founder": { "@type": "Person", "name": "Yovie Muhammad" },
              "contactPoint": { "@type": "ContactPoint", "contactType": "Customer Support", "url": "https://ruangsakuapp.vercel.app" }
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "HowTo",
              "name": "Cara Menggunakan Ruang Saku",
              "description": "6 langkah mudah menggunakan Ruang Saku untuk mengelola keuangan pribadi.",
              "step": [
                {
                  "@type": "HowToStep",
                  "position": 1,
                  "name": "Lihat semuanya dalam satu layar",
                  "description": "Saldo, akun, anggaran, dan target tabungan tersusun rapi sejak pertama masuk.",
                  "image": {
                    "@type": "ImageObject",
                    "url": "https://ruangsakuapp.vercel.app/ruang-saku-beranda.jpg",
                    "width": 1200,
                    "height": 760
                  }
                },
                {
                  "@type": "HowToStep",
                  "position": 2,
                  "name": "Tambah akun tanpa ribet",
                  "description": "Hubungkan dompet, rekening, atau akun lain agar setiap rupiah punya tempat.",
                  "image": {
                    "@type": "ImageObject",
                    "url": "https://ruangsakuapp.vercel.app/ruang-saku-tambah-akun.jpg",
                    "width": 1200,
                    "height": 760
                  }
                },
                {
                  "@type": "HowToStep",
                  "position": 3,
                  "name": "Catat transaksi saat itu juga",
                  "description": "Pemasukan dan pengeluaran tercatat jelas, lengkap dengan kategori dan catatan.",
                  "image": {
                    "@type": "ImageObject",
                    "url": "https://ruangsakuapp.vercel.app/ruang-saku-pilih-transaksi.jpg",
                    "width": 1200,
                    "height": 760
                  }
                },
                {
                  "@type": "HowToStep",
                  "position": 4,
                  "name": "Jaga pengeluaran tetap terarah",
                  "description": "Tetapkan batas anggaran dan lihat pemakaiannya sebelum kebablasan.",
                  "image": {
                    "@type": "ImageObject",
                    "url": "https://ruangsakuapp.vercel.app/04-anggaran.jpg",
                    "width": 1200,
                    "height": 760
                  }
                },
                {
                  "@type": "HowToStep",
                  "position": 5,
                  "name": "Pantau ringkasan setelah mencatat",
                  "description": "Kalender arus kas dan ringkasan membantu membaca kebiasaan finansialmu.",
                  "image": {
                    "@type": "ImageObject",
                    "url": "https://ruangsakuapp.vercel.app/05-pantau-ringkasan.jpg",
                    "width": 1200,
                    "height": 760
                  }
                },
                {
                  "@type": "HowToStep",
                  "position": 6,
                  "name": "Bangun target yang terasa nyata",
                  "description": "Simpan progres target tabungan sedikit demi sedikit dengan arah yang jelas.",
                  "image": {
                    "@type": "ImageObject",
                    "url": "https://ruangsakuapp.vercel.app/06-buat-target.jpg",
                    "width": 1200,
                    "height": 760
                  }
                }
              ]
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "Apakah Ruang Saku gratis?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Ya, Ruang Saku sepenuhnya gratis untuk mulai. Data keuangan Anda tetap milik Anda dan tidak dijual ke pihak ketiga."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Bagaimana cara memulai menggunakan Ruang Saku?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Daftar dengan email, tambahkan akun atau dompet Anda, lalu mulai mencatat pemasukan dan pengeluaran harian. Semua data terlihat dalam satu dashboard."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Apakah data saya aman di Ruang Saku?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Ya. Kami mengenkripsi data Anda dan hanya Anda yang dapat mengaksesnya. Data tidak dibagikan ke pihak ketiga tanpa persetujuan Anda."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Fitur apa saja yang ada di Ruang Saku?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Ruang Saku memiliki 6 fitur utama: dashboard ringkasan, manajemen akun, pencatatan transaksi, pengaturan anggaran, analisis arus kas, dan target tabungan."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Bisakah saya menghubungkan rekening bank saya?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Ya, Anda dapat menambahkan rekening bank, dompet digital, dan akun lainnya untuk melacak semua uang Anda di satu tempat."
                  }
                },
                {
                  "@type": "Question",
                  "name": "Bagaimana cara menetapkan target tabungan?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Klik fitur target tabungan, masukkan nama target, nominal yang ingin dicapai, dan tanggal target. Ruang Saku akan membantu Anda melacak progres."
                  }
                }
              ]
            })
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("ruang-saku-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`
          }}
        />
      </head>
      <body>
        <Providers>
          <ThemeProvider>{children}</ThemeProvider>
        </Providers>
        <script
           dangerouslySetInnerHTML={{
             __html: `if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}`
           }}
         />
        <SpeedInsights />
      </body>
    </html>
  );
}
