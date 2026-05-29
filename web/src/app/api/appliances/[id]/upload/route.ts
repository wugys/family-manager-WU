// 家電檔案上傳 API(/api/appliances/[id]/upload?kind=photo|manual)
//   POST multipart/form-data,把檔案上傳到 Google Drive,view URL 存進 appliances 表。
//
// 流程:
//   1. 驗證 kind 合法、家電存在
//   2. 該欄位有舊檔 → Drive 端刪掉(避免孤兒檔案)
//   3. 上傳新檔到「家電管理」子資料夾,設為「擁有連結者可檢視」
//   4. 更新 DB 的 photo_url 或 manual_url 欄位
import { NextResponse } from "next/server";
import { getAppliance, updateAppliance } from "@/lib/appliances";
import { uploadFile, deleteFileByUrl } from "@/lib/drive";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const applianceId = Number(id);

  // kind 從 query 拿(photo 或 manual)
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "photo" && kind !== "manual") {
    return NextResponse.json(
      { detail: "kind 必須是 photo 或 manual" },
      { status: 422 },
    );
  }

  try {
    const appliance = await getAppliance(applianceId);
    if (appliance === null) {
      return NextResponse.json(
        { detail: `找不到 id=${id} 的家電` },
        { status: 404 },
      );
    }

    // 從 multipart/form-data 取出檔案
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ detail: "沒有收到檔案" }, { status: 400 });
    }

    // 有舊檔先刪(Drive 端),避免孤兒檔案
    const oldUrl =
      kind === "photo" ? appliance.photo_url : appliance.manual_url;
    if (oldUrl) await deleteFileByUrl(oldUrl);

    // 命名規則:<家電名稱>-<中文標籤>-<原檔名>(套 CLAUDE.md「強制規則 > 資料儲存」第 3 條)
    const kindLabel = kind === "photo" ? "家電照片" : "說明書";
    const applianceName = appliance.name.replace(/[/\\]/g, "-");
    const originalName = (file.name || "untitled").replace(/[/\\]/g, "-");
    const safeFilename = `${applianceName}-${kindLabel}-${originalName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const viewUrl = await uploadFile(
      buffer,
      safeFilename,
      "家電管理",
      file.type || "application/octet-stream",
    );

    // 更新 DB 對應欄位
    if (kind === "photo") {
      await updateAppliance(applianceId, { photo_url: viewUrl });
    } else {
      await updateAppliance(applianceId, { manual_url: viewUrl });
    }

    return NextResponse.json({ view_url: viewUrl });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "上傳失敗" },
      { status: 500 },
    );
  }
}
