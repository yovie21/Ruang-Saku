import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { apiLimiter } from "@/lib/ratelimit";

export const maxDuration = 30; // 30 detik batas waktu serverless

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]);
  }
  return JSON.parse(cleaned);
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();

    const { allowed } = apiLimiter(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan. Tunggu sebentar." },
        { status: 429, headers: { "retry-after": "60" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { image, categories } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "Gambar struk tidak valid atau kosong." },
        { status: 400 }
      );
    }

    const apiUrl = (process.env.AI_VISION_URL || "https://hermuse-9router-backup.pages.dev/v1").replace(/\/$/, "");
    const apiKey = process.env.AI_VISION_KEY || process.env.GEMINI_API_KEY || "";
    const model = process.env.AI_VISION_MODEL || "hermes";

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI Vision belum dikonfigurasi di server (AI_VISION_KEY kosong)." },
        { status: 503 }
      );
    }

    const categoryList = Array.isArray(categories) && categories.length > 0
      ? categories.join(", ")
      : "Makan & Minum, Kebutuhan Pribadi, Tagihan, Transportasi, Hiburan, Belanja, Kesehatan, Sedekah, Lainnya";

    const prompt = `Analisis gambar struk / nota / bon / kwitansi / bukti transfer pembayaran ini secara seksama.
Kertas nota bisa berupa struk kasir thermal (Indomaret/Alfamart/SPBU/Cafe), kwitansi tulisan tangan, bon warung, atau tangkapan layar m-banking / QRIS.

Instruksi:
1. "merchant": Nama toko / tempat usaha / penjual / penerima transfer yang tertera. Jika tulisan tangan atau nama toko tidak tertulis, buat deskripsi ringkas yang masuk akal (contoh: "Warung Makan", "Toko Bangunan", "Bensin SPBU").
2. "total": Nominal akhir (TOTAL / GRAND TOTAL / TOTAL TAGIHAN / JUMLAH BAYAR) yang harus dibayar.
   - PENTING: Jangan ambil uang tunai yang diserahkan pembeli (misal bayar 100.000 dengan kembali 30.000, maka totalnya 70000).
   - Jangan ambil angka barcode/nomor telepon/nomor nota/kembalian.
   - Kembalikan angka integer murni (contoh: 45000).
3. "date": Tanggal transaksi dalam format "YYYY-MM-DD". Jika format tanggal tertera DD/MM/YYYY atau tulisan tangan bulan singkat, konversikan ke "YYYY-MM-DD". Jika tahun hanya 2 digit (misal 26), jadikan 2026. Jika tidak terbaca, kosongkan "".
4. "category": Pilih satu nama kategori yang paling sesuai dari daftar berikut: [${categoryList}].
5. "items": Daftar singkat 1-5 nama barang/layanan utama yang dibeli jika terbaca jelas (contoh: ["Kopi Susu", "Roti Coklat"]).

Balas HANYA teks JSON valid murni tanpa formatting markdown atau penjelasan lain, dengan format:
{
  "merchant": "Nama Toko / Tempat",
  "total": 45000,
  "date": "YYYY-MM-DD",
  "category": "Kategori Pilihan",
  "items": ["Item 1", "Item 2"]
}`;

    const endpoint = `${apiUrl}/chat/completions`;
    const payload = {
      model,
      stream: false,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } }
          ]
        }
      ]
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "User-Agent": "RuangSaku-AI-Vision/1.0"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[AI Vision] API Error:", res.status, errText);
      return NextResponse.json(
        { error: `Layanan AI Vision error (${res.status}).` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    
    if (!content) {
      return NextResponse.json(
        { error: "AI tidak mengembalikan hasil analisis gambar." },
        { status: 500 }
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(content);
    } catch (e) {
      console.error("[AI Vision] Gagal parse JSON:", content);
      return NextResponse.json(
        { error: "Format respons AI tidak valid." },
        { status: 500 }
      );
    }

    const merchant = typeof parsed.merchant === "string" && parsed.merchant.trim()
      ? parsed.merchant.trim().slice(0, 80)
      : "Pengeluaran";

    let total = 0;
    if (typeof parsed.total === "number" && !isNaN(parsed.total)) {
      total = Math.round(parsed.total);
    } else if (typeof parsed.total === "string") {
      const num = parseInt(parsed.total.replace(/[^\d]/g, "") || "0", 10);
      if (!isNaN(num)) total = num;
    }

    const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : "";

    const category = typeof parsed.category === "string" ? parsed.category.trim() : "";
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(it => String(it).trim()).filter(Boolean).slice(0, 5)
      : [];

    return NextResponse.json({
      success: true,
      data: {
        merchant,
        total,
        date,
        category,
        items
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === "Unauthorized") {
      return NextResponse.json({ error: "Sesi habis, silakan login ulang." }, { status: 401 });
    }
    console.error("[AI Vision] Unexpected error:", error);
    return NextResponse.json({ error: "Gagal memproses struk." }, { status: 500 });
  }
}
