// 家電 API:單筆層級(/api/appliances/[id])
//   GET / PATCH / DELETE
// 注意:Next.js 16 的 params 是非同步的,要 await。
import { NextResponse } from "next/server";
import {
  deleteAppliance,
  getAppliance,
  updateAppliance,
  type ApplianceUpdate,
} from "@/lib/appliances";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const appliance = await getAppliance(Number(id));
    if (appliance === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的家電` },
        { status: 404 },
      );
    }
    return NextResponse.json(appliance);
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
    const body = (await request.json()) as ApplianceUpdate;
    const updated = await updateAppliance(Number(id), body);
    if (updated === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的家電` },
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
    const ok = await deleteAppliance(Number(id));
    if (!ok) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的家電` },
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
