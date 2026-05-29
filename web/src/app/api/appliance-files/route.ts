// 家電檔案 API:集合層級(/api/appliance-files)
//   GET  → 列出檔案,可帶 ?appliance_id=N 只看某台家電
//   POST → 上傳一個檔案(multipart/form-data:appliance_id + kind + file)
//          先傳到 Google Drive「家電管理」子資料夾,再把 view URL 寫進 appliance_files
import { NextResponse } from "next/server";
import { getAppliance } from "@/lib/appliances";
import { createFile, listFiles } from "@/lib/applianceFiles";
import { uploadFile } from "@/lib/drive";

// kind → Drive 檔名中文標籤(命名規則:<家電名稱>-<kindLabel>-<原檔名>)
const KIND_LABEL: Record<string, string> = {
  photo: "家電照片",
  manual: "說明書",
  receipt: "購買收據",
};

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("appliance_id");
    const applianceId = raw === null ? undefined : Number(raw);
    return NextResponse.json(await listFiles(applianceId));
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const applianceId = Number(formData.get("appliance_id"));
    const kind = String(formData.get("kind") || "");
    const file = formData.get("file");

    if (!applianceId) {
      return NextResponse.json({ detail: "缺少 appliance_id" }, { status: 400 });
    }
    if (!(kind in KIND_LABEL)) {
      return NextResponse.json(
        { detail: "kind 必須是 photo、manual 或 receipt" },
        { status: 422 },
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ detail: "沒有收到檔案" }, { status: 400 });
    }

    const appliance = await getAppliance(applianceId);
    if (appliance === null) {
      return NextResponse.json(
        { detail: `找不到 id=${applianceId} 的家電` },
        { status: 404 },
      );
    }

    // 命名規則:<家電名稱>-<中文標籤>-<原檔名>
    const applianceName = appliance.name.replace(/[/\\]/g, "-");
    const originalName = (file.name || "untitled").replace(/[/\\]/g, "-");
    const safeFilename = `${applianceName}-${KIND_LABEL[kind]}-${originalName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const viewUrl = await uploadFile(
      buffer,
      safeFilename,
      "家電管理",
      file.type || "application/octet-stream",
    );

    const created = await createFile({
      appliance_id: applianceId,
      kind,
      url: viewUrl,
      name: file.name || null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "上傳失敗" },
      { status: 500 },
    );
  }
}
