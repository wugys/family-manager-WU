// 家人通訊錄(contacts)領域模組:資料形狀 + Supabase 儲存功能。
// 跟 bills.ts / shopping.ts 同樣的單表模式。
// 只有 name 必填,其他都選填——7 人家庭裡有些資料可能很久才補上。
import { getClient } from "./supabase";

// 家庭角色預設值;前端 datalist 用,但不限制(允許自由打字)
export const ROLE_OPTIONS = [
  "父親",
  "母親",
  "長子",
  "長女",
  "次子",
  "次女",
  "三子",
  "三女",
  "其他",
];

// 新增時從前端傳入的資料形狀(只有 name 必填)
export interface ContactCreate {
  name: string;
  nickname?: string | null;
  role?: string | null;
  phone?: string | null;
  line_id?: string | null;
  email?: string | null;
  birthday?: string | null; // 'YYYY-MM-DD'
  blood_type?: string | null;
  address?: string | null;
  work_address?: string | null;
}

// 修改時的資料形狀:所有欄位都選填(PATCH 語意)
export type ContactUpdate = Partial<ContactCreate>;

// 完整資料,含 DB 自動產生的 id 和時間戳
export interface Contact {
  id: number;
  name: string;
  nickname: string | null;
  role: string | null;
  phone: string | null;
  line_id: string | null;
  email: string | null;
  birthday: string | null;
  blood_type: string | null;
  address: string | null;
  work_address: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "contacts";

// 列出所有家人,按 id 由小到大排序(新增順序)
export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as Contact[];
}

// 取得指定 id 的家人;找不到回 null
export async function getContact(id: number): Promise<Contact | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as Contact;
}

// 新增一位家人,回傳完整資料
export async function createContact(input: ContactCreate): Promise<Contact> {
  const { data, error } = await getClient()
    .from(TABLE)
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Contact;
}

// 修改指定 id 的家人;找不到回 null。PATCH 語意:只更新前端有送的欄位。
export async function updateContact(
  id: number,
  updates: ContactUpdate,
): Promise<Contact | null> {
  if (Object.keys(updates).length === 0) {
    return getContact(id);
  }
  // PostgreSQL 沒有 ON UPDATE 自動更新,要手動帶 updated_at
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await getClient()
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as Contact;
}

// 刪除指定 id 的家人;成功回 true、找不到回 false
export async function deleteContact(id: number): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
