// 家人通訊錄 API:集合層級(/api/contacts)
//   GET  → 列出所有家人
//   POST → 新增一位家人
import { NextResponse } from "next/server";
import {
  createContact,
  listContacts,
  type ContactCreate,
} from "@/lib/contacts";

export async function GET() {
  try {
    return NextResponse.json(await listContacts());
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ContactCreate>;
    if (!body.name) {
      return NextResponse.json({ detail: "缺少姓名" }, { status: 400 });
    }
    const created = await createContact(body as ContactCreate);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 },
    );
  }
}
