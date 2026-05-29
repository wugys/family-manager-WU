// 家人通訊錄 API:單筆層級(/api/contacts/[id])
//   GET / PATCH / DELETE
// 注意:Next.js 16 的 params 是非同步的,要 await。
import { NextResponse } from "next/server";
import {
  deleteContact,
  getContact,
  updateContact,
  type ContactUpdate,
} from "@/lib/contacts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const contact = await getContact(Number(id));
    if (contact === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的家人` },
        { status: 404 },
      );
    }
    return NextResponse.json(contact);
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as ContactUpdate;
    const updated = await updateContact(Number(id), body);
    if (updated === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的家人` },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "修改失敗" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const ok = await deleteContact(Number(id));
    if (!ok) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的家人` },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 },
    );
  }
}
