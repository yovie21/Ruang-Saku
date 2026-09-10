# Ruang Saku

Aplikasi pencatatan keuangan pribadi berbasis Next.js, dirancang siap untuk Vercel.

## Jalankan lokal

```bash
npm install
npm run dev
```

## Deploy ke Vercel

1. Push folder ini ke repositori GitHub.
2. Impor repositori dari dashboard Vercel.
3. Vercel mendeteksi Next.js otomatis; klik **Deploy**.

Atau gunakan CLI: `npx vercel --prod` setelah login ke akun Vercel.

## Login Google dan role

1. Salin `.env.example` menjadi `.env.local` lalu isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `NEXTAUTH_SECRET`.
2. Di Google Cloud Console, buat OAuth Client bertipe **Web Application** dan tambahkan redirect URI `http://localhost:3000/api/auth/callback/google` serta `https://domain-anda.vercel.app/api/auth/callback/google`. URI harus sama persis, termasuk `https`, domain, dan path.
3. Isi `NEXTAUTH_URL` dengan URL dasar aplikasi, misalnya `https://domain-anda.vercel.app`, tanpa `/api/auth/callback/google`.
4. Masukkan email administrator ke `ADMIN_EMAILS`. Email lain yang masuk lewat Google otomatis berperan sebagai `user`.
5. Di Vercel, tambahkan variabel yang sama pada **Project Settings > Environment Variables** sebelum deploy.
