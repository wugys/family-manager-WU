// 採購清單領域操作:一鍵清掉所有已買品項(/api/shopping/clear-bought)
import { NextResponse } from "next/server";
import { clearBought } from "@/lib/shopping";

export async function POST() {
  try {
    const removed = await clearBought();
    return NextResponse.json({ removed });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "清除失敗" },
      { status: 500 },
    );
  }
}
