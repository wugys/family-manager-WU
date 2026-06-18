// 家電檔案(appliance_files)領域模組。
// 一台家電的每個「上傳區」(kind)可放多個檔案,統一存這張子表:
//   kind = 'photo'(家電照片,第一張當主頁卡片頭貼)/ 'manual'(說明書)
//        / 'receipt'(購買收據)/ 'warranty_card'(保固卡)
// 對應 Supabase 表 appliance_files(FK appliance_id on delete cascade)。
// 實際的 Drive 上傳 / 刪除在 route handler 做,這裡只管 DB。
import { getClient } from "./supabase";

// 上傳區種類;前端 MultiUpload 元件用
export const FILE_KINDS = ["photo", "manual", "receipt", "warranty_card"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export interface ApplianceFileCreate {
  appliance_id: number;
  kind: string; // 見 FILE_KINDS
  url: string; // Drive view URL
  name?: string | null; // 原始檔名(顯示用)
}

export interface ApplianceFile {
  id: number;
  appliance_id: number;
  kind: string;
  url: string;
  name: string | null;
  created_at: string;
}

const TABLE = "appliance_files";

// applianceId 給了就只回該家電的檔案;不給就回全部
export async function listFiles(
  applianceId?: number,
): Promise<ApplianceFile[]> {
  let query = getClient().from(TABLE).select("*").order("id");
  if (applianceId !== undefined) {
    query = query.eq("appliance_id", applianceId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ApplianceFile[];
}

export async function getFile(id: number): Promise<ApplianceFile | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ApplianceFile;
}

export async function createFile(
  input: ApplianceFileCreate,
): Promise<ApplianceFile> {
  const { data, error } = await getClient()
    .from(TABLE)
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ApplianceFile;
}

export async function deleteFile(id: number): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
