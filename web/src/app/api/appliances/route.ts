// 家電 API:集合層級(/api/appliances)
//   GET  → 列出所有家電
//   POST → 新增一台家電
import { NextResponse } from "next/server";
import {
  createAppliance,
  listAppliances,
  type ApplianceCreate,
} from "@/lib/appliances";

export async function GET() {
  try {
    return NextResponse.json(await listAppliances());
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ApplianceCreate>;
    if (!body.name) {
      return NextResponse.json({ detail: "缺少名稱" }, { status: 400 });
    }
    const created = await createAppliance(body as ApplianceCreate);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 },
    );
  }
}
