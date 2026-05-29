// 家電聯絡資訊(appliance_contacts)領域模組。
// 一台家電可以有多筆聯絡資訊,各自有「類別」:
//   耗材連結:耗材名稱 + 購買連結 + 備註(配「複製搜索關鍵字」比價用)
//   保養資訊:店家名稱 + 電話 + 地址 + 備註
//   購買店家:店家名稱 + 電話 + 地址 + 備註 + 是否同為保養店家
// 對應 Supabase 表 appliance_contacts(FK appliance_id on delete cascade)。
import { getClient } from "./supabase";

// 類別合法值;前端下拉選單用
export const CONTACT_CATEGORIES = ["耗材連結", "保養資訊", "購買店家"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export interface ApplianceContactCreate {
  appliance_id: number;
  category: string; // 見 CONTACT_CATEGORIES
  name?: string | null; // 耗材名稱 或 店家名稱
  contact_person?: string | null; // 聯絡人(店家窗口)
  url?: string | null; // 耗材購買連結
  phone?: string | null; // 市話 / 座機
  mobile?: string | null; // 行動電話
  address?: string | null;
  business_hours?: string | null; // 店家營業時間(保養資訊 / 購買店家)
  note?: string | null;
  also_maintenance?: boolean; // 購買店家是否同為保養店家
}

// appliance_id 不開放修改(聯絡資訊不能換家電,要改就刪掉重建)
export type ApplianceContactUpdate = Partial<
  Omit<ApplianceContactCreate, "appliance_id">
>;

export interface ApplianceContact {
  id: number;
  appliance_id: number;
  category: string;
  name: string | null;
  contact_person: string | null;
  url: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  business_hours: string | null;
  note: string | null;
  also_maintenance: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "appliance_contacts";

// applianceId 給了就只回該家電的聯絡資訊;不給就回全部
export async function listContacts(
  applianceId?: number,
): Promise<ApplianceContact[]> {
  let query = getClient().from(TABLE).select("*").order("id");
  if (applianceId !== undefined) {
    query = query.eq("appliance_id", applianceId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ApplianceContact[];
}

export async function getContact(
  id: number,
): Promise<ApplianceContact | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ApplianceContact;
}

export async function createContact(
  input: ApplianceContactCreate,
): Promise<ApplianceContact> {
  const { data, error } = await getClient()
    .from(TABLE)
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ApplianceContact;
}

export async function updateContact(
  id: number,
  updates: ApplianceContactUpdate,
): Promise<ApplianceContact | null> {
  if (Object.keys(updates).length === 0) return getContact(id);
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await getClient()
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ApplianceContact;
}

export async function deleteContact(id: number): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
