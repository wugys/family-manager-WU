// 帳單 API:集合層級(/api/bills)
//   GET  → 列出所有帳單
//   POST → 新增一筆帳單
import { NextResponse } from "next/server";
import { createBill, listBills, type BillCreate } from "@/lib/bills";

export async function GET() {
  try {
    const bills = await listBills();
    return NextResponse.json(bills);
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<BillCreate>;

    // 邊界驗證:必填欄位檢查(對應原本 Pydantic 的必填)
    if (!body.name || body.amount == null || !body.cycle || !body.next_due_date) {
      return NextResponse.json(
        { detail: "缺少必填欄位:名稱、金額、週期、下次到期日" },
        { status: 400 },
      );
    }

    const created = await createBill(body as BillCreate);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "新增失敗" },
      { status: 500 },
    );
  }
}
