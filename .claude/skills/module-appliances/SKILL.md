---
name: module-appliances
description: family-manager「家電管理」板塊的專屬 skill。封裝這板塊獨有的方法論——比 bills/shopping 多一層複雜度:雙表 + FK cascade、領域操作 mark_task_done、任務子清單 UI 模式、4 種狀態徽章、新增主物件後自動切編輯模式 UX。未來加類似「一個主物件管多個子事件」的板塊(車輛紀錄/保養紀錄、借用紀錄/借出紀錄、寵物/接種紀錄、設備/校正紀錄等)直接套這份模板,不用重新摸索 schema 設計、API 路徑、Modal 內子清單 UI。先讀 system-prep + module-supabase 再讀這份。
---

# 家電管理板塊 SKILL

家電板塊獨有的方法論——比 bills/shopping 多一層複雜度:**雙表 + FK cascade + 領域操作 + 任務子清單 UI**。

未來任何「一個主物件管多個子事件」的板塊都可以直接套(車輛 → 保養紀錄、借用 → 借出紀錄、寵物 → 接種紀錄、設備 → 校正紀錄、…)。

**先讀**:
1. `system-prep/SKILL.md`(foundation,5 階段流程 + 一氣呵成做到主頁能點)
2. `module-supabase/SKILL.md`(Supabase 接入,單表領域檔模板)
3. 再讀這份(雙表 + 主從關係)

---

## 1. 何時要雙表?

主物件有可變多個的「子實體」,而且**子實體不能脫離主存在**。

範例對應:
| 主物件 | 子實體 | 關係 |
|---|---|---|
| 家電 | 保養/耗材/清潔任務 | 一台家電可有 N 個任務,週期各異 |
| 車輛 | 保養/加油紀錄 | 一台車有多次保養 |
| 寵物 | 接種/用藥紀錄 | 一隻寵物有多次醫療事件 |
| 借出物品 | 借出事件 | 一件物品被借過多次 |
| 設備 | 校正紀錄 | 一台設備校正多次 |

**反例**(單表夠,不需要雙表):
- 公佈欄:每則公告獨立,沒有「子事件」
- 通訊錄:一個人通常一個電話,真要多個就用文字欄位塞

設計階段的判斷:**有沒有「歷史」概念**?有就雙表,沒就單表。

---

## 2. SQL 模式(`supabase_schema.sql`)

```sql
-- 主表
create table if not exists <parents> (
  id              bigint generated always as identity primary key,
  name            text        not null,
  -- 其他主物件欄位...
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 子表(關鍵在 FK 那行)
create table if not exists <children> (
  id              bigint generated always as identity primary key,
  <parent>_id     bigint      not null references <parents>(id) on delete cascade,
  name            text        not null,
  -- 子物件欄位...
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table <parents>  enable row level security;
alter table <children> enable row level security;
```

**關鍵兩字**:`on delete cascade` — 刪父表時 DB 自動清掉所有指向它的子紀錄,避免「孤兒任務」。Supabase Table Editor 上子表的 FK 欄位旁會有 🔗 圖示確認。

---

## 3. 領域層:單檔案放雙表 6 模型 + 11 函式

**結構**:單一檔案 `<modulename>.py` 放兩張表的所有東西(因為子物件不能脫離主物件,放一起方便維護)。

**6 個 Pydantic 模型**:
- 主物件:`<Parent>Create` / `<Parent>Update` / `<Parent>` 3 個
- 子物件:`<Child>Create` / `<Child>Update` / `<Child>` 3 個

**設計重點**:
- 子物件的 `<Child>Create` **必含 `<parent>_id`**(標明歸屬)
- 子物件的 `<Child>Update` **故意不開放改 `<parent>_id`**——子物件不能換父,要改就刪掉重建
- 主物件 `<Parent>Create` 不含 id / 時間戳(讓 DB 預設)

**Supabase client 雙表常數**:
```python
_client: Optional[Client] = None
_TABLE_PARENT = "appliances"
_TABLE_CHILD = "appliance_tasks"
```

**11 個函式**:
- 主物件 CRUD 5 個:`list_<parents>` / `get_<parent>` / `create_<parent>` / `update_<parent>` / `delete_<parent>`
- 子物件 CRUD 5 個:`list_<children>` / `get_<child>` / `create_<child>` / `update_<child>` / `delete_<child>`
- 領域操作 1 個:見下節

