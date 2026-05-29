// 家電(appliances)+ 家電任務(appliance_tasks)領域模組。
// 兩張表放同一個檔案,因為任務不能脫離家電存在(FK on delete cascade)。
//
// 對應的 Supabase 表:
//   appliances:家電本體(廠牌、型號、保固、說明書連結等)
//   appliance_tasks:每台家電可有多個保養 / 耗材 / 清潔任務,各自有週期
import { getClient } from "./supabase";
import { deleteFileByUrl } from "./drive";

// 任務類型 task_type 的合法值;前端 datalist 預設選項用
export const TASK_TYPE_OPTIONS = ["清潔", "保養", "耗材更換", "其他"];

// ===== Appliance(家電本體) =====
export interface ApplianceCreate {
  name: string;
  brand?: string | null;
  model?: string | null;
  location?: string | null;
  purchase_date?: string | null;
  warranty_until?: string | null;
  manual_url?: string | null;
  photo_url?: string | null;
  note?: string | null;
}

export type ApplianceUpdate = Partial<ApplianceCreate>;

export interface Appliance {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  location: string | null;
  purchase_date: string | null;
  warranty_until: string | null;
  manual_url: string | null;
  photo_url: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ===== ApplianceTask(家電任務) =====
export interface ApplianceTaskCreate {
  appliance_id: number;
  name: string;
  task_type?: string | null;
  cycle_days?: number | null; // null = 不定期任務
  last_done_date?: string | null;
  next_due_date?: string | null;
  note?: string | null;
}

// appliance_id 故意不開放修改——任務不能換歸屬家電,要改就刪掉重建
export type ApplianceTaskUpdate = Partial<
  Omit<ApplianceTaskCreate, "appliance_id">
>;

export interface ApplianceTask {
  id: number;
  appliance_id: number;
  name: string;
  task_type: string | null;
  cycle_days: number | null;
  last_done_date: string | null;
  next_due_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE_APPLIANCES = "appliances";
const TABLE_TASKS = "appliance_tasks";

// 把 YYYY-MM-DD 字串加上天數,回傳 YYYY-MM-DD;用本地時間避免時區位移
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ===== 家電 CRUD =====
export async function listAppliances(): Promise<Appliance[]> {
  const { data, error } = await getClient()
    .from(TABLE_APPLIANCES)
    .select("*")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as Appliance[];
}

export async function getAppliance(id: number): Promise<Appliance | null> {
  const { data, error } = await getClient()
    .from(TABLE_APPLIANCES)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as Appliance;
}

export async function createAppliance(
  input: ApplianceCreate,
): Promise<Appliance> {
  const { data, error } = await getClient()
    .from(TABLE_APPLIANCES)
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Appliance;
}

export async function updateAppliance(
  id: number,
  updates: ApplianceUpdate,
): Promise<Appliance | null> {
  if (Object.keys(updates).length === 0) return getAppliance(id);
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await getClient()
    .from(TABLE_APPLIANCES)
    .update(payload)
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as Appliance;
}

// 刪除家電;DB 層 ON DELETE CASCADE 會連帶刪該家電底下所有任務。
// Drive 端的照片 / 說明書一併刪除(失敗不擋 DB 流程)。
export async function deleteAppliance(id: number): Promise<boolean> {
  const current = await getAppliance(id);
  if (current === null) return false;

  if (current.photo_url) await deleteFileByUrl(current.photo_url);
  if (current.manual_url) await deleteFileByUrl(current.manual_url);

  const { data, error } = await getClient()
    .from(TABLE_APPLIANCES)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// ===== 任務 CRUD =====
// applianceId 給了就只回該家電的任務;不給就回全部
export async function listTasks(
  applianceId?: number,
): Promise<ApplianceTask[]> {
  let query = getClient().from(TABLE_TASKS).select("*").order("id");
  if (applianceId !== undefined) {
    query = query.eq("appliance_id", applianceId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ApplianceTask[];
}

export async function getTask(id: number): Promise<ApplianceTask | null> {
  const { data, error } = await getClient()
    .from(TABLE_TASKS)
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ApplianceTask;
}

// 新增任務。有 last_done_date + cycle_days 但沒 next_due_date → 自動算下次該做日
export async function createTask(
  input: ApplianceTaskCreate,
): Promise<ApplianceTask> {
  const payload: ApplianceTaskCreate = { ...input };
  if (
    payload.last_done_date &&
    payload.cycle_days &&
    !payload.next_due_date
  ) {
    payload.next_due_date = addDays(payload.last_done_date, payload.cycle_days);
  }
  const { data, error } = await getClient()
    .from(TABLE_TASKS)
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ApplianceTask;
}

export async function updateTask(
  id: number,
  updates: ApplianceTaskUpdate,
): Promise<ApplianceTask | null> {
  if (Object.keys(updates).length === 0) return getTask(id);
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await getClient()
    .from(TABLE_TASKS)
    .update(payload)
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ApplianceTask;
}

export async function deleteTask(id: number): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE_TASKS)
    .delete()
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// ===== 領域操作:標已完成並自動推進下次日期 =====
// last_done_date = 今天;有 cycle_days → next_due_date = 今天 + cycle_days;沒週期 → next_due_date = null
export async function markTaskDone(
  id: number,
): Promise<ApplianceTask | null> {
  const current = await getTask(id);
  if (current === null) return null;

  const today = todayIso();
  const updates: ApplianceTaskUpdate & {
    last_done_date: string;
    next_due_date: string | null;
    updated_at: string;
  } = {
    last_done_date: today,
    next_due_date: current.cycle_days ? addDays(today, current.cycle_days) : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getClient()
    .from(TABLE_TASKS)
    .update(updates)
    .eq("id", id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as ApplianceTask;
}
