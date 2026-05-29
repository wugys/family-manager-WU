// 帳單(bills)領域層:資料形狀 + Supabase 儲存功能。
// 對應原本的 bills.py,API 路由(app/api/bills)只呼叫這裡的函式,不直接碰 Supabase。
//
// 日期欄位在 TypeScript 都用 string 表示:
//   - next_due_date / last_paid_date 是 'YYYY-MM-DD'(Supabase 的 date 型別)
//   - created_at / updated_at 是 ISO 字串(Supabase 的 timestamptz)
// 前端本來就把這些當字串處理,不用轉。

import { getClient } from "./supabase";

const TABLE = "bills";

// 週期合法值;前端做下拉選單時也引用這份清單。
export const CYCLE_OPTIONS = [
  "monthly",
  "bi-monthly",
  "quarterly",
  "yearly",
  "one-time",
  "custom",
] as const;

// 新增帳單時前端傳入的資料形狀(沒有 id、is_paid、時間戳)。
export interface BillCreate {
  name: string;
  category?: string | null;
  amount: number;
  cycle: string;
  cycle_days?: number | null; // 只有 cycle = 'custom' 時才填
  next_due_date: string;
  payer?: string | null;
  note?: string | null;
}

// 修改帳單時的資料形狀:所有欄位選填,只送有改的部分(PATCH 語意)。
export interface BillUpdate {
  name?: string;
  category?: string | null;
  amount?: number;
  cycle?: string;
  cycle_days?: number | null;
  next_due_date?: string;
  payer?: string | null;
  is_paid?: boolean;
  last_paid_date?: string | null;
  note?: string | null;
}

// 完整帳單資料(含 DB 自動產生的欄位)。
export interface Bill {
  id: number;
  name: string;
  category: string | null;
  amount: number;
  cycle: string;
  cycle_days: number | null;
  next_due_date: string;
  payer: string | null;
  is_paid: boolean;
  last_paid_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ===== 5 個 CRUD 函式 =====

/** 列出所有帳單,按 id 由小到大排序。 */
export async function listBills(): Promise<Bill[]> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as Bill[];
}

/** 取得指定 id 的帳單;找不到回 null。 */
export async function getBill(id: number): Promise<Bill | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as Bill;
}

/** 新增一筆帳單,回傳完整資料(含 DB 自動產生的 id 和時間戳)。 */
export async function createBill(input: BillCreate): Promise<Bill> {
  const { data, error } = await getClient()
    .from(TABLE)
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Bill;
}

/**
 * 修改指定 id 的帳單;找不到回 null。
 * PATCH 語意:只更新傳進來的欄位(呼叫端負責只放有改的欄位)。
 */
export async function updateBill(
  id: number,
  updates: BillUpdate,
): Promise<Bill | null> {
  // 沒有任何要改的欄位 → 直接回現狀,省一次網路
  if (Object.keys(updates).length === 0) return getBill(id);
  // PostgreSQL 沒有 ON UPDATE 自動更新,手動帶 updated_at
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await getClient()
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as Bill;
}

/** 刪除指定 id 的帳單;成功回 true、找不到回 false。 */
export async function deleteBill(id: number): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
