---
name: module-supabase
description: family-manager 的「Supabase 接入」方法論 + 踩坑筆記。封裝怎麼把領域檔從「假資料庫(記憶體 dict)」換到「真資料庫(Supabase PostgreSQL)」:拿 key、建表 SQL、supabase-py CRUD 模板、PATCH 語意處理、領域操作改寫、Python 版本相容性、RLS、自我測試。**只要在 family-manager 專案做任何涉及 Supabase 的事(接新板塊上 Supabase、改既有領域檔接 Supabase、debug 連線、加 RLS policy 給家人登入)都先讀這份**。先讀 `system-prep/SKILL.md`(foundation)再讀這份。未來加新板塊(待辦、車輛、公佈欄...)直接套用這份的「領域檔模板」,不用每次重摸索。
---

# family-manager Supabase 接入 SKILL

這份 skill 是 family-manager 從「假資料庫(記憶體 dict)」換到「真資料庫(Supabase PostgreSQL)」的方法論 + 踩坑筆記。**先讀 `system-prep/SKILL.md`(foundation)再讀這份**。

未來加新板塊(待辦、車輛、公佈欄...)用 Supabase 時,直接套這份的「領域檔模板」就行。

## 為什麼選 Supabase(CLAUDE.md 寫的選型)

- 雲端 PostgreSQL,免費版夠 7 人家庭用很久
- 自帶 RESTful API(`supabase-py` 包好,Python 直接打)
- 自帶 Auth(之後做家人登入用 `anon` key + RLS policy)
- 自帶 Storage(之後做照片回憶板塊用)
- 免費版限制:500 MB 資料、7 天無活動 pause、最多 2 個 free project

## 1. 註冊 + 拿 key 完整流程

### 1.1 Organization:用 free org(不要 Pro)

- 7 人家庭用 free 完全夠
- Pro org 每個新建 project 都會多 $10/m,沒必要
- 之後想轉到 Pro 隨時可以(Supabase 原生支援 project transfer,Free → Pro 無 downtime)
- 操作:Supabase 後台首頁 → "Need a free project? Create a free organization"

### 1.2 建 project 各欄位填法

| 欄位 | 填法 |
|---|---|
| Organization | 選 free org |
| Project name | 隨意 |
| Compute size | MICRO(預設,free org 也只有這個) |
| Database password | 點 `Generate a password` 自動產 → **立刻存密碼管理器**(這跟 service_role key 不同,是直接 SQL 連線用,我們 supabase-py 不用,但忘了會很麻煩) |
| Region | 東京(Tokyo)或新加坡(Singapore),對台灣最近 |
| Security: Enable Data API | ✅ 勾 |
| Security: Automatically expose new tables | ✅ 勾 |
| Security: Enable automatic RLS | ⬜ 不勾(我們手動在 SQL 加 `alter table ... enable row level security`) |

### 1.3 拿 key(新版 UI,跟舊版命名不同)

進 project 後:左側齒輪 Settings → API,會看到兩個區塊:

| 區塊 | 對應舊版命名 | 後端拿哪個 |
|---|---|---|
| **Publishable key** | `anon` / `public` key | ❌ 前端用的,我們後端不用 |
| **Secret keys** | `service_role` key | ✅ 後端用,點 `+ New secret key` 自己命名(例 `local-dev`) |

⚠️ Secret key **只顯示一次完整內容**,當下要立刻複製貼到 `.env`。沒複製到沒事——刪掉重產一把。

⚠️ Secret key 外洩(被截圖、commit 進 git)→ 立刻回這頁 **Revoke / Delete** 那把,然後產新的。

### 1.4 放進 `.env`

```
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_KEY=sb_secret_xxx...(很長,幾百字元)
```

`.gitignore` 必含 `.env`(專案預設有)。

**格式重點**:
- 等號**前後不要空格**
- 值**不要加引號**
- service_role key 很長,複製時一次選到底

### 1.5 自檢(不印 key 內容,安全)

```powershell
.\venv\Scripts\python.exe -c "from dotenv import load_dotenv; import os; load_dotenv(); print('URL OK:', bool(os.getenv('SUPABASE_URL'))); print('KEY OK:', bool(os.getenv('SUPABASE_KEY')))"
```

