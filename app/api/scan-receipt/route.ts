import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { apiLimiter } from "@/lib/ratelimit";

export const maxDuration = 30; // 30 detik batas waktu serverless

function parseNominal(val: unknown): number {
  if (typeof val === "number" && !isNaN(val)) return Math.round(val);
  if (typeof val !== "string") return 0;
  let str = val.trim();
  // Hilangkan desimal nol seperti ,00 atau .00
  str = str.replace(/[,.]00$/, "");
  const clean = str.replace(/[^\d]/g, "");
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
}

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

    const prompt = `Analisis gambar struk / nota / bon belanja / kwitansi / bukti pembayaran ini dengan sangat teliti.

Tugas utamamu:
1. "merchant": Nama toko, supermarket, warung, atau tempat usaha (contoh: "ASSALAAM HYPERMARKET", "Indomaret", "Alfamart", "SPBU", dll).
2. "total": NOMINAL TOTAL AKHIR RUPIAH yang harus dibayar.
   - WAJIB CARI angka nominal total belanja/tagihan (biasanya berlabel TOTAL, TOTAL HARGA, TOTAL BELANJA, GRAND TOTAL, TAGIHAN, JUMLAH, SUBTOTAL, atau angka rupiah terbesar sebelum baris CASH/TUNAI/KEMBALI).
   - Di struk supermarket (seperti Assalaam Hypermarket, Super Indo, Hypermart), periksa baris TOTAL di bawah daftar barang belanjaan.
   - JANGAN kembalikan 0 jika ada angka harga/nominal yang tertera.
   - Hapus titik/koma/Rp dan kembalikan angka integer murni (contoh: 87500).
3. "date": Tanggal transaksi dalam format "YYYY-MM-DD" (contoh: "2026-10-30").
4. "category": Pilih satu nama kategori yang paling sesuai dari daftar berikut: [${categoryList}].
5. "items": Daftar singkat 1-5 nama barang/layanan utama yang dibeli jika terbaca jelas.

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

    // 1. Cek semua variasi key yang mungkin dihasilkan model AI
    let total = parseNominal(
      parsed.total ??
      parsed.amount ??
      parsed.nominal ??
      parsed.grand_total ??
      parsed.grandTotal ??
      parsed.total_bayar ??
      parsed.total_belanja ??
      parsed.total_harga ??
      parsed.total_amount ??
      parsed.subtotal ??
      parsed.Total ??
      parsed.TOTAL ??
      parsed.Amount ??
      parsed.Nominal
    );

    // 2. Jika total masih 0, periksa jika ada item berharga di array items
    if (total <= 0 && Array.isArray(parsed.items)) {
      let sumItems = 0;
      for (const item of parsed.items) {
        if (typeof item === "object" && item !== null) {
          const rawItem = item as Record<string, unknown>;
          const p = parseNominal(rawItem.price ?? rawItem.harga ?? rawItem.total ?? rawItem.subtotal);
          if (p > 0) sumItems += p;
        } else if (typeof item === "string") {
          const matchPrice = item.match(/(?:rp|@)?\s*([\d.,]{3,})/i);
          if (matchPrice) {
            const p = parseNominal(matchPrice[1]);
            if (p > 0 && p < 100_000_000) sumItems += p;
          }
        }
      }
      if (sumItems > 0) total = sumItems;
    }

    // 3. Jika total masih 0, cari angka nominal dari raw text respons LLM
    if (total <= 0 && content) {
      const matchTotal = content.match(/(?:total|grand\s*total|tagihan|jumlah|bayar)[^\d\n\r]*?(\d[\d.,]*\d|\d+)/i);
      if (matchTotal) {
        total = parseNominal(matchTotal[1]);
      }
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
