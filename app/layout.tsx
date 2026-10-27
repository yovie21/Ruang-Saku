import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { ThemeProvider } from "./theme";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://ruang-saku-peach.vercel.app"),
  title: "Ruang Saku | Rekam Keuangan Pribadi",
  description: "Catat keuangan pribadi dengan lebih tenang. Kelola pengeluaran, target tabungan, dan rekap transaksi.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ruang Saku" },
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
    title: "Ruang Saku — Aplikasi Keuangan Pribadi",
    description: "Catat keuangan pribadi dengan lebih tenang. Kelola pengeluaran, target tabungan, dan rekap transaksi.",
    type: "website",
    url: "https://ruang-saku-peach.vercel.app",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Ruang Saku",
        type: "image/svg+xml"
      }
    ],
    siteName: "Ruang Saku"
  },
  twitter: {
    card: "summary_large_image",
    site: "@yovie21",
    title: "Ruang Saku — Aplikasi Keuangan Pribadi",
    description: "Catat keuangan pribadi dengan lebih tenang. Kelola pengeluaran, target tabungan, dan rekap transaksi.",
    images: ["/og-image.svg"]
  },
  robots: "index, follow",
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
              "@type": "SoftwareApplication",
              "name": "Ruang Saku",
              "alternateName": "Ruang Saku — Rekam Keuangan Pribadi",
              "description": "Aplikasi keuangan pribadi untuk mencatat pengeluaran, target tabungan, dan rekap transaksi.",
              "url": "https://ruang-saku-peach.vercel.app",
              "applicationCategory": "FinancialApplication",
              "operatingSystem": "Web",
              "offers": { "@type": "Offer", "price": "0", "priceCurrency": "IDR" },
              "author": { "@type": "Person", "name": "Yovie Muhammad" },
              "featureList": [
                "Catat transaksi pengeluaran",
                "Target tabungan",
                "Laporan bulanan",
                "Pengelolaan target tabungan"
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
