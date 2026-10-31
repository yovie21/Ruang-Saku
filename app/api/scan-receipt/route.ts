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

function parseAiResponseText(raw: string): string {
  const trimmed = raw.trim();

  // 1. Format standar JSON { choices: [...] }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj.choices?.[0]?.message?.content) {
        return obj.choices[0].message.content;
      }
    } catch {
      // Abaikan dan lanjut ke parser berikutnya
    }
  }

  // 2. Format Server-Sent Events (SSE / streaming) "data: {...}"
  const chunks: string[] = [];
  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;
    const jsonStr = l.slice(5).trim();
    if (!jsonStr || jsonStr === "[DONE]") continue;
    try {
      const data = JSON.parse(jsonStr);
      const delta = data.choices?.[0]?.delta;
      if (delta?.content) {
        chunks.push(delta.content);
      } else if (data.choices?.[0]?.message?.content) {
        chunks.push(data.choices[0].message.content);
      }
    } catch {
      // Lewati baris tak valid
    }
  }

  if (chunks.length > 0) {
    return chunks.join("");
  }

  return trimmed;
}

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  const target = match ? match[0] : cleaned;

  try {
    return JSON.parse(target);
  } catch {
    const sanitized = target
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/([{\s,])(\w+)\s*:/g, '$1"$2":');
    return JSON.parse(sanitized);
  }
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

    const prompt = `Analisis gambar struk / nota belanja / kwitansi pembayaran ini dengan sangat teliti.

Tugas utamamu:
1. "merchant": Nama toko / tempat belanja / supermarket / restoran (contoh: "ASSALAAM HYPERMARKET", "Indomaret", "Alfamart", "Super Indo", dll).
2. "total": JUMLAH TOTAL AKHIR KESELURUHAN BELANJAAN (wajib angka integer dalam Rupiah, contoh: 125000).
   - CARI baris TOTAL, GRAND TOTAL, TOTAL BELANJA, TOTAL HARGA, TAGIHAN, JUMLAH, atau SUBTOTAL.
   - PENTING: Jika nota belanja memiliki banyak item barang dan angka Total di bawah kurang terbaca atau buram, JUMLAHKAN HARGA SEMUA BARANG YANG TERTERA untuk mendapatkan total keseluruhan belanjaan!
   - JANGAN kembalikan 0 jika di nota ada angka belanjaan atau harga barang.
   - JANGAN mengambil uang tunai bayar (Cash/Tunai) atau kembalian (Change/Kembali), ambil TOTAL BELANJAAN-nya.
3. "date": Tanggal transaksi dalam format "YYYY-MM-DD" (contoh: "2026-10-30"). Jika tahun 2 digit (misal 26), jadikan 2026.
4. "category": Pilih satu nama kategori yang paling sesuai dari daftar berikut: [${categoryList}].
5. "items": Daftar singkat nama barang yang dibeli beserta nominal harganya jika terbaca (contoh: [{"name": "Barang A", "price": 25000}]).

Balas HANYA teks JSON valid murni tanpa formatting markdown atau penjelasan lain, dengan format:
{
  "merchant": "Nama Toko / Tempat",
  "total": 45000,
  "date": "YYYY-MM-DD",
  "category": "Kategori Pilihan",
  "items": [{"name": "Item 1", "price": 25000}, {"name": "Item 2", "price": 20000}]
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
    const timer = setTimeout(() => controller.abort(), 28000);

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

    const rawBody = await res.text();
    const content = parseAiResponseText(rawBody);

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

    // 2. Jika total masih 0, periksa jika ada item berharga di array items dan JUMLAHKAN
    if (total <= 0 && Array.isArray(parsed.items)) {
      let sumItems = 0;
      for (const item of parsed.items) {
        if (typeof item === "object" && item !== null) {
          const rawItem = item as Record<string, unknown>;
          const p = parseNominal(rawItem.price ?? rawItem.harga ?? rawItem.total ?? rawItem.subtotal ?? rawItem.nominal);
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
      const matchTotal = content.match(/(?:total|grand\s*total|tagihan|jumlah|belanja)[^\d\n\r]*?(\d[\d.,]*\d|\d+)/i);
      if (matchTotal) {
        total = parseNominal(matchTotal[1]);
      }
    }

    const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : "";

    const category = typeof parsed.category === "string" ? parsed.category.trim() : "";
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(it => typeof it === "object" && it !== null ? (it as Record<string, unknown>).name : String(it)).filter(Boolean).slice(0, 5)
      : [];

    console.log(`[AI Vision Success] Toko: "${merchant}", Total: Rp ${total}, Tgl: "${date}", Kategori: "${category}"`);

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