**子物件 list 篩選**(常用):
```python
def list_<children>(<parent>_id: Optional[int] = None) -> list[<Child>]:
    query = _get_client().table(_TABLE_CHILD).select("*").order("id")
    if <parent>_id is not None:
        query = query.eq("<parent>_id", <parent>_id)
    res = query.execute()
    return [<Child>(**row) for row in res.data]
```

**子物件 create 友善預填**(可選):若同時送 `last_done_date` + `cycle_days` 但沒 `next_due_date`,後端自動算 next = last + cycle。讓前端少算一次。

---

## 4. 領域操作:`mark_task_done` 模式

非純 CRUD 的業務動作,獨立函式 + 獨立端點。家電板塊的範例:

```python
def mark_task_done(task_id: int) -> Optional[ApplianceTask]:
    """標任務「今天剛完成」+ 自動推進下次該做日(若有 cycle_days)。"""
    current = get_task(task_id)
    if current is None:
        return None
    today = date.today()
    updates = {
        "last_done_date": today.isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    if current.cycle_days:
        updates["next_due_date"] = (today + timedelta(days=current.cycle_days)).isoformat()
    else:
        updates["next_due_date"] = None  # 不定期任務沒下次
    res = _get_client().table(_TABLE_CHILD).update(updates).eq("id", task_id).execute()
    return ApplianceTask(**res.data[0]) if res.data else None
```

**對應 API 路徑**:`POST /api/<children>/{id}/mark-done`(用動詞 path 區隔「領域操作」跟「純 CRUD」)。

**為什麼要先 `get_task`?** Supabase 版本必須先知道現狀的 `cycle_days` 才能算下次日期(假 DB 版本可以直接讀記憶體,Supabase 要多一次網路 call)。

---

## 5. API 路徑:扁平 + Query 篩選

```
GET    /api/appliances                       # 全部主物件
POST   /api/appliances                       # 新增主物件
GET    /api/appliances/{id}                  # 單一主物件
PATCH  /api/appliances/{id}                  # 修改主物件
DELETE /api/appliances/{id}                  # 刪主物件(DB cascade 連帶刪子)

GET    /api/appliance-tasks?appliance_id=N   # 子物件(可選篩選 query)
POST   /api/appliance-tasks                  # 新增子物件(body 含 parent_id)
GET    /api/appliance-tasks/{id}
PATCH  /api/appliance-tasks/{id}
DELETE /api/appliance-tasks/{id}

POST   /api/appliance-tasks/{id}/mark-done   # 領域操作
```

**不用嵌套路徑**(`/api/appliances/{id}/tasks/...`)——扁平比較簡單,跟既有 bills/shopping 風格一致;父子歸屬靠 query 篩選 + body 傳 `parent_id`。

**端點函式命名**:`api_` 前綴(`api_list_appliances`、`api_create_task` 等),避免跟 import 進來的領域函式撞名。

---

## 6. HTML 模式:卡片 + Modal 內子清單

**結構**:
- 主畫面:**卡片列表**(每張卡顯示主物件摘要 + 子任務狀態摘要)
- 點卡片 → **底部滑出 modal**(跟 bills/shopping 一致風格)
- modal 內**兩個區塊**:
  1. 主物件編輯 form(完整欄位 + 取消/儲存 + 「🗑 刪除」)
  2. 子任務清單(分隔線下方)+ inline 「+ 新增任務」展開式 form

**避免 modal-in-modal**:子任務的新增/編輯**不要另開 modal**,inline 展開 form 就好。modal-in-modal UX 太重、行動裝置體驗差。

**MVP 不做子任務編輯**:只支援「新增 / 標已完成 / 刪除」三個動作。要編輯就刪掉重建。Kevin 對細節要求不高,這算合理簡化。

---

## 7. ⭐ UX 亮點:新增主物件後自動切編輯模式

**問題**:使用者剛建一台家電,通常下一步就是加任務,但任務區塊只在「編輯模式」顯示(新增模式還沒 id,沒法給任務歸屬)。原本 4 步路徑:

```
儲存家電 → 關 modal → 主頁找剛建的卡片 → 點開 → 加任務
```

**解法**:`submitForm` 新增成功的分支內,**不關 modal,改開 editModal**:

```javascript
// submitApplianceForm 內
if (!id) {
  const newAppliance = await res.json();
  await loadAppliances();
  openEditApplianceModal(newAppliance.id);  // ← 關鍵這行
} else {
  closeModal();
  await loadAppliances();
}
```

效果:1 步搞定。

**規則**:任何「主物件 + 子物件」板塊都套這個模式。

---

## 8. 4 種子物件狀態徽章 + 3 種主物件徽章

家電的「任務」徽章(看 `next_due_date` vs today):

