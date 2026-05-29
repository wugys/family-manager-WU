// 聯絡資訊檔案 API:集合層級(/api/appliance-contact-files)
//   GET  → 列出檔案,可帶 ?contact_id=N 只看某筆聯絡資訊
//   POST → 上傳一個檔案(multipart/form-data:contact_id + kind + file)
//          先傳到 Google Drive「家電管理」子資料夾,再把 view URL 寫進 appliance_contact_files
//          命名規則:<家電名稱>-<店家名稱>-<kindLabel>-<原檔名>
import { NextResponse } from "next/server";
import { getAppliance } from "@/lib/appliances";
import { getContact } from "@/lib/applianceContacts";
import {
  createContactFile,
  listContactFiles,
} from "@/lib/applianceContactFiles";
import { uploadFile } from "@/lib/drive";

// kind → Drive 檔名中文標籤
const KIND_LABEL: Record<string, string> = {
  pricelist: "價目表",
};

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("contact_id");
    const contactId = raw === null ? undefined : Number(raw);
    return NextResponse.json(await listContactFiles(contactId));
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
    const contactId = Number(formData.get("contact_id"));
    const kind = String(formData.get("kind") || "");
    const file = formData.get("file");

    if (!contactId) {
      return NextResponse.json({ detail: "缺少 contact_id" }, { status: 400 });
    }
    if (!(kind in KIND_LABEL)) {
      return NextResponse.json(
        { detail: "kind 必須是 pricelist" },
        { status: 422 },
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ detail: "沒有收到檔案" }, { status: 400 });
    }

    const contact = await getContact(contactId);
    if (contact === null) {
      return NextResponse.json(
        { detail: `找不到 id=${contactId} 的聯絡資訊` },
        { status: 404 },
      );
    }
    const appliance = await getAppliance(contact.appliance_id);

    // 命名規則:<家電名稱>-<店家名稱>-<中文標籤>-<原檔名>
    const applianceName = (appliance?.name ?? "家電").replace(/[/\\]/g, "-");
    const storeName = (contact.name ?? "店家").replace(/[/\\]/g, "-");
    const originalName = (file.name || "untitled").replace(/[/\\]/g, "-");
    const safeFilename = `${applianceName}-${storeName}-${KIND_LABEL[kind]}-${originalName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const viewUrl = await uploadFile(
      buffer,
      safeFilename,
      "家電管理",
      file.type || "application/octet-stream",
    );

    const created = await createContactFile({
      contact_id: contactId,
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
