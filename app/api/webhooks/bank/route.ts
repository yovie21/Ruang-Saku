import { NextResponse } from "next/server";
import { query, execute, uuid } from "@/lib/db";

export const maxDuration = 30;

function parseRupiahNumber(raw: string): number {
  if (!raw) return 0;
  let str = raw.trim();
  // Hilangkan desimal sen nol di akhir (,00 atau .00)
  str = str.replace(/[,.]00$/, "");
  // Hapus semua karakter selain angka
  const clean = str.replace(/[^\d]/g, "");
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
}

function parseRegexTransaction(text: string, title = ""): {
  amount: number;
  type: "income" | "expense";
  note: string;
  detectedBank: string;
} {
  const combined = `${title} ${text}`.trim();
  const lower = combined.toLowerCase();

  // 1. Deteksi Bank / Dompet Digital
  let detectedBank = "";
  if (/mandiri|livin|bmri/i.test(combined)) detectedBank = "mandiri";
  else if (/seabank/i.test(combined)) detectedBank = "seabank";
  else if (/bca|mybca/i.test(combined)) detectedBank = "bca";
  else if (/brimo|bri/i.test(combined)) detectedBank = "bri";
  else if (/wondr|bni/i.test(combined)) detectedBank = "bni";
  else if (/gopay|gojek/i.test(combined)) detectedBank = "gopay";
  else if (/ovo/i.test(combined)) detectedBank = "ovo";
  else if (/dana/i.test(combined)) detectedBank = "dana";
  else if (/shopee|spay/i.test(combined)) detectedBank = "shopee";

  // 2. Deteksi Jenis (Income vs Expense)
  const isIncome = /(?:dana masuk|menerima transfer|transfer masuk|kamu menerima|diterima|kredit|top up berhasil|cashback|bunga tabungan|refund|terima uang|penerimaan|setoran tunai|uang masuk)/i.test(lower);
  const type: "income" | "expense" = isIncome ? "income" : "expense";

  // 3. Deteksi Nominal Rupiah
  let amount = 0;
  const amountPatterns = [
    /(?:rp\.?|idr)\s*([\d.,]{3,})/i,
    /sebesar\s+(?:rp\.?|idr)?\s*([\d.,]{3,})/i,
    /nominal\s+(?:rp\.?|idr)?\s*([\d.,]{3,})/i,
    /(?:berhasil|sukses)\s+(?:sebesar\s+)?(?:rp\.?|idr)?\s*([\d.,]{3,})/i,
    /([\d.,]{3,})\s*(?:berhasil|sukses)/i
  ];

  for (const regex of amountPatterns) {
    const match = combined.match(regex);
    if (match && match[1]) {
      const parsed = parseRupiahNumber(match[1]);
      if (parsed > 0 && parsed < 500_000_000) {
        amount = parsed;
        break;
      }
    }
  }

  // 4. Deteksi Nama Toko / Keterangan
  let note = "";
  const merchantMatch =
    combined.match(/(?:di|merchant)\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+sebesar|\s+berhasil|\s+sukses|\.|$)/i) ||
    combined.match(/(?:transfer ke|ke rek|ke rekening)\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+sebesar|\s+berhasil|\.|$)/i) ||
    combined.match(/(?:a\.?n\.?|atas nama)\s+([A-Za-z\s]{2,30}?)(?:\s+sebesar|\s+berhasil|\.|$)/i) ||
    combined.match(/(?:pembayaran|tagihan)\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+sebesar|\s+berhasil|\.|$)/i);

  if (merchantMatch && merchantMatch[1]) {
    note = merchantMatch[1].trim().replace(/\s+/g, " ");
  } else if (title) {
    note = title.trim();
  } else {
    note = type === "income" ? "Dana Masuk Otomatis" : "Transaksi Bank Otomatis";
  }

  return { amount, type, note, detectedBank };
}