| 條件 | 顏色 | 文字 |
|---|---|---|
| `next_due_date` is null | 灰 | 不定期 |
| `days < 0` | 紅 | 逾期 N 天 |
| `days === 0` | 琥珀 | 今天該做 |
| `0 < days ≤ 7` | 琥珀 | N 天後 |
| `days > 7` | 綠 | N 天後 |

家電的「保固」徽章(看 `warranty_until` vs today):

| 條件 | 顏色 | 文字 |
|---|---|---|
| null | (不顯示) | |
| `days < 0` | 灰 | 保固已過 |
| `0 ≤ days ≤ 30` | 琥珀 | 保固剩 N 天 |
| `days > 30` | 綠 | 保固中 |

**未來板塊套用**:這 4 種任務徽章 + 3 種主物件「期限」徽章是通用模式,日期欄位換掉名字就行(車輛 → `next_inspection_date`、寵物 → `next_vaccine_date` 等)。

**主頁卡片摘要**(計算數量):
```javascript
const overdue  = tasks.filter(t => /* days < 0 */).length;
const upcoming = tasks.filter(t => /* 0 ≤ days ≤ 7 */).length;
// 摘要字串:⚠️ N 項逾期 / ⏰ N 項即將到期 / ✓ 全正常 / 無任務
```

---

## 9. Cascade 透明顯示

刪父物件的 `confirm()` 訊息要**明確告訴使用者連帶刪幾個子物件**:

```javascript
const taskCount = (a?._tasks || []).length;
const msg = taskCount > 0
  ? `確定要刪除「${a.name}」?連同 ${taskCount} 個保養/耗材任務一起被刪掉,無法復原。`
  : `確定要刪除「${a.name}」?無法復原。`;
```

DB 層 `on delete cascade` 是後端責任,但 **UI 要對使用者透明**——別讓他點下去才驚訝「我的任務都不見了」。

---

## 10. 主頁卡片摘要:平行 fetch 兩個 endpoint

主頁卡片要顯示「該主物件有多少任務 / 多少逾期」,但 `GET /api/appliances` 不會帶子物件。

**MVP 解法**:主頁載入時**平行 fetch 兩個 endpoint**,前端 JS 分組:

```javascript
async function loadAppliances() {
  const [aRes, tRes] = await Promise.all([fetch(API_APPLIANCES), fetch(API_TASKS)]);
  currentAppliances = await aRes.json();
  const allTasks = await tRes.json();
  const byParent = {};
  allTasks.forEach(t => (byParent[t.appliance_id] = byParent[t.appliance_id] || []).push(t));
  currentAppliances.forEach(a => { a._tasks = byParent[a.id] || []; });
  render();
}
```

**為什麼不寫後端 endpoint** `GET /api/appliances-with-task-summary` 一次回?MVP 沒必要——資料量小、家用流量無感(7 人家庭 + 幾十台家電上限)。等到效能真的不行(例:100+ 台家電)再做後端 join。

---

## 11. 未來套用清單

CLAUDE.md「7 人家庭未來可考慮加入的功能」+「16 個板塊規劃」中,可直接套這份雙表模式的:

| 板塊 | 主物件 → 子事件 | 領域操作 |
|---|---|---|
| 車輛紀錄 | `vehicles` → `maintenance_records` | `mark_maintained` |
| 借用紀錄 | `borrow_items` → `borrow_events` | `mark_returned` |
| 醫療紀錄 | `family_members` → `medical_events` | (無,純紀錄) |
| 寵物管理(未來) | `pets` → `vaccination_records` | `schedule_next_vaccine` |

**新板塊照家電的結構走 5 階段**,只改名字 + 領域操作:
1. SQL:複製 `appliances` + `appliance_tasks` 兩段,table 名 / 欄位名換掉
2. 領域檔:複製 `appliances.py`,所有 `appliance` / `task` 字串 replace 成新名稱
3. main.py 加 11 個端點(複製家電段、改名)
4. HTML 複製 `appliances.html`,改欄位、改 datalist、改徽章邏輯
5. 主頁 `MODULES` 加新卡片,啟用

照新規則「一氣呵成做到主頁能點再停」走,中途不停。

---

## 參考既有檔案

- `appliances.py` — 雙表領域層的標準寫法(6 模型 + 11 函式)
- `static/appliances.html` — 卡片 + modal + 子清單 UI 標準
- `supabase_schema.sql` 的 `appliances` + `appliance_tasks` 段 — 雙表 + FK cascade SQL 模式
- `main.py` 的「家電管理 API」段 — 11 個端點的扁平路徑模式
