// 採購清單 API:集合層級(/api/shopping)
//   GET  → 列出所有品項
//   POST → 新增一筆品項
import { NextResponse } from "next/server";
import { createItem, listItems, type ShoppingItemCreate } from "@/lib/shopping";

export async function GET() {
  try {
    return NextResponse.json(await listItems());
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ShoppingItemCreate>;
    if (!body.name) {
      return NextResponse.json({ detail: "缺少品名" }, { status: 400 });
    }
    const created = await createItem(body as ShoppingItemCreate);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 },
    );
  }
}
