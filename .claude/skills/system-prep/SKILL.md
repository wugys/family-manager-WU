---
name: system-prep
description: family-manager(Kevin 的 7 人家庭管理系統)專案的「系統前置作業」foundation skill,封裝整個專案的通用基礎:開發環境(Windows + venv + uvicorn)、Kevin 的工作習慣(全程繁中、一氣呵成做到主頁能點再停、不寫 Python 自我測試、概念第一次出現要解釋、不主動引入套件)、架構原則(分層、資料一律 Supabase、UI/UX 為主)、加新板塊的 5 階段標準流程、常用 UI/UX 模式、Windows + uvicorn 踩坑筆記。在 family-manager 專案資料夾工作時請務必使用這個 skill——不論是加新板塊、改現有板塊、修 bug、解釋觀念,只要在這個專案內做事都從這份開始。日後每個大板塊(帳單、採購、待辦、車輛、公佈欄、…)會各自有專屬的 skill 處理板塊特定的細節(schema、特殊端點、特殊 UI),但都建立在這份 foundation 之上,**先讀這份、再讀板塊 skill**。
---

# Family Manager 系統前置作業 SKILL

這份 skill 是 family-manager 專案的「系統前置作業」——所有通用的方法論、工作習慣、架構觀念、踩坑筆記都在這。Kevin 是後端完全新手,所有溝通用繁體中文,他對 UI/UX 細節有要求,對後端細節可以接受跳過。

日後每個大板塊(帳單、採購清單、待辦事項、車輛紀錄、公佈欄……)會有專屬 skill 處理板塊特定細節(schema、特殊端點、特殊 UI),但都建立在這份 foundation 之上,**先讀這份、再讀板塊 skill**。如果某個板塊的 skill 還沒建立(或還沒做完),用這份 foundation + `bills.py` / `shopping.py` 當模板現場走一遍 5 階段流程即可。

## 開工前必做

1. **整份讀完 `CLAUDE.md`**(專案根目錄),特別是「**強制規則(製作各板塊通用)**」「目前進度」「禁止事項」「開發守則」「工作 SKILL 對照」
2. 看一眼 `static/index.html` 的 `MODULES` 物件,知道 16 個板塊現在 active/planned 的狀態
3. 簡短回 Kevin:看懂進度 + 列下一步選項 + 等他說「可以」才動工

`CLAUDE.md` 是「現在做到哪」的事實,**這份 skill 是「怎麼做」的方法論**,兩個互補。

## Kevin 的工作習慣(每次都要遵守)

