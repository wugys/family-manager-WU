// 家電任務 API:單筆層級(/api/appliance-tasks/[id])
//   GET / PATCH / DELETE
// 不開放改 appliance_id(任務不能換家電)——ApplianceTaskUpdate 型別沒這欄位。
import { NextResponse } from "next/server";
import {
  deleteTask,
  getTask,
  updateTask,
  type ApplianceTaskUpdate,
} from "@/lib/appliances";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const task = await getTask(Number(id));
    if (task === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的任務` },
        { status: 404 },
      );
    }
    return NextResponse.json(task);
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
    const body = (await request.json()) as ApplianceTaskUpdate;
    const updated = await updateTask(Number(id), body);
    if (updated === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的任務` },
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
    const ok = await deleteTask(Number(id));
    if (!ok) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的任務` },
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