兩個 `True` 才繼續。

## 2. 套件安裝

`requirements.txt` 加:

```
# Supabase 官方 Python SDK,讓後端能呼叫 Supabase REST API
# 內含 postgrest(查資料表)、gotrue(認證)、storage3(檔案)、realtime(即時通知)、pyiceberg(資料分析,我們用不到但會被裝)
supabase
```

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

裝完 import 確認:

```powershell
.\venv\Scripts\python.exe -c "from supabase import create_client; print('supabase 套件 OK')"
```

⚠️ **Python 3.14 會撞 pyiceberg 缺 wheel** → 編譯失敗。要用 3.13.X。詳見 `system-prep/SKILL.md` 的「Python 版本選擇」段。

## 3. 建表 SQL 範本

每個板塊一張表。寫在專案根目錄 `supabase_schema.sql`(一份檔案放全部表)。

**跑法**:Supabase 後台 → 左側 `</> SQL Editor` → `+ New query` → 貼 → `RUN` → 看到 `Success. No rows returned` → 進 `Table Editor` 確認表出現。

### 範本

```sql
create table if not exists <table_name> (
  id              bigint generated always as identity primary key,
  -- 必填欄位(text not null)
  name            text        not null,
  -- 選填欄位(允許 NULL,不寫 not null)
  category        text,
  note            text,
  -- 布林(通常都有預設)
  is_done         boolean     not null default false,
  -- 日期 / 時間
  due_date        date,
  done_at         timestamptz,
  -- 自動時間戳
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 啟用 RLS:預設拒絕所有存取,只有 service_role 繞過
alter table <table_name> enable row level security;
```

### Pydantic ↔ PostgreSQL 型別對應

| Pydantic | PostgreSQL | 備註 |
|---|---|---|
| `int`(id) | `bigint generated always as identity primary key` | DB 自動遞增,Insert 時不送 |
| `str` | `text` | 長度不限,不要用 `varchar(50)` |
| `Optional[str]` | `text`(允許 NULL,不加 `not null`) | |
| `float`(金額) | `numeric` | 比 `float8` 精確 |
| `int`(非 id) | `integer` | |
| `bool` | `boolean not null default false` | 通常一定要值 |
| `date` | `date` | 純日期沒時間 |
| `datetime` | `timestamptz` | **帶時區**,不要用沒時區的 `timestamp` |
| `created_at` / `updated_at` | `timestamptz not null default now()` | DB 預設填 |

### RLS 注意

- **啟用 RLS 但不寫 policy** = `anon` key 完全進不去,`service_role` key 全進
- 我們後端用 `service_role`,所以照常能用
- 之後做家人登入(用 `anon` key 從前端打)時,**才**為每張表寫 policy 開放讀寫
- Supabase 後台會持續警告「table 沒 RLS 是公開的」,啟用就消音

## 4. 領域檔(`<module>.py`)模板:從假 DB 換到 Supabase

### 結構

