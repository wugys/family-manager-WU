// 帳單 API:單筆層級(/api/bills/[id])
//   GET    → 取得單一帳單
//   PATCH  → 修改帳單(只送有改的欄位)
//   DELETE → 刪除帳單
//
// 注意:Next.js 16 的動態參數 params 是「非同步」的,要 await。
import { NextResponse } from "next/server";
import {
  deleteBill,
  getBill,
  updateBill,
  type BillUpdate,
} from "@/lib/bills";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const bill = await getBill(Number(id));
    if (bill === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的帳單` },
        { status: 404 },
      );
    }
    return NextResponse.json(bill);
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
    const body = (await request.json()) as BillUpdate;
    const updated = await updateBill(Number(id), body);
    if (updated === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的帳單` },
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
    const ok = await deleteBill(Number(id));
    if (!ok) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的帳單` },
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