1. **全程繁體中文**——回覆、程式碼註解、變數說明、docstring 都繁中
2. **一氣呵成做到主頁能點進去再停**——不中途停下來給 Kevin 看 Python 自我測試或 `/docs` API 驗證(Kevin 看不到的東西不算進度);完成後給明確 UI 驗證清單(具體要點哪個按鈕、看到什麼結果)
3. **第一次出現的概念要解釋**——套件、指令、術語都先說「這是什麼、為什麼用」
4. **變數 `snake_case`、類別 `PascalCase`、每個函式有繁中 docstring**
5. **不主動引入新套件**,要先說明用途;新加套件後更新 `requirements.txt`
6. **金鑰只進 `.env`**,不要叫 Kevin 貼到對話、不 commit
7. **不當啦啦隊**——該說的講出來,設計做了簡化選擇要主動標出來讓 Kevin 反對
8. **介面變動立即可驗**(2026-05-28 加)——改完 `static/*.html` / CSS / JS 後**立刻**叫 Kevin 重新整理頁面確認,不要再接後端 sanity check(`python -c "import"`)。HTML 是 static file 改完即時生效;後端 check 拖時間 → Kevin 等不及打斷 → background uvicorn 被連帶砍掉 → 反而看不到頁面。**uvicorn 在跑就保持在跑**,只有改 `.py` 且 `--reload` 卡住才重啟。詳見 CLAUDE.md「強制規則 > 開發節奏」第 5 條
9. **uvicorn 被動處理,不主動 verify**(2026-05-28 加→修正)——**不要**主動 `Invoke-WebRequest` verify uvicorn;每次 verify 都有被 Kevin reject 的可能,reject 連帶砍 background uvicorn,反而製造問題。**Kevin 看到 ERR_CONNECTION_REFUSED 告訴 Claude 才重啟**。例外:Claude 動了 `.py` / 裝套件 / 跑 schema 後可以主動重啟一次,但仍不 verify。詳見 CLAUDE.md「強制規則 > 開發節奏」第 6 條
10. **新板塊上傳功能要 surface 歸檔規則**(2026-05-28 加)——板塊會上傳檔案到 Drive 時,**主動列 2-3 個 `kind_label` 候選**讓 Kevin 挑(別自己拍板)。命名規則統一 `<板塊主物件名>-<kind_label>-<原檔名>`(套 `main.py` 的 `api_upload_appliance_file`)。詳見 CLAUDE.md「強制規則 > 開發節奏」第 8 條
10. **Kevin 只看最後結果**(2026-05-28 加)——驗收只看「網頁如預期 + 文字資料進 Supabase」兩件事。**不要先給 Kevin 看 SQL/程式碼解釋讓他點頭再動手**,這只會延長等待。一般 DDL(`ALTER TABLE ADD/DROP COLUMN`、`CREATE TABLE`)直接跑。例外:`supabase_admin.py` 黑名單擋住的破壞性 DDL(`DROP TABLE` / `TRUNCATE`)才需 Kevin 同意拆白名單。詳見 CLAUDE.md「強制規則 > 開發節奏」第 7 條

Python 一律用完整路徑跑:
```powershell
.\venv\Scripts\python.exe ...
```
因為 Windows PowerShell 每個指令是獨立 process,不會繼承 venv 啟用狀態。

## 加一個板塊的 5 階段流程

把 `bills.py` + `static/bills.html` 和 `shopping.py` + `static/shopping.html` 當作模板。**新板塊照同樣結構寫**,出現分歧時參考既有的決定。

### 階段 1:Schema 設計(白紙作業,不寫程式)

用表格列欄位 + 中文意思 + 型別 + 必填? + 範例。表格貼到對話讓 Kevin 看。

接著用 `AskUserQuestion` 問 1~2 個**真正影響架構**的設計選擇,例如:
- 變動 vs 固定資料(像帳單金額會不會變)
- 是否要另開「歷史紀錄」表 vs 用單一欄位
- 文字欄位 vs 另開分類資料表

**不要問太多**。Kevin 對細節沒興趣,給合理預設讓他「反對」即可。

合理預設的範例:
- 「負責人」用文字欄位,不另開家人表(7 人未來再說)
- 「類別」用文字欄位 + datalist 預設選項,不另開分類表
- 不開歷史紀錄表(MVP 階段)

設計完跟 Kevin 確認後再進階段 2。

### 階段 2:寫領域檔 `<name>.py`

**複製 `bills.py` 或 `shopping.py` 改最快**。固定結構:

**三個 Pydantic 類別**(輸入/輸出 schema 分離):

```python
class XxxCreate(BaseModel):
    """新增時前端傳入的資料形狀。沒有 id、時間戳。"""
    name: str
    # ... 其他欄位,選填的用 Optional[T] = None


class XxxUpdate(BaseModel):
    """修改用,所有欄位都選填(PATCH 語意)。"""
    name: Optional[str] = None
    # ... 全部欄位都 Optional


class Xxx(BaseModel):
    """完整資料,含 id 和時間戳。"""
    id: int
    # ... 所有欄位
    created_at: datetime
    updated_at: datetime
```

**資料層:Supabase**(套 `module-supabase` skill 的領域檔模板)

