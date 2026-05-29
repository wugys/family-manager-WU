// 家電聯絡資訊 API:單筆層級(/api/appliance-contacts/[id])
//   PATCH / DELETE。不開放改 appliance_id(聯絡資訊不能換家電)。
import { NextResponse } from "next/server";
import {
  deleteContact,
  updateContact,
  type ApplianceContactUpdate,
} from "@/lib/applianceContacts";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as ApplianceContactUpdate;
    const updated = await updateContact(Number(id), body);
    if (updated === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的聯絡資訊` },
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
        { detail: `找不到 id=${id} 的聯絡資訊` },
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
