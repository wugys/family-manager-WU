// 名片掃描:POST 一張名片圖片 → 直接交給 Google Gemini「看圖」,
//   回傳結構化欄位(店家名稱 / 聯絡人 / 市話 / 行動電話 / 地址 / 備註 / 原始文字),讓前端自動填表。
//   比舊版「Vision OCR + 正則猜」準很多——Gemini 真的讀懂名片版型。
// 金鑰放 .env.local 的 GEMINI_API_KEY(server-only,不加 NEXT_PUBLIC_)。
import { NextResponse } from "next/server";

// 用 flash 版:夠準、便宜、有免費額度;要換模型改這一行即可
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// 要 Gemini 抽出的欄位(逼它回乾淨 JSON,不夾雜說明文字)
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" }, // 公司 / 店家名稱(完整全名)
    contact_person: { type: "string" }, // 聯絡人姓名(純人名,不含職稱)
    phone: { type: "string" }, // 市話
    mobile: { type: "string" }, // 行動電話
    address: { type: "string" }, // 地址
    note: { type: "string" }, // 其他重要資訊濃縮(職稱、營業項目、Email、網址…)
    text: { type: "string" }, // 名片上所有可見文字,原樣列出
  },
  required: [
    "name",
    "contact_person",
    "phone",
    "mobile",
    "address",
    "note",
    "text",
  ],
};

const PROMPT = `你是名片資訊辨識助手。請仔細辨識這張名片圖片上的「所有」資訊,不要遺漏任何細節。
依下列規則抽取欄位(找不到的欄位一律回空字串 ""):
- name:公司 / 店家名稱,要完整全名(例:全球人壽保險股份有限公司)。
- contact_person:聯絡人的「人名」,只要姓名本身,不要含職稱(例:倪詔諡,不是「倪詔諡 區經理」)。
- phone:市話(含區碼),保留易讀格式如 02-6613-8709。
- mobile:行動電話(09 開頭),格式如 0921-990-018。
- address:完整地址。
- note:其他重要資訊,「每一項各自一行」(用換行符號 \n 分隔),例如職稱、頭銜、營業項目、Email、網址、LINE ID、傳真等,每行一項,不要全部擠成一行。
- text:把名片上看得到的所有文字原樣列出(可換行)。
特別注意:務必正確區分「人名」與「公司名」,不要把公司名填進聯絡人、也不要把職稱當成人名。`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { detail: "尚未設定 GEMINI_API_KEY(請在 .env.local 填入金鑰)" },
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
    const mimeType = file.type || "image/jpeg";

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0, // 辨識任務,要穩定不要發揮
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini HTTP ${res.status}`;
      return NextResponse.json({ detail: msg }, { status: 502 });
    }

    // Gemini 把 JSON 字串放在 candidates[0].content.parts[0].text
    const jsonText: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { detail: "Gemini 回傳格式無法解析,請重拍一張清楚的名片" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      text: parsed.text || "",
      name: parsed.name || "",
      contact_person: parsed.contact_person || "",
      phone: parsed.phone || "",
      mobile: parsed.mobile || "",
      address: parsed.address || "",
      note: parsed.note || "",
    });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "辨識失敗" },
      { status: 500 },
    );
  }
}