按 `module-supabase` SKILL 寫:`_get_client()` 惰性建立 + `_TABLE = "<table>"` 常數 + 所有 CRUD 走 `_get_client().table(_TABLE)....execute()`。**禁止寫記憶體假資料庫**(`_items: dict` 是已淘汰的舊模式,見 CLAUDE.md「禁止事項」)。

**5 個基本函式**:`list_items()`、`get_item(id)`、`create_item(data)`、`update_item(id, data)`、`delete_item(id)`。

`update_item` 的關鍵兩行(防止把沒送的欄位覆寫成 None):

```python
updates = data.model_dump(exclude_unset=True)  # 只拿前端有送的欄位
updated = item.model_copy(update={**updates, "updated_at": datetime.now()})
```

**需要「領域操作」**(不是 CRUD 的業務動作)就獨立加函式,例如:
- `clear_bought() -> int`(採購清單一鍵清掉已買)
- `mark_paid_and_advance(id)`(帳單標已繳並推進到期日)

**`bought_at` / `paid_at` 之類的衍生時間戳**:用「狀態變化偵測」自動填,**不開放前端設**(單一資料來源):

```python
if "is_bought" in updates:
    if updates["is_bought"] and not item.is_bought:
        updates["bought_at"] = now    # 變為已買 → 填現在
    elif not updates["is_bought"] and item.is_bought:
        updates["bought_at"] = None   # 反悔 → 清掉
```

**不寫 `if __name__ == "__main__":` 自我測試區塊**——Kevin 不會跑、只是雜訊(見 CLAUDE.md「強制規則 > 流程慣例」)。寫完領域檔**不停下來**,接著做階段 3(寫 API 端點)時用 `python -c "import main"` 一起 sanity check 有沒有語法 / import 錯誤。

### 階段 3:在 `main.py` 加 API 端點

加 import(放到既有的 import 區):

```python
from <name> import (
    Xxx, XxxCreate, XxxUpdate,
    create_item, delete_item, get_item, list_items, update_item,
    # 領域操作函式也 import
)
```

加 5 個 CRUD 端點(放在既有端點之後),路徑 `/api/<resource>`,加 `tags=["中文板塊名"]` 讓 `/docs` 自動分組,**端點函式用 `api_` 前綴**避免跟 import 進來的領域函式撞名:

```python
@app.get("/api/xxx", response_model=list[Xxx], tags=["XX 板塊"])
def api_list_xxx():
    """列出所有 XX。"""
    return list_items()


@app.post(
    "/api/xxx",
    response_model=Xxx,
    status_code=status.HTTP_201_CREATED,
    tags=["XX 板塊"],
)
def api_create_xxx(data: XxxCreate):
    """新增一筆 XX。"""
    return create_item(data)


@app.get("/api/xxx/{item_id}", response_model=Xxx, tags=["XX 板塊"])
def api_get_xxx(item_id: int):
    """取得單一 XX。找不到回 404。"""
    item = get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"找不到 id={item_id} 的 XX")
    return item


@app.patch("/api/xxx/{item_id}", response_model=Xxx, tags=["XX 板塊"])
def api_update_xxx(item_id: int, data: XxxUpdate):
    """修改 XX(PATCH 語意,只更新有送的欄位)。"""
    updated = update_item(item_id, data)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"找不到 id={item_id} 的 XX")
    return updated


@app.delete(
    "/api/xxx/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["XX 板塊"],
)
def api_delete_xxx(item_id: int):
    """刪除 XX。"""
    ok = delete_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"找不到 id={item_id} 的 XX")
    return None
```

**領域操作端點**(若有)用 POST 加動詞 path:

```python
@app.post("/api/xxx/clear-bought", tags=["XX 板塊"])
def api_clear_bought():
    return {"removed": clear_bought()}
```

**這步不停下來給 Kevin 驗證**(/docs API 對 Kevin 來說「看不到的東西不算進度」)。直接用 `python -c "import main"` sanity check 後接階段 4 寫 HTML;Kevin 從前端 UI 統一驗收。