```python
"""<板塊>領域模組:資料形狀 + Supabase 儲存功能。

跟假資料庫版本的差別:
- 砍掉 `_items: dict` 和 `_next_id`(id 改由 PostgreSQL 自動產)
- 5 個函式對外簽名完全不變,main.py 和 HTML 不用動
"""
import os
from datetime import date, datetime
from typing import Optional

from dotenv import load_dotenv
from pydantic import BaseModel
from supabase import Client, create_client

load_dotenv()


# ===== 3 個 Pydantic 模型(跟假 DB 版本完全一樣,不動) =====
class XxxCreate(BaseModel):
    """新增時前端傳入的資料形狀。沒有 id、時間戳。"""
    name: str
    # 其他欄位...


class XxxUpdate(BaseModel):
    """修改時的資料形狀:所有欄位選填(PATCH 語意)。"""
    name: Optional[str] = None
    # 全部欄位都 Optional


class Xxx(BaseModel):
    """完整資料,含 id 和時間戳。"""
    id: int
    name: str
    # 其他欄位...
    created_at: datetime
    updated_at: datetime


# ===== Supabase client(模組層級單例) =====
_client: Optional[Client] = None
_TABLE = "xxx"   # 對應 Supabase table 名


def _get_client() -> Client:
    """惰性初始化 Supabase client。第一次呼叫才建,之後重用同一個。

    `.env` 沒設 SUPABASE_URL / SUPABASE_KEY 會 raise RuntimeError。
    """
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                ".env 沒設 SUPABASE_URL 或 SUPABASE_KEY,無法連到 Supabase"
            )
        _client = create_client(url, key)
    return _client


# ===== 5 個基本 CRUD =====
def list_xxx() -> list[Xxx]:
    """列出所有 XX,按 id 由小到大排序。"""
    res = _get_client().table(_TABLE).select("*").order("id").execute()
    return [Xxx(**row) for row in res.data]


def get_xxx(item_id: int) -> Optional[Xxx]:
    """取得指定 id 的 XX;找不到回 None。"""
    res = _get_client().table(_TABLE).select("*").eq("id", item_id).execute()
    if not res.data:
        return None
    return Xxx(**res.data[0])


def create_xxx(data: XxxCreate) -> Xxx:
    """新增一筆 XX,回傳完整資料(含 DB 自動產生的 id 和時間戳)。"""
    # mode="json" 把 date / datetime 物件轉成 ISO 字串(JSON 不認 Python 物件)
    payload = data.model_dump(mode="json")
    res = _get_client().table(_TABLE).insert(payload).execute()
    return Xxx(**res.data[0])


def update_xxx(item_id: int, data: XxxUpdate) -> Optional[Xxx]:
    """修改 XX。PATCH 語意:只更新前端有送的欄位。找不到回 None。"""
    updates = data.model_dump(exclude_unset=True, mode="json")
    if not updates:
        # 前端沒送任何欄位,直接回現狀
        return get_xxx(item_id)
    # 手動帶 updated_at(PostgreSQL 沒有 MySQL 的 ON UPDATE 自動更新)
    updates["updated_at"] = datetime.now().isoformat()
    res = _get_client().table(_TABLE).update(updates).eq("id", item_id).execute()
    if not res.data:
        return None
    return Xxx(**res.data[0])


def delete_xxx(item_id: int) -> bool:
    """刪除 XX;成功回 True、找不到回 False。"""
    res = _get_client().table(_TABLE).delete().eq("id", item_id).execute()
    return len(res.data) > 0
```

### 關鍵設計

| 點 | 寫法 | 理由 |
|---|---|---|
| Client singleton | module-level `_client` + `_get_client()` 惰性初始化 | 不每次 CRUD 都新建 client(慢);又能在 `.env` 沒設時給友善錯誤 |
| Insert 不送 id | `data.model_dump()` 不含 id(`XxxCreate` 沒這欄位) | DB 用 `generated always as identity` 自動產 |
| Insert 不送 created_at / updated_at | 不寫進 payload | DB 用 `default now()` 自動填 |
| Update 手動帶 updated_at | `updates["updated_at"] = datetime.now().isoformat()` | PostgreSQL 沒有 ON UPDATE 自動更新 |
| `model_dump(mode="json")` | insert / update 都用 | date / datetime 物件不能直接給 JSON,要轉 ISO 字串 |
| `exclude_unset=True` | 只在 update 用 | PATCH 語意,沒送的欄位保持原值不被覆蓋 |
| 不加 error handling(MVP) | 直接讓錯誤 propagate | FastAPI 會回 500;之後加全域 exception handler 統一處理 |

### supabase-py chain API 對應 SQL

| supabase-py | SQL |
|---|---|
| `.table("bills").select("*")` | `SELECT * FROM bills` |
| `.eq("id", 5)` | `WHERE id = 5` |
| `.order("id")` | `ORDER BY id` |
| `.order("id", desc=True)` | `ORDER BY id DESC` |
| `.insert({...})` | `INSERT INTO ... VALUES (...)` |
| `.update({...}).eq("id", 5)` | `UPDATE ... SET ... WHERE id = 5` |
| `.delete().eq("id", 5)` | `DELETE FROM ... WHERE id = 5` |
| `.execute()` | (實際送出 HTTP 請求) |

