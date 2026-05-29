// 聯絡資訊檔案 API:單筆層級(/api/appliance-contact-files/[id])
//   DELETE → 先刪 Drive 上的實體檔,再刪 appliance_contact_files 紀錄
import { NextResponse } from "next/server";
import {
  deleteContactFile,
  getContactFile,
} from "@/lib/applianceContactFiles";
import { deleteFileByUrl } from "@/lib/drive";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const file = await getContactFile(Number(id));
    if (file === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的檔案` },
        { status: 404 },
      );
    }
    // Drive 端先刪(失敗不擋,避免 DB 留孤兒紀錄)
    if (file.url) await deleteFileByUrl(file.url);
    await deleteContactFile(Number(id));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 },
    );
  }
}
