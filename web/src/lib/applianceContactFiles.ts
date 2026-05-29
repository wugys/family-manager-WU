// 家電聯絡資訊檔案(appliance_contact_files)領域模組。
// 一筆聯絡資訊(某個店家)底下的上傳區可放多個檔案,統一存這張子表:
//   kind = 'pricelist'(價目表照片,可多張)
// 對應 Supabase 表 appliance_contact_files(FK contact_id on delete cascade)。
// 實際的 Drive 上傳 / 刪除在 route handler 做,這裡只管 DB。
import { getClient } from "./supabase";

// 上傳區種類;目前只有價目表,未來要加別的就擴充這份清單
export const CONTACT_FILE_KINDS = ["pricelist"] as const;
export type ContactFileKind = (typeof CONTACT_FILE_KINDS)[number];

export interface ApplianceContactFileCreate {
  contact_id: number;
  kind: string; // 見 CONTACT_FILE_KINDS
  url: string; // Drive view URL
  name?: string | null; // 原始檔名(顯示用)
}

export interface ApplianceContactFile {
  id: number;
  contact_id: number;
  kind: string;
  url: string;
  name: string | null;
  created_at: string;
}

const TABLE = "appliance_contact_files";

// contactId 給了就只回該聯絡資訊的檔案;不給就回全部
export async function listContactFiles(
  contactId?: number,
): Promise<ApplianceContactFile[]> {
  let query = getClient().from(TABLE).select("*").order("id");
  if (contactId !== undefined) {
    query = query.eq("contact_id", contactId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ApplianceContactFile[];
}

export async function getContactFile(
  id: number,
): Promise<ApplianceContactFile | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ApplianceContactFile;
}

export async function createContactFile(
  input: ApplianceContactFileCreate,
): Promise<ApplianceContactFile> {
  const { data, error } = await getClient()
    .from(TABLE)
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ApplianceContactFile;
}

export async function deleteContactFile(id: number): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