### 階段 4:寫 `static/<name>.html`

**複製 `static/bills.html` 或 `static/shopping.html` 改**。Tailwind CDN 模式,vanilla JS。

**必要結構**:

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>XX 板塊</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* modal 從底部滑上來 */
    .modal-slide { transform: translateY(100%); transition: transform 0.25s ease-out; }
    .modal-slide.open { transform: translateY(0); }
  </style>
</head>
<body class="bg-slate-50 min-h-screen text-slate-900">
  <header class="bg-white shadow-sm sticky top-0 z-10">
    <div class="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
      <a href="/static/index.html" class="text-slate-500 hover:text-slate-900 text-sm">← 主頁</a>
      <h1 class="text-lg font-bold flex-1">XX 板塊</h1>
      <!-- 加新增按鈕、計數器等 -->
    </div>
    <!-- 篩選 chips,可選 -->
  </header>

  <main class="max-w-md mx-auto px-4 py-3">
    <div id="list-container"></div>
    <div id="empty-state" class="text-center text-slate-500 py-16 hidden">...</div>
    <div id="loading-state" class="text-center text-slate-400 py-16">載入中…</div>
  </main>

  <!-- modal、底部黏住列等 -->

  <script>
    const API = '/api/xxx';
    /* loadItems, render, esc, modal 操作, fetch CRUD */
  </script>
