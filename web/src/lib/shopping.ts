// 採購清單(shopping_items)領域層:資料形狀 + Supabase 儲存功能。
// 對應原本的 shopping.py。特殊處理:is_bought 變化時自動填/清 bought_at。

import { getClient } from "./supabase";

const TABLE = "shopping_items";

export interface ShoppingItemCreate {
  name: string;
  quantity?: string | null;
  category?: string | null;
  note?: string | null;
}

export interface ShoppingItemUpdate {
  name?: string;
  quantity?: string | null;
  category?: string | null;
  note?: string | null;
  is_bought?: boolean;
  // bought_at 不開放前端設;後端在 is_bought 變化時自動處理(單一資料來源)
}

export interface ShoppingItem {
  id: number;
  name: string;
  quantity: string | null;
  category: string | null;
  note: string | null;
  is_bought: boolean;
  bought_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 列出所有品項,按 id 由小到大排序。 */
export async function listItems(): Promise<ShoppingItem[]> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as ShoppingItem[];
}

/** 取得指定 id 的品項;找不到回 null。 */
export async function getItem(id: number): Promise<ShoppingItem | null> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ShoppingItem;
}

/** 新增一筆品項。 */
export async function createItem(
  input: ShoppingItemCreate,
): Promise<ShoppingItem> {
  const { data, error } = await getClient()
    .from(TABLE)
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ShoppingItem;
}

/**
 * 修改指定 id 的品項;找不到回 null。
 * 特殊處理:is_bought 從 false→true 自動填 bought_at;true→false 自動清掉。
 * 要先抓現狀才能比對 is_bought 變化。
 */
export async function updateItem(
  id: number,
  updates: ShoppingItemUpdate,
): Promise<ShoppingItem | null> {
  const current = await getItem(id);
  if (current === null) return null;
  if (Object.keys(updates).length === 0) return current;

  const payload: Record<string, unknown> = { ...updates };

  if ("is_bought" in updates && updates.is_bought !== undefined) {
    if (updates.is_bought && !current.is_bought) {
      payload.bought_at = new Date().toISOString();
    } else if (!updates.is_bought && current.is_bought) {
      payload.bought_at = null;
    }
  }

  payload.updated_at = new Date().toISOString();
  const { data, error } = await getClient()
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ShoppingItem;
}

/** 刪除指定 id 的品項;成功回 true、找不到回 false。 */
export async function deleteItem(id: number): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/** 一鍵清掉所有已買品項;回傳清掉幾筆。 */
export async function clearBought(): Promise<number> {
  const client = getClient();
  const { data: boughtRows, error: selErr } = await client
    .from(TABLE)
    .select("id")
    .eq("is_bought", true);
  if (selErr) throw new Error(selErr.message);
  const count = boughtRows?.length ?? 0;
  if (count > 0) {
    const { error: delErr } = await client
      .from(TABLE)
      .delete()
      .eq("is_bought", true);
    if (delErr) throw new Error(delErr.message);
  }
  return count;
}