response 是 `APIResponse` 物件,用 `.data` 拿結果(永遠是 list,即使 select 單筆也是 1-element list)。

### 對外簽名「不變」(分層架構的好處)

| 函式 | 假 DB 版本 | Supabase 版本 |
|---|---|---|
| `list_xxx()` | 排序回傳 `_items.values()` | `.table().select("*").order("id")` |
| `get_xxx(id)` | `_items.get(id)` | `.eq("id", id)` |
| `create_xxx(data)` | 算 `_next_id` + 存 dict | `.insert(payload)`,id DB 自動產 |
| `update_xxx(id, data)` | `item.model_copy(update=...)` | `.update(updates).eq("id", id)` |
| `delete_xxx(id)` | `del _items[id]` | `.delete().eq("id", id)` |

**`main.py` 和 `static/xxx.html` 完全不動**——只動 `<module>.py` 一個檔案。

## 5. 領域操作(非 CRUD)接 Supabase

### 範例 A:一鍵刪除符合條件的多筆(像採購清單的 `clear_bought`)

```python
def clear_bought() -> int:
    """一鍵清掉所有已買的品項。Returns: 被清掉的數量。"""
    # 先 select 算數量
    res = _get_client().table(_TABLE).select("id").eq("is_bought", True).execute()
    count = len(res.data)
    if count > 0:
        _get_client().table(_TABLE).delete().eq("is_bought", True).execute()
    return count
```

### 範例 B:「狀態變化偵測」自動填衍生時間戳

例如 `is_bought: False → True` 自動填 `bought_at = 現在`;`True → False` 自動清掉。Supabase 版本要**先抓現狀**才能比對(假 DB 版本可以直接讀 `_items[id]`,Supabase 要多一次網路 call):

```python
def update_xxx(item_id: int, data: XxxUpdate) -> Optional[Xxx]:
    """修改。處理 is_bought 變化時的 bought_at 自動填寫。"""
    # 多一次 get 拿現狀(假 DB 版本沒這步)
    current = get_xxx(item_id)
    if current is None:
        return None

    updates = data.model_dump(exclude_unset=True, mode="json")

    # 狀態變化偵測
    if "is_bought" in updates:
        if updates["is_bought"] and not current.is_bought:
            updates["bought_at"] = datetime.now().isoformat()
        elif not updates["is_bought"] and current.is_bought:
            updates["bought_at"] = None

    updates["updated_at"] = datetime.now().isoformat()
    res = _get_client().table(_TABLE).update(updates).eq("id", item_id).execute()
    return Xxx(**res.data[0]) if res.data else None
```

**注意**:這多一次網路呼叫(get + update 兩次),對家庭流量無感,但邏輯比假 DB 版本貴。要極致優化可以改用 SQL `CASE`/trigger,但 MVP 階段不必。

## 6. 自我測試模板

```python
if __name__ == "__main__":
    """跑法: .\venv\Scripts\python.exe <module>.py"""
    print("=== <module>.py Supabase 連線自我測試 ===\n")

    print("[1/4] 新增 2 筆測試資料...")
    a = create_xxx(XxxCreate(name="[測試] A", ...))
    b = create_xxx(XxxCreate(name="[測試] B", ...))
    print(f"  新增完成 → #{a.id} {a.name}, #{b.id} {b.name}")

    print("\n[2/4] list_xxx() 確認能讀到...")
    items = list_xxx()
    print(f"  目前共 {len(items)} 筆(含其他先前資料)")

    print(f"\n[3/4] update_xxx() 修改 #{a.id}...")
    update_xxx(a.id, XxxUpdate(...))
    a_after = get_xxx(a.id)
    print(f"  更新後: ...")

    print(f"\n[4/4] 清掉測試資料(刪除 #{a.id} 和 #{b.id})...")
    delete_xxx(a.id)
    delete_xxx(b.id)
    print(f"  刪除完成")

    print("\n[OK] Supabase 連線測試全通過")
```