</body>
</html>
```

**必要的 UI/UX 模式**(從 bills.html / shopping.html 提煉,不要省):

| 模式 | 為什麼 | 怎麼寫 |
|---|---|---|
| 容器 `max-w-md mx-auto` | 手機優先,寬螢幕也好看 | 統一最大寬度 |
| sticky 頂列 | 滾動時不會失去主操作 | `sticky top-0 z-10` |
| 篩選 chips | 切視角(全部/待 X/已 X) | flex gap-2 px-3 py-1 rounded-full |
| 底部滑出 modal | 像原生 App,單手好操作 | transform translateY + transition,JS `requestAnimationFrame` 觸發 `.open` |
| 大顆觸控目標 | 推車單手點不會誤觸 | button `py-2.5` 起跳;圓形勾選框 `w-7 h-7 rounded-full border-2` |
| `active:scale-95` | 觸覺回饋 | 主按鈕都加 |
| 確認框 | 不可逆動作前 | 用原生 `confirm()`,別自己寫 |
| 點 backdrop 關 modal | 手機常見模式 | onclick 檢查 `event.target === event.currentTarget` |
| XSS 防範 | render 使用者輸入到 innerHTML 時 | `esc()` 函式用 `textContent` 包: |

```javascript
function esc(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}
```

**API 串接**用 `fetch` + async/await,**錯誤一定要 alert**:

```javascript
async function loadItems() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    items = await res.json();
    render();
  } catch (e) {
    alert('載入失敗:' + e.message);
  }
}
```

**PATCH 用法**:只送有改的欄位,後端會用 `exclude_unset` 正確處理:

```javascript
await fetch(`${API}/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ is_bought: true }),  // 只送這個
});
```

**不要引入 React/Vue/任何 JS 框架**。Kevin 要看得懂單一 HTML。

**這步驗證**:Kevin 開瀏覽器看頁面,試 CRUD 動作。可以引導他依照特定操作順序體驗各個 UX 重點。

### 階段 5:啟用主頁卡片

編輯 `static/index.html`,在 `MODULES` 物件裡找到對應條目:

```javascript
{ name: 'XX 板塊', icon: '🔧', desc: '...', status: 'planned' },
```

把 `status` 改成 `'active'` 並加 `href`:

```javascript
{ name: 'XX 板塊', icon: '🔧', desc: '...', status: 'active', href: '/static/xxx.html' },
```

主頁自動把它變成綠色已啟用卡片。

**這步驗證**:Kevin 開主頁 `http://127.0.0.1:8000` 看到新卡片變綠、可點。

## 架構觀念(寫程式時記在腦袋裡)

1. **分層架構** — 領域檔(資料層)和 `main.py`(API 層)分開。**之後換 Supabase 時只動領域檔,API 和 HTML 完全不動**。所有設計都要服務這個原則
2. **資料層一律走 Supabase**(結構化文字)或 **Google 雲端硬碟**(照片/影片等大檔)— 見 CLAUDE.md「強制規則 > 資料儲存」+ `module-supabase` skill,記憶體假資料庫已禁止
3. **UI/UX 為主,後端少廢話** — Kevin 對網頁體驗有要求。API 講重點即可、HTML 認真做

## Windows 踩坑筆記

### uvicorn --reload 卡住

`uvicorn --reload` 在 Windows 偶爾偵測到改動但 reload 卡住。**這不是程式碼問題,是 uvicorn + WatchFiles + Windows 的相容性 bug**。

**徵兆**:
- log 看到 `WARNING: WatchFiles detected changes in '<file>'. Reloading...`
- **但沒接** `INFO: Application startup complete.`
- 戳新加的端點還是 404、看到舊的內容

**處理流程**:

1. **先排除程式碼錯誤**:
   ```powershell
   .\venv\Scripts\python.exe -c "import main"
   ```
   - 有錯 → 程式碼問題,回去改
   - 靜悄悄結束 → 程式碼 OK,是 uvicorn 卡住

2. **若有用 background task 啟動的 uvicorn**(有 task_id),用 `TaskStop` tool 砍掉

3. **重啟**(`run_in_background=true`):
   ```powershell
   .\venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

**不要用 `taskkill /F /IM python.exe`** — 那會殺到使用者其他不相關的 Python 程式。

### Python 版本選擇

去 python.org 挑版本,看 Active Python releases 圖的顏色:

| 顏色 | 意思 | 能用嗎 |
|---|---|---|
| 🔴 end-of-life | 完全不維護 | ❌ |
| 🟡 security | 只修安全漏洞,套件生態快退場 | △ 能用但快退場 |
| 🟢 bugfix | 積極維護中 | ✅ 選這個 |
| prerelease / feature | 還沒正式釋出 | ❌ |

**規則:選綠色 bugfix 的「次新版」**,不是最新的綠色版。

理由:最新的綠色版剛釋出,套件 wheel 還沒齊全(會導致 pip install 嘗試從原始碼編譯,需要 Microsoft C++ Build Tools 6+ GB,通常失敗)。次新版穩定 + wheel 齊。

**2026 年 5 月當前建議**:Python **3.13.13**(3.14 太新撞 `pyiceberg` 缺 wheel,3.12 已轉黃 security)。

選好 patch 版本時,**同 minor 內挑最大的 patch**(例如 3.13.13 > 3.13.7),patch 越大代表修了越多 bug。

### Python 多版本並存 + py launcher

多版 Python 可並存(裝新版**不用**解除安裝舊版),用 `py` launcher 指定:

```powershell
py -3.13 --version       # 跑 3.13
py -3.14 --version       # 跑 3.14
py -3.13 -m venv venv    # 用 3.13 建虛擬環境
```

**砍 venv 重建**(撞 wheel 問題、想換 Python 版本時):

```powershell
Remove-Item -Recurse -Force venv
py -3.13 -m venv venv
.\venv\Scripts\python.exe --version    # 關鍵驗證:確認版本對
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

砍 venv 前要先**關掉所有用到 venv 的視窗**(uvicorn、python.exe),不然檔案佔用刪不掉。

⚠️ **裝新版 Python 後務必關掉所有舊 PowerShell 視窗,重開**——舊視窗的 PATH 是舊的,讀不到新裝的 Python。

⚠️ Windows Python installer 預設**沒勾**「Add python.exe to PATH」checkbox,**安裝時務必勾**。沒勾的話 `py` launcher 找不到。

### cmd vs PowerShell 分辨

family-manager 約定一律用 PowerShell。判斷方式:

| 標誌 | PowerShell | cmd(命令提示字元) |
|---|---|---|
| Prompt 開頭 | `PS C:\...>`(**有 PS**) | `C:\...>`(**沒 PS**) |
| 標題列 | `Windows PowerShell` 或 `Windows Terminal` | `命令提示字元` |
| 常見指令差別 | `Remove-Item` `Copy-Item` `Get-ChildItem` | `del` `copy` `dir` |

**最快開法**(直接開在指定資料夾):

1. 開檔案總管,進到專案資料夾(`C:\Users\妤\Documents\family-manager`)
2. 點上方位址列(整條變藍可編輯)
3. 輸入 `powershell` 按 Enter
4. PowerShell 視窗開出來,**已經在該資料夾**(prompt 顯示 `PS C:\Users\妤\Documents\family-manager>`),直接跑指令

Kevin 開錯成 cmd 時,直接讓他用此法重開,別教 cmd 語法(避免之後混淆)。

## 一氣呵成到主頁能點再 STOP

加新板塊時,**整個 5 階段一氣呵成做完才停**:SQL → 領域檔 → API 端點 → HTML 頁 → 主頁卡片啟用。中途**不停下來給 Kevin 看 Python 自我測試 / `/docs` API 驗證 / 中間檔的進度報告**——對 Kevin 來說「看不到的東西不算進度」,唯一的驗收是從前端 UI 操作。

**停下來的時機**(只有這幾種):
1. **遇到真的需要 Kevin 決定的設計分歧**(像「兩張表 vs 一張表」「保養週期單一 vs 多事項」)→ 用 `AskUserQuestion`,給合理預設讓他反對
2. **需要 Kevin 手動跑外部動作**(Supabase SQL Editor 跑 DDL、貼金鑰到 .env、註冊外部服務)→ 給明確步驟
3. **5 階段全做完、主頁卡片可點** → 列「結束時的固定收尾」(下一節),Kevin 從 UI 統一驗收

**程式碼錯誤自己解**:寫程式碼有 import / 語法錯誤,用 `python -c "import main"` 自己 sanity check 修掉,別丟給 Kevin。

**例外**(不是加新板塊的場景):bug 修復、單一板塊深化、UI 微調等,按事情大小自然斷點即可。

## 結束時的固定收尾

最後一個檔案改完後,固定做這三件事:

1. **明確驗證清單** — 列 3~5 個 Kevin 可以在瀏覽器測的動作,對應 UX 重點(例如「試試連續快速加入」「試試切換篩選」)
2. **設計簡化選擇** — 列出 2~3 個你做的簡化決定(例如「沒做自動推進日期」「分類用文字不另開表」),讓 Kevin 有機會反對
3. **下一步選項** — 至少列 3 個方向給 Kevin 挑(例如:接 Supabase / 多做板塊 / 深化現有)

## 進度更新

完成一個板塊後,**主動提議更新 `CLAUDE.md` 的「目前進度」段落**(只動那一段)。Kevin 同意才動手,用 `Edit` 工具改。新進度應包含:
- 板塊名 + 用到的檔案(`xxx.py` / `static/xxx.html`)
- 端點清單
- 主頁狀態變化

## 參考既有檔案

寫程式碼前不確定某個寫法,先打開:

- `bills.py` — 帳單領域層的標準寫法(含 datetime / date 分別)
- `shopping.py` — 採購清單領域層(含「狀態變化偵測」自動填時間戳、領域操作 `clear_bought`)
- `static/bills.html` — 卡片式列表的標準寫法
- `static/shopping.html` — 列表行式 + 分類分組 + 快速新增的標準寫法
- `static/index.html` — 主頁卡片格式 + MODULES 物件結構
- `main.py` — API 端點掛載的標準寫法

新板塊照同樣的結構寫,模式一致 = Kevin 看程式碼不會卡住。
