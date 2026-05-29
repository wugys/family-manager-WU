// 家電任務 API:集合層級(/api/appliance-tasks)
//   GET  → 列出任務,可帶 ?appliance_id=N 篩選只看某台家電的任務
//   POST → 新增一個任務(appliance_id 必填)
import { NextResponse } from "next/server";
import {
  createTask,
  listTasks,
  type ApplianceTaskCreate,
} from "@/lib/appliances";

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("appliance_id");
    const applianceId = raw === null ? undefined : Number(raw);
    return NextResponse.json(await listTasks(applianceId));
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ApplianceTaskCreate>;
    if (!body.appliance_id) {
      return NextResponse.json({ detail: "缺少 appliance_id" }, { status: 400 });
    }
    if (!body.name) {
      return NextResponse.json({ detail: "缺少任務名稱" }, { status: 400 });
    }
    const created = await createTask(body as ApplianceTaskCreate);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 },
    );
  }
}
