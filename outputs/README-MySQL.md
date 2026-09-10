# Menyiapkan MySQL Cloud untuk Ruang Saku

1. Buat database MySQL 8.0 atau yang lebih baru pada provider cloud Anda.
2. Impor [schema-mysql.sql](schema-mysql.sql) lewat SQL editor provider atau MySQL client.
3. Simpan kredensial sebagai environment variable di Vercel, jangan di file kode:

```env
DATABASE_URL="mysql://USERNAME:PASSWORD@HOST:3306/ruang_saku?sslaccept=strict"
```

Gunakan connection string yang diberikan provider Anda; parameter SSL tiap provider dapat berbeda.

## Aturan data penting

- Saldo akun tidak disimpan sebagai angka yang diedit langsung. Baca dari view `account_balances` agar selalu sesuai seluruh transaksi.
- Transfer antar akun dibuat sebagai dua transaksi dengan `transfer_group_id` sama: `transfer_out` pada akun asal dan `transfer_in` pada akun tujuan.
- Pengguna hanya boleh membaca data dengan `user_id` miliknya sendiri. Role `admin` dan `user` disimpan di `users.role`.
- Saat pengguna Google pertama kali login, buat satu baris `users`, satu `auth_accounts`, serta kategori bawaan miliknya.