**重點**:
- 測試資料名稱加 `[測試]` 前綴,在 Supabase Table Editor 一眼辨識
- 跑完一定 `delete_xxx` 清乾淨(不留測試資料在正式 DB)
- 跑過程 Supabase Table Editor 會短暫看到測試資料閃過,正常
- PowerShell 中文輸出可能亂碼,實際邏輯對就好

## 7. 加新板塊用 Supabase 的完整流程

依照 `system-prep/SKILL.md` 的 5 階段流程,差別只在「階段 2 寫領域檔」:

| 階段 | 跟假 DB 比的差別 |
|---|---|
| 1. Schema 設計 | 一樣,Pydantic 三模型 |
| 2. 寫領域檔 `<module>.py` | **套這份的 Supabase 模板**(取代假 DB 模板) |
| 2.5. **新增建表 SQL** | 補進 `supabase_schema.sql`,去 Supabase SQL Editor 跑 |
| 3. `main.py` 加 API 端點 | 完全一樣,沒變 |
| 4. 寫 `static/<module>.html` | 完全一樣,沒變 |
| 5. 啟用主頁卡片 | 完全一樣,沒變 |

## 8. 踩坑筆記

### 8.1 pyiceberg + Python 版本相容性

`supabase` 套件最新版內部 `storage` 整合了 `pyiceberg`(Apache Iceberg 資料分析,我們用不到)。`pyiceberg` 最新版沒釋出 Python 3.14 的 wheel → pip 嘗試從原始碼編譯 → 需要 Microsoft C++ Build Tools(6+ GB)→ 失敗。

**解法**:Python 用 3.13.X(看 `system-prep/SKILL.md` 的「Python 版本選擇」)。

### 8.2 PostgREST 對 numeric 欄位的回傳

`numeric` 欄位(我們用在金額)在 PostgREST 預設可能回字串(避免大數精度損失)。Pydantic v2 的 `float` field 會自動把字串 parse 成 float,**不用特別處理**。

### 8.3 時區(timestamptz)

- Python `datetime.now()` 是 naive 沒時區
- `.isoformat()` 給 supabase 後,PostgreSQL 視為 UTC 存
- 對家庭管理系統影響很小(我們不顯示 created_at / updated_at 給使用者看,只給工程師除錯用)
- 未來要顯示精確時間,改用:
  ```python
  from datetime import datetime, timezone
  datetime.now(timezone.utc).isoformat()
  ```

### 8.4 service_role key 跟 Database password 是兩個東西

| | 拿哪 | 後端用法 |
|---|---|---|
| **service_role key**(`sb_secret_...`) | Settings → API → Secret keys | supabase-py 用,放 `.env` |
| **Database password** | 建 project 時 Generate 的那個 | 直接 SQL 連線(pgAdmin / psql)用,我們不用但存好 |

### 8.5 自我測試的測試資料記得刪

假 DB 時測試資料重啟就消失,接 Supabase 後是真寫進去。**忘了刪會留在正式 DB**——每個自我測試結尾都加 `delete_xxx`。

### 8.6 RLS 啟用但沒寫 policy 時的行為

| Key 種類 | 行為 |
|---|---|
| `service_role` key | **全部繞過** RLS,所有讀寫都能 |
| `anon` key | **全部拒絕**(沒 policy 等於沒授權) |

我們後端用 service_role,所以照常能用。**之後做家人登入(用 anon key 從前端打)時**,要為每張表寫 policy 開放讀寫權限。

## 9. 跟其他板塊的串接點

(預留,之後做完家人登入、Storage 等再補)

- **家人登入(用 Supabase Auth + anon key + RLS policy)** — 還沒做
- **照片回憶(用 Supabase Storage)** — 還沒做,目前 CLAUDE.md 規劃用 Google Drive,可考慮改用 Supabase Storage 減少接點

## 參考既有檔案

- `supabase_schema.sql` — 所有表的建表 SQL,單一資料來源
- `bills.py` / `shopping.py` — Supabase 接好後的領域層標準寫法(改完後)
- `.env.example` — `SUPABASE_URL` / `SUPABASE_KEY` 樣板
