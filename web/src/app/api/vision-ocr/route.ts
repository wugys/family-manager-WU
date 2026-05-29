// 名片掃描 OCR:POST 一張圖片 → 呼叫 Google Cloud Vision REST API 辨識文字。
//   前端用 <input capture> 拍照後把圖片傳來,這裡 base64 後送 Vision。
//   盡力解析出:店家名稱 name、聯絡人 contact_person、市話 phone、行動電話 mobile、
//   地址 address、濃縮備註 note,讓前端自動填欄位。
// 金鑰放 .env.local 的 GOOGLE_VISION_API_KEY(server-only,不加 NEXT_PUBLIC_)。
import { NextResponse } from "next/server";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

// 全形數字 → 半形(名片常出現全形)
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) - 0xfee0),
  );
}

// 行動電話格式化:09xxxxxxxx → 09NN-NNN-NNN
function formatMobile(digits: string): string {
  return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 10)}`;
}

// 市話格式化:區碼 + 號碼 → 02-NNNN-NNNN / 03N-NNN-NNNN…
function formatLandline(area: string, rest: string): string {
  if (rest.length === 8) return `${area}-${rest.slice(0, 4)}-${rest.slice(4)}`;
  if (rest.length === 7) return `${area}-${rest.slice(0, 3)}-${rest.slice(3)}`;
  return `${area}-${rest}`;
}

// 抓行動電話(09 開頭 10 碼)
function extractMobile(text: string): string | null {
  const m = text.match(/09\d{2}[-\s.]?\d{3}[-\s.]?\d{3}/);
  if (!m) return null;
  const d = m[0].replace(/\D/g, "");
  return d.length === 10 ? formatMobile(d) : null;
}

// 抓市話(區碼 02/03/037/039/04/049/05/06/07/08/089 + 7~8 碼)
function extractLandline(text: string): string | null {
  // 長區碼放前面,避免 0 + 3 先匹配掉 037
  const m = text.match(
    /\(?0(89|37|39|49|2|3|4|5|6|7|8)\)?[-\s.]*(\d{3,4})[-\s.]*(\d{3,4})/,
  );
  if (!m) return null;
  const area = "0" + m[1];
  const rest = (m[2] + m[3]).replace(/\D/g, "");
  return formatLandline(area, rest);
}

// 抓地址(含縣市區 + 路街號樓等特徵的那一行)
function extractAddress(lines: string[]): string | null {
  const hit = lines.find(
    (l) => /[縣市區鄉鎮]/.test(l) && /(路|街|大道|巷|弄|號|樓)/.test(l),
  );
  return hit ? hit.replace(/\s+/g, "") : null;
}

// 抓店家 / 公司名稱(含公司行號特徵字的那一行)
function extractCompany(lines: string[]): string | null {
  const hit = lines.find((l) =>
    /(股份有限公司|有限公司|公司|企業|實業|商行|工作室|通訊|事務所|診所|藥局|電器|家電|工程行|行$)/.test(
      l,
    ),
  );
  return hit ? hit.slice(0, 40) : null;
}

const TITLE_RE =
  /(董事長|總經理|區經理|副理|協理|襄理|經理|主任|專員|業務|顧問|工程師|店長|負責人|課長|主管|代表|執行長|總監)/;

// 抓聯絡人(職稱附近的 2~4 個中文字)
function extractPerson(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(TITLE_RE);
    if (!m) continue;
    const compact = l.replace(/\s/g, "");
    const idx = compact.indexOf(m[0]);
    const after = compact.slice(idx + m[0].length).match(/^[一-龥]{2,4}/);
    if (after) return after[0];
    const before = compact.slice(0, idx).match(/[一-龥]{2,4}$/);
    if (before) return before[0];
  }
  return null;
}

// 濃縮備註:挑出沒被其他欄位用到、又有意義的中文行(去掉電話/地址),最多 60 字
function condenseNote(lines: string[], company: string | null): string | null {
  const kept = lines.filter((l) => {
    if (company && l.includes(company)) return false;
    if (/(路|街|大道|巷|弄|號|樓)/.test(l)) return false; // 地址行
    const digits = l.replace(/\D/g, "");
    if (digits.length >= 7) return false; // 電話行
    if (!/[一-龥]/.test(l)) return false; // 沒中文(email/網址)略過
    return true;
  });
  const joined = [...new Set(kept)].join(" ").trim().slice(0, 60);
  return joined || null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { detail: "尚未設定 GOOGLE_VISION_API_KEY(請在 .env.local 填入金鑰)" },
      { status: 500 },
    );
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ detail: "沒有收到圖片" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const res = await fetch(`${VISION_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "TEXT_DETECTION" }],
            imageContext: { languageHints: ["zh-Hant", "en"] },
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `Vision HTTP ${res.status}`;
      return NextResponse.json({ detail: msg }, { status: 502 });
    }
    const r = data?.responses?.[0];
    if (r?.error) {
      return NextResponse.json(
        { detail: r.error.message || "辨識失敗" },
        { status: 502 },
      );
    }

    const rawText: string =
      r?.fullTextAnnotation?.text || r?.textAnnotations?.[0]?.description || "";
    const text = toHalfWidth(rawText);
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const company = extractCompany(lines);

    return NextResponse.json({
      text: rawText,
      name: company,
      contact_person: extractPerson(lines),
      phone: extractLandline(text),
      mobile: extractMobile(text),
      address: extractAddress(lines),
      note: condenseNote(lines, company),
    });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "辨識失敗" },
      { status: 500 },
    );
  }
}
