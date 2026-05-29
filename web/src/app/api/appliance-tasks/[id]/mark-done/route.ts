// 家電任務領域操作:標已完成 + 自動推進下次日期(/api/appliance-tasks/[id]/mark-done)
import { NextResponse } from "next/server";
import { markTaskDone } from "@/lib/appliances";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const updated = await markTaskDone(Number(id));
    if (updated === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的任務` },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "標記失敗" },
      { status: 500 },
    );
  }
}
