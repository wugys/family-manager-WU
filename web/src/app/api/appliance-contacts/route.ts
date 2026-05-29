// 家電聯絡資訊 API:集合層級(/api/appliance-contacts)
//   GET  → 列出聯絡資訊,可帶 ?appliance_id=N 只看某台家電
//   POST → 新增一筆(appliance_id + category 必填)
import { NextResponse } from "next/server";
import {
  createContact,
  listContacts,
  type ApplianceContactCreate,
} from "@/lib/applianceContacts";

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("appliance_id");
    const applianceId = raw === null ? undefined : Number(raw);
    return NextResponse.json(await listContacts(applianceId));
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ApplianceContactCreate>;
    if (!body.appliance_id) {
      return NextResponse.json({ detail: "缺少 appliance_id" }, { status: 400 });
    }
    if (!body.category) {
      return NextResponse.json({ detail: "缺少類別" }, { status: 400 });
    }
    const created = await createContact(body as ApplianceContactCreate);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 },
    );
  }
}
