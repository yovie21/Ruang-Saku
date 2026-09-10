# PRD: Ruang Saku

## 1. Ringkasan Produk

Ruang Saku adalah aplikasi web pencatatan keuangan pribadi untuk membantu pengguna memahami kondisi kas harian melalui transaksi, akun keuangan, anggaran, dan ringkasan yang mudah dibaca. Produk ditujukan untuk individu Indonesia dengan mata uang utama Rupiah.

## 2. Masalah yang Diselesaikan

- Pengguna sulit mengetahui saldo sebenarnya karena uang tersebar pada beberapa rekening dan tunai.
- Pemasukan serta pengeluaran harian sering tidak tercatat pada saat terjadi.
- Pengguna tidak memiliki gambaran kategori pengeluaran dan batas anggaran bulanan.

## 3. Sasaran dan Metrik

- Pengguna dapat mencatat transaksi kurang dari 15 detik.
- Saldo total dan saldo tiap akun selalu berubah sesuai transaksi.
- Pengguna dapat melihat pemasukan, pengeluaran, dan sisa anggaran periode berjalan.
- Aktivasi: pengguna membuat minimal satu akun dan satu transaksi pada sesi pertama.

## 4. Pengguna Utama

Individu yang menerima pendapatan, memakai rekening bank/e-wallet/tunai, dan ingin mengelola uang pribadi tanpa alur akuntansi yang rumit.

## 5. Ruang Lingkup MVP

### Dashboard
- Sapaan tanggal, total saldo lintas akun, pemasukan, serta pengeluaran bulan berjalan.
- Daftar aktivitas terbaru dengan filter semua, pemasukan, dan pengeluaran.
- Ringkasan progres anggaran.

### Akun Keuangan
- Membuat, mengubah, menonaktifkan akun bank, e-wallet, kartu, dan tunai.
- Menyimpan saldo awal dan menampilkan saldo terkini per akun.
- Total saldo dihitung dari seluruh akun aktif.

### Transaksi
- Tambah pemasukan atau pengeluaran dengan nama, nominal, tanggal, akun, serta kategori.
- Saat transaksi disimpan, saldo akun bertambah untuk pemasukan dan berkurang untuk pengeluaran.
- Riwayat dapat difilter menurut jenis, periode, akun, dan kategori.
- Edit/hapus transaksi harus mengoreksi saldo akun secara atomik.

### Kategori dan Anggaran
- Kategori bawaan: makan/minum, transportasi, belanja, tagihan, kesehatan, hiburan, pendidikan, pemasukan, dan lainnya.
- Pengguna dapat membuat kategori serta anggaran bulanan per kategori.
- Peringatan saat penggunaan anggaran mencapai 80% dan 100%.

### Laporan
- Ringkasan bulanan, tren pemasukan/pengeluaran, komposisi kategori, dan ekspor CSV.

## 6. Kebutuhan Nonfungsional

- Mobile-first, responsif dari 360px hingga desktop.
- Bahasa Indonesia dan format Rupiah (`id-ID`).
- Aksesibilitas: label form, fokus keyboard jelas, kontras memadai.
- Data pengguna dipisahkan per akun dan diamankan melalui autentikasi.
- Target performa: halaman dashboard interaktif dalam kurang dari 2,5 detik pada koneksi 4G normal.

## 7. Arsitektur Rekomendasi

- **Frontend:** Next.js App Router, TypeScript, CSS modular/design token.
- **Backend:** Next.js Route Handlers atau Supabase untuk autentikasi dan PostgreSQL.
- **Deploy:** Vercel dengan preview deployment dari pull request dan production dari branch utama.
- **Data inti:** `users`, `accounts`, `categories`, `transactions`, `budgets`.

## 7.1 Autentikasi dan Otorisasi

- Pendaftaran dan masuk memakai Google OAuth; akun dibuat saat pengguna pertama kali masuk.
- Role default adalah `user`.
- Role `admin` ditetapkan hanya dari daftar email administrator pada environment variable, bukan dari layar pendaftaran.
- User hanya dapat membaca serta mengubah data keuangannya sendiri. Admin dapat mengakses halaman administrasi dan pengelolaan pengguna setelah backend database ditambahkan.

## 8. Aturan Bisnis Penting

- Nominal transaksi selalu positif; tipe transaksi menentukan arah saldo.
- Transfer antar akun dicatat sebagai dua mutasi yang tertaut agar saldo total tidak berubah.
- Saldo akun = saldo awal + total pemasukan - total pengeluaran + transfer masuk - transfer keluar.
- Penghapusan akun ditolak bila masih memiliki transaksi; akun dapat diarsipkan.

## 9. Tahapan Berikutnya

1. Tambahkan autentikasi, database, dan persistensi transaksi.
2. Implementasi transfer, transaksi berulang, notifikasi anggaran, serta laporan lengkap.
3. Tambahkan pengujian unit untuk kalkulasi saldo dan e2e untuk alur pencatatan transaksi.