// Fallback AI jika format notifikasi bank tidak standar / regex gagal
async function parseWithAi(text: string, title = ""): Promise<{
  amount: number;
  type: "income" | "expense";
  note: string;
  detectedBank: string;
}> {
  const apiUrl = (process.env.AI_VISION_URL || "https://hermuse-9router-backup.pages.dev/v1").replace(/\/$/, "");
  const apiKey = process.env.AI_VISION_KEY || process.env.GEMINI_API_KEY || "";
  const model = process.env.AI_VISION_MODEL || "hermes";

  if (!apiKey) {
    return parseRegexTransaction(text, title);
  }

  const prompt = `Analisis isi teks notifikasi bank HP berikut ini:
"${title ? `Judul: ${title}\n` : ""}Isi: ${text}"

Tugas:
1. "amount": Angka nominal uang dalam integer Rupiah (contoh: 50000). Jangan 0 jika ada nominal uang.
2. "type": "expense" (jika uang keluar, belanja, bayar, transfer ke orang) atau "income" (jika uang masuk, terima transfer, gaji, cashback).
3. "note": Nama tempat belanja / toko / penerima / merchant / deskripsi singkat transaksi (contoh: "Kopi Kenangan", "Indomaret", "Transfer ke Budi").
4. "bank": Nama bank jika ada (contoh: "mandiri", "bca", "seabank", "bri", "gopay", dll).

Balas HANYA JSON:
{"amount": 50000, "type": "expense", "note": "Nama Toko / Penerima", "bank": "mandiri"}`;

  try {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return parseRegexTransaction(text, title);

    const raw = await res.text();
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return parseRegexTransaction(text, title);

    const parsed = JSON.parse(match[0]);
    const amount = typeof parsed.amount === "number" ? parsed.amount : parseRupiahNumber(String(parsed.amount || 0));
    const type = parsed.type === "income" ? "income" : "expense";
    const note = typeof parsed.note === "string" ? parsed.note.trim() : (title || "Transaksi Bank");
    const detectedBank = typeof parsed.bank === "string" ? parsed.bank.toLowerCase() : "";

    return { amount, type, note, detectedBank };
  } catch {
    return parseRegexTransaction(text, title);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Token webhook tidak disertakan. Tambahkan ?token=YOUR_TOKEN" },
      { status: 401 }
    );
  }

  const userRows = await query<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE webhook_token = ?",
    [token]
  );

  if (userRows.length === 0) {
    return NextResponse.json({ error: "Token webhook tidak valid." }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    message: `Webhook aktif untuk ${userRows[0].name}. Endpoint siap menerima notifikasi POST dari MacroDroid!`
  });
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const authHeader = req.headers.get("authorization") || req.headers.get("x-webhook-token") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    let body: Record<string, unknown> = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formText = await req.text();
      const params = new URLSearchParams(formText);
      body = Object.fromEntries(params.entries());
    } else {
      const rawText = await req.text().catch(() => "");
      if (rawText) body = { text: rawText };
    }

    const token =
      searchParams.get("token") ||
      bearerToken ||
      (typeof body.token === "string" ? body.token : "");

    if (!token) {
      return NextResponse.json(
        { error: "Token webhook tidak disertakan. Gunakan ?token=YOUR_TOKEN atau header x-webhook-token" },
        { status: 401 }
      );
    }

    // 1. Cari user pemilik token
    const userRows = await query<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE webhook_token = ?",
      [token]
    );

    if (userRows.length === 0) {
      return NextResponse.json({ error: "Token webhook tidak valid." }, { status: 401 });
    }

    const user = userRows[0];

    // 2. Ekstrak teks notifikasi
    const title = String(body.title || body.subject || searchParams.get("title") || "").trim();
    const text = String(
      body.text ||
      body.message ||
      body.body ||
      body.content ||
      searchParams.get("text") ||
      ""
    ).trim();
    const app = String(body.app || body.package || searchParams.get("app") || "").toLowerCase();

    if (!text && !title) {
      return NextResponse.json(
        { error: "Teks atau judul notifikasi tidak boleh kosong." },
        { status: 400 }
      );
    }

    // 3. Parsing notifikasi (Cepat via Regex lebih dulu)
    let parsed = parseRegexTransaction(text, title);
    if (!parsed.detectedBank && app) {
      if (/mandiri|livin|bmri/.test(app)) parsed.detectedBank = "mandiri";
      else if (/seabank/.test(app)) parsed.detectedBank = "seabank";
      else if (/bca|mybca/.test(app)) parsed.detectedBank = "bca";
      else if (/bri|brimo/.test(app)) parsed.detectedBank = "bri";
      else if (/bni|wondr/.test(app)) parsed.detectedBank = "bni";
      else if (/gojek|gopay/.test(app)) parsed.detectedBank = "gopay";
      else if (/ovo/.test(app)) parsed.detectedBank = "ovo";
      else if (/dana/.test(app)) parsed.detectedBank = "dana";
      else if (/shopee/.test(app)) parsed.detectedBank = "shopee";
    }

    // Jika regex belum menemukan nominal, gunakan fallback AI
    if (parsed.amount <= 0) {
      parsed = await parseWithAi(text, title);
    }

    if (parsed.amount <= 0) {
      return NextResponse.json({
        success: false,
        error: "Nominal transaksi tidak terdeteksi dalam notifikasi ini.",
        received: { title, text }
      }, { status: 422 });
    }

    // 4. Hubungkan ke Akun Bank Pengguna
    const accounts = await query<{ id: string; name: string; account_type: string }>(
      "SELECT id, name, account_type FROM accounts WHERE user_id = ? AND is_archived = FALSE",
      [user.id]
    );

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: "Pengguna belum memiliki akun bank di Ruang Saku. Buat akun terlebih dahulu." },
        { status: 400 }
      );
    }

    let targetAccount = accounts[0];
    if (parsed.detectedBank) {
      const match = accounts.find(a =>
        a.name.toLowerCase().includes(parsed.detectedBank) ||
        (a.account_type === "ewallet" && ["gopay", "ovo", "dana", "shopee"].includes(parsed.detectedBank))
      );
      if (match) targetAccount = match;
    }

    // 5. Pencegahan Duplikasi (Notifikasi sama dalam 3 menit terakhir)
    const recentTx = await query<{ id: string }>(
      `SELECT id FROM transactions 
       WHERE user_id = ? AND account_id = ? AND amount = ? AND type = ? 
         AND created_at >= NOW() - INTERVAL 3 MINUTE 
       LIMIT 1`,
      [user.id, targetAccount.id, parsed.amount, parsed.type]
    );

    if (recentTx.length > 0) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: "Notifikasi ini sudah pernah dicatat sebelumnya (duplikat diabaikan).",
        data: {
          existingId: recentTx[0].id,
          amount: parsed.amount,
          account: targetAccount.name
        }
      });
    }

    // 6. Hubungkan Kategori Transaksi
    const categories = await query<{ id: string; name: string }>(
      "SELECT id, name FROM categories WHERE user_id = ? AND type = ? AND is_archived = FALSE",
      [user.id, parsed.type]
    );

    let targetCategoryId: string | null = null;
    const noteLower = `${parsed.note} ${title} ${text}`.toLowerCase();

    if (categories.length > 0) {
      const categoryKeywordMap: Record<string, string[]> = {
        "makan": ["kopi", "cafe", "warung", "resto", "makan", "bakso", "mie", "sate", "food", "ayam", "bebek", "snack"],
        "belanja": ["indomaret", "alfamart", "superindo", "hypermart", "mart", "pasar", "toko", "mall", "belanja"],
        "transportasi": ["spbu", "pertamina", "shell", "bp", "gojek", "goride", "gocar", "grab", "maxim", "bensin", "parkir", "tol", "toll", "tiket"],
        "tagihan": ["pln", "listrik", "pdam", "air", "bpjs", "indihome", "wifi", "telkom", "pulsa", "paket data", "asuransi"],
        "kesehatan": ["apotek", "obat", "dokter", "rs", "klinik", "kimia farma", "k24"]
      };

      for (const cat of categories) {
        const catNameLower = cat.name.toLowerCase();
        for (const [key, keywords] of Object.entries(categoryKeywordMap)) {
          if (catNameLower.includes(key) && keywords.some(kw => noteLower.includes(kw))) {
            targetCategoryId = cat.id;
            break;
          }
        }
        if (targetCategoryId) break;
      }

      // Jika belum cocok, gunakan kategori pertama bila ada
      if (!targetCategoryId && categories.length > 0) {
        targetCategoryId = categories[0].id;
      }
    }

    // 7. Simpan Transaksi Otomatis ke Database
    const txId = uuid();
    await execute(
      `INSERT INTO transactions 
        (id, user_id, account_id, category_id, type, amount, transaction_date, note)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
      [txId, user.id, targetAccount.id, targetCategoryId, parsed.type, parsed.amount, parsed.note]
    );

    console.log(
      `[Webhook Bank] Berhasil catat: ${user.name} • ${targetAccount.name} • ${parsed.type} Rp ${parsed.amount} • "${parsed.note}"`
    );

    return NextResponse.json({
      success: true,
      message: "Transaksi berhasil dicatat otomatis di Ruang Saku!",
      data: {
        id: txId,
        account: targetAccount.name,
        type: parsed.type,
        amount: parsed.amount,
        note: parsed.note,
        date: new Date().toISOString().split("T")[0]
      }
    });
  } catch (error: unknown) {
    console.error("[Webhook Bank Error]", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal pemrosesan webhook." }, { status: 500 });
  }
}
