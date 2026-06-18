---
name: system-drive
description: family-manager 接通 Google Drive 上傳/儲存的「OAuth 2.0」方法論。封裝為什麼不用 Service Account、Google Cloud 一次性設定步驟、`drive_storage.py` + `authorize_drive.py` 模板、新板塊套用模板、Drive 命名規則、踩坑筆記(Service Account 沒 quota / 用錯帳號 / Testing 7 天過期 / Windows port 占用)。新板塊有「上傳檔案到雲端」需求時(車輛紀錄、借用紀錄、寵物、照片回憶等)讀這份。先讀 `system-prep` + `module-supabase` 再讀這份。
---

# family-manager Google Drive 接入 SKILL

family-manager 接通 Google Drive(用於存照片、PDF 說明書、影片等大檔案)的「OAuth 2.0」方法論 + 完整模板 + 踩坑筆記。

新板塊有「上傳檔案到雲端」需求(車輛紀錄要存行照、借用紀錄要存物品照片、寵物要存接種證明、照片回憶要存全家福...)就讀這份。**先讀 `system-prep/SKILL.md`(foundation)+ `module-supabase/SKILL.md`(資料儲存基礎)再讀這份**。

## 為什麼用 OAuth 2.0 而非 Service Account

Google **2024 後新規則**:Service Account **沒有 storage quota**,不能寫個人 Drive(撞 `storageQuotaExceeded`)。Google 給的兩條合法路:
1. **Shared Drive** — Workspace 企業版才有,個人帳號用不了
2. **OAuth 2.0** — 用個人帳號授權,寫入該帳號的 Drive

個人 Google 帳號(像 `wugys.tw@gmail.com`)**只能走 OAuth 2.0**。

**架構設計**:全家共用一個 OAuth 帳號(wugys.tw),家人從前端按上傳 → 後端用 wugys.tw 的 token 寫到 wugys.tw Drive。家人**不需要各自做 OAuth 授權**(他們只是網頁使用者,不是 OAuth 主體)。

## Kevin 一次性要做的(估 15-20 分鐘)

### 1. Google Cloud Console 設定

`family-manager-drive` GCP project 內:

| 步驟 | 怎麼做 |
|---|---|
| 啟用 Google Drive API | APIs & Services → Library → 搜「Google Drive API」→ ENABLE |
| OAuth consent screen | User Type = External / App name = `家庭管理系統` / 不加 scope / SAVE |
| Test users 列表 | Add Users → 加 `wugys.tw@gmail.com`(及未來要授權的其他主帳號) |
| OAuth Client ID | Credentials → CREATE CREDENTIALS → OAuth client ID → 應用程式類型「**電腦版應用程式**」(Desktop app)→ DOWNLOAD JSON |
| JSON 放專案根目錄 | 改名 `oauth-client-secret.json`(注意 Windows 隱藏副檔名雙 `.json` 陷阱)→ 放 `family-manager/` 根目錄 |

### 2. 跑授權腳本拿 token

Kevin **自己開 PowerShell 跑**(避免 Claude 跑 → reject 連帶砍 background uvicorn):

```powershell
.\venv\Scripts\python.exe authorize_drive.py
```

瀏覽器跳出時:
- ⚠️ **選對的 Google 帳號**(`wugys.tw@gmail.com`)。多帳號同時登入時要點對。**用錯帳號授權檔案會跑到別人 Drive**,debug 很久(這個 session 撞過 yaryna 帳號的坑)
- 看到「未驗證 app」警告 → Advanced → Go to 家庭管理系統 (unsafe)
- 點「繼續」/「允許」
- 瀏覽器顯示「The authentication flow has completed」→ 關掉分頁
- PowerShell 顯示「✅ 授權成功」→ `drive-token.json` 已寫進專案根目錄

### 3. 重啟 uvicorn

uvicorn 內 `_drive_service` 是 module-level singleton,改 token 後要重啟才會讀新 token。

## 程式碼模板(已就位,新板塊直接用)

### `drive_storage.py` 對外 API

- `upload_file(file_obj, filename, module_name, mime_type)` → 回傳 view URL
- `delete_file_by_url(url)` → 從 view URL 解析 file_id 並刪除(失敗不 raise,不擋呼叫者流程)
- `extract_file_id(url)` → 從 view URL 反解 file_id(給前端算 thumbnail URL 用)

**關鍵設計**:
- `_ROOT_FOLDER_NAME = "家庭管理系統"`:程式自動在 Drive root 找/建這個根資料夾
- `_module_folder_cache`:子資料夾 ID cache,同 process 第二次起 O(1)
- 結構:`Drive root / 家庭管理系統 / <module_name> / <檔案>`
- **不依賴** `.env` 的 `DRIVE_PARENT_FOLDER_ID`(舊版需要,因為 ID 易出錯改成自動 by name 找)

### 板塊 upload endpoint(套這個模板)

`main.py` 內 `api_upload_appliance_file`(家電板塊)是標準模板。**新板塊照抄改 3 個變數**:

```python
@app.post("/api/<新板塊>/{<主物件>_id}/upload", tags=["<新板塊中文名>"])
async def api_upload_<新板塊>_file(
    <主物件>_id: int,
    kind: str,  # 例:"photo" 或 "manual" 或 "license" ...
    file: UploadFile = File(...),
):
    # 1. 驗證 kind 合法
    if kind not in ("<合法 kind 清單>"):
        raise HTTPException(status_code=422, ...)

    # 2. 取主物件
    obj = get_<主物件>(<主物件>_id)
    if obj is None:
        raise HTTPException(status_code=404, ...)

    # 3. 有舊檔先刪 Drive(避免孤兒)
    old_url = obj.<對應欄位>
    if old_url:
        delete_file_by_url(old_url)

    # 4. 命名規則:<主物件名>-<kind_label>-<原檔名>
    kind_label = {"photo": "<板塊照片>", "manual": "<板塊文件>"}[kind]
    obj_name = obj.name.replace("/", "-").replace("\\", "-")
    original_name = (file.filename or "untitled").replace("/", "-").replace("\\", "-")
    safe_filename = f"{obj_name}-{kind_label}-{original_name}"

    # 5. 上傳到該板塊的 Drive 子資料夾
    view_url = drive_upload_file(
        file.file,
        filename=safe_filename,
        module_name="<板塊中文名>",  # 例:「家電管理」、「車輛紀錄」
        mime_type=file.content_type or "application/octet-stream",
    )

    # 6. 更新 DB 對應欄位
    update_<主物件>(<主物件>_id, <主物件>Update(**{f"{kind}_url": view_url}))

    return {"view_url": view_url}
```

### 領域層刪除時連帶刪 Drive 檔案

新板塊的 `delete_<主物件>` 套同樣模式(見 `appliances.py` 的 `delete_appliance`):

```python
def delete_<主物件>(<主物件>_id: int) -> bool:
    """刪除。連帶刪 Drive 上的關聯檔案(失敗不擋 DB 流程)。"""
    current = get_<主物件>(<主物件>_id)
    if current is None:
        return False
    # Drive 端刪檔
    for kind_url in (current.photo_url, current.manual_url):
        if kind_url:
            delete_file_by_url(kind_url)
    # DB 刪除
    res = _get_client().table(...).delete().eq("id", <主物件>_id).execute()
    return len(res.data) > 0
```

---

## ⚠️ Next.js 子表時代修正(2026-06-18,以此為準)

上面 Python 段是**舊架構**(單欄 `photo_url`/`manual_url`)。現在檔案改存**獨立子表** `<module>_files`(見 CLAUDE.md「上傳區標準」+ patterns-rich-ui),所以刪除與「加上傳區」的做法不同。

### A. 刪父物件:DB cascade 只刪 row,Drive 實體檔要自己清(含孫表)

**這是最容易漏的坑**:`on delete cascade` 只刪 Supabase 裡的紀錄,**Google Drive 上的實體檔不會自己消失**。刪父物件時必須先把所有關聯檔的 Drive 實體檔一筆筆刪掉,否則雲端留一堆孤兒檔。

而且要連**孫表**一起清:家電底下不只有 `appliance_files`(照片/說明書/收據),還有「聯絡資訊(店家)→ 價目表」這種**子表的子表**(`appliance_contact_files`)。範例見 `web/src/lib/appliances.ts` 的 `deleteAppliance`:

```typescript
export async function deleteAppliance(id: number): Promise<boolean> {
  const current = await getAppliance(id);
  if (current === null) return false;

  // 1) 父物件本身的上傳檔(子表)
  const files = await listFiles(id);
  for (const f of files) if (f.url) await deleteFileByUrl(f.url);

  // 2) 子物件(店家)底下的檔(孫表)—— 別漏!cascade 會刪 row,Drive 檔不會自己消失
  const contacts = await listContacts(id);
  for (const c of contacts) {
    const contactFiles = await listContactFiles(c.id);
    for (const f of contactFiles) if (f.url) await deleteFileByUrl(f.url);
  }

  // 3) 最後刪 DB(cascade 自動連帶刪所有子/孫 row)
  const { data, error } = await getClient()
    .from("appliances").delete().eq("id", id).select();
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
```

**口訣**:**畫一遍「這個主物件底下哪些表會存 Drive URL」的樹**(子表、孫表都算),每一層都要在 delete 裡撈出來 `deleteFileByUrl`。漏一層就漏一批孤兒檔。

### B. 加一個新「上傳區 kind」:`kind` 是 text 欄位,不用改 DB,但要改 6 個觸點

子表的 `kind` 是純 text,新增一種上傳區(例:把「收據/保固卡」拆成 `receipt` + `warranty_card`)**完全不用動資料庫**,但前後端有 6 個觸點要一起改,漏一個就壞。以 2026-06-18 加 `warranty_card` 為例:

1. **領域檔型別**:`lib/<module>Files.ts` 的 `FILE_KINDS` 陣列加新值(`["photo","manual","receipt","warranty_card"]`)
2. **上傳 route 命名表**:`api/<module>-files/route.ts` 的 `KIND_LABEL` 加 `warranty_card: "保固卡"`(這決定 Drive 檔名)+ 更新驗證訊息文字
3. **`uploading` 狀態**:`useState<Record<FileKind, boolean>>` 初值加 `warranty_card: false`(漏了型別會紅)
4. **送出 handler 收集暫存**:`allUploads` 加 `...(pending.warranty_card ?? []).map(...kind: "warranty_card"...)`
5. **送出後清暫存**:`clearPending("photo","manual","receipt","warranty_card")`
6. **UI 上傳區**:多放一個 `<MultiUpload kind 對應的 files/pending/uploading/onAddFiles/onRemovePending>`

**自我檢查**:改完跑 `npx tsc --noEmit`——因為 `uploading` 是 `Record<FileKind, boolean>`,只要漏掉第 3 點型別就會報錯,是個天然的 checklist 守門員。

### 前端上傳 UI(套 `static/appliances.html`)

模板包含:
- 兩個上傳區塊(虛線框 + 「📤 選擇 X 上傳」)
- 已上傳狀態(縮圖 + 檢視 + 換一張)
- 隱藏 file input + 隱藏 URL state
- Ctrl+V 截圖貼上 handler(modal 開著時監聽 paste,active element 決定貼到哪)
- 卡片頭貼用 Drive thumbnail URL(`https://drive.google.com/thumbnail?id=<id>&sz=w160`)

JS 函式組:`renderUploadBlock`, `triggerUpload`, `handleFileSelected`, `extractDriveFileId`, `handleClipboardPaste`。直接複製改 label / kind。

## 新板塊接 Drive 的 5 個步驟

做新板塊有檔案上傳時:

### 1. **主動列 2-3 個 `kind_label` 候選給 Kevin 挑**

(CLAUDE.md 強制規則 8;不要自己拍板)

| 板塊 | kind_label 候選 |
|---|---|
| 車輛紀錄 | 車輛照片 / 行照 / 維修單據 / 驗車單 |
| 借用紀錄 | 物品照片 / 歸還憑證 |
| 寵物管理 | 寵物照片 / 接種證明 / 病歷 |
| 醫療紀錄 | 藥袋 / 檢驗報告 / 醫師處方 |
| 照片回憶 | 照片 / 影片 |

### 2. Pydantic 模型加 `<kind>_url: Optional[str]` 欄位(每個 kind 對應一個欄位)

### 3. Supabase schema 加對應 text 欄位(用 `supabase_admin.run_sql` 跑 ALTER TABLE)

### 4. `main.py` 加 upload endpoint(套上方模板)

### 5. HTML 加上傳 UI(套 `static/appliances.html` 的 upload block + Ctrl+V paste handler)

完成後 Kevin 從前端按上傳 → 後端寫 Drive `家庭管理系統 / <板塊中文名> /` 子資料夾,檔名 `<主物件名>-<kind_label>-<原檔名>`。

## 命名規則(統一)

**Drive 上的檔名格式**:`<板塊主物件名>-<kind_label>-<原檔名>`

例:
- `洗衣機-家電照片-pochacco.jpg`
- `客廳冷氣-說明書-manual.pdf`
- 未來:`Toyota Camry-行照-license.jpg`、`電動工具-物品照片-photo.jpg`、`Pochacco-接種證明-vaccine_2026.pdf`

**為什麼這樣設計**:
- Kevin 從 Drive 直接搜尋主物件名稱就能找到所有相關檔案
- `kind_label` 在中間,類型一目瞭然
- 原檔名保留,Kevin 自己拍的照片名稱不會消失

**Sanitize**:程式碼用 `.replace("/", "-").replace("\\", "-")` 清掉檔名分隔符。其他特殊字元 Drive 接受。

## 踩坑筆記(這個 session 撞過的)

### Service Account 不能寫個人 Drive(2024+)
- **症狀**:HTTP 403 + `storageQuotaExceeded` + `Service Accounts do not have storage quota`
- **根因**:Google 政策改動
- **解法**:轉用 OAuth 2.0(這份 skill 全部內容)
- **棄用 artifacts**:`gcp-drive-service-account.json` 留著不刪(以防未來轉回);`.env` 的 `DRIVE_PARENT_FOLDER_ID` 留著不讀

### 用錯 Google 帳號授權
- **症狀**:OAuth 跑完了,token 也拿到了,上傳成功,但檔案進到別人 Drive(這次撞 yaryna 帳號)
- **Debug**:
```powershell
.\venv\Scripts\python.exe -c "from drive_storage import _get_service; s = _get_service(); print(s.about().get(fields='user').execute())"
```
看 token 是誰的(`emailAddress` 欄位)
- **解法**:刪 `drive-token.json`,重跑 `authorize_drive.py`,瀏覽器**切換到對的帳號**再授權

### Testing 階段 refresh token 7 天過期
- **症狀**:用了 7 天後 Drive 寫入突然 401 / refresh fail
- **短期解法**:重跑 `authorize_drive.py`
- **長期解法**:到 OAuth consent screen 點「**PUBLISH APP**」轉「In production」,refresh token 不過期(個人開發者用 `drive` scope **不需要 verification audit**,只會偶爾彈「未驗證 app」警告)

### Windows uvicorn `--reload` 卡住 + 舊 process 佔 port
- **症狀**:改 `.py` 後 uvicorn reload,但新 process 起來,**舊 process 還在 listening 8000**(Windows 不徹底砍)。前端打到舊 process(用舊 OAuth service 認證)
- **Debug**:看 task log,新 task 沒收到 request → 連的不是新 process
- **解法**:`Get-Process python | Stop-Process -Force` 砍所有 python(或工作管理員手動結束 `python.exe`)
- **預防**:改 `.py` 後 Claude 主動重啟 uvicorn 一次,別只信 `--reload`

### Drive 找不到資料夾(404 File not found)
- **症狀**:`HttpError 404 ... File not found: <資料夾 ID>`
- **可能原因**:`.env` 設的 `DRIVE_PARENT_FOLDER_ID` 真的不存在 / 資料夾建在另一個 Google 帳號 / 資料夾被刪
- **解法**:`drive_storage.py` 新版改成「自動找/建 `家庭管理系統` 根資料夾」by name,不依賴 `.env` 提供 ID,完全免去這個問題

### `.claude/settings.local.json` PowerShell 白名單
- **症狀**:Claude 跑 PowerShell 跳許可 prompt,Kevin reject → **連帶砍 background uvicorn task**,惡性循環
- **解法**:在 `.claude/settings.local.json` 的 `permissions.allow` 加 14 條 PowerShell pattern(只對這專案生效),covers `python -m pip` / `uvicorn` / `-c` / `supabase_admin.py` / `drive_storage.py` / `Invoke-WebRequest` / `Rename-Item` / `Test-Path` / `Move-Item` / `Get-ChildItem`

### Windows 隱藏副檔名雙 `.json` 陷阱
- **症狀**:Kevin 改 JSON 檔名為 `gcp-drive-service-account.json`,實際變 `gcp-drive-service-account.json.json`
- **解法**:Claude 用 `Glob "*.json"` 找 + `Rename-Item` 修正
- **預防**:跟 Kevin 講「改名時**不要打 `.json` 後綴**」(Windows 會自動加)

## 維運操作

### Drive 出問題時跑 debug_drive

專案根目錄留了 `debug_drive.py`,跑出當前 OAuth user、所有「家庭管理系統」資料夾、洗衣機 photo_url 指向的檔案實際在哪。Drive 行為怪怪時直接跑:

```powershell
.\venv\Scripts\python.exe debug_drive.py
```

### `.gitignore`

以下檔案**絕對不能 commit**(已在 `.gitignore`):
- `oauth-client-secret.json`
- `drive-token.json`
- `gcp-drive-service-account.json`(已棄用,留著)
- `logs/`

### Publish OAuth app(長期推薦)

Testing 階段 7 天 refresh token 過期太煩。OAuth consent screen 按 **PUBLISH APP** 轉「In production」狀態。會偶爾彈「未驗證 app」警告但 token 不過期。

## 參考既有檔案

- `drive_storage.py` — Drive 操作層完整實作(`_ROOT_FOLDER_NAME` + 自動建子資料夾 + 上傳 + 刪除 + URL parse)
- `authorize_drive.py` — 一次性授權腳本(`InstalledAppFlow` + `run_local_server`)
- `debug_drive.py` — Drive 狀態 debug 工具
- `main.py` 的 `api_upload_appliance_file` — 板塊 upload endpoint 標準模板
- `appliances.py` 的 `delete_appliance` — 領域層刪除時連帶刪 Drive 檔的標準模板
- `static/appliances.html` 內的「上傳格子 + Ctrl+V paste + 縮圖顯示」 — 前端 UI 標準模板
- `.claude/settings.local.json` — 14 條 PowerShell 白名單(避免 reject 連帶砍 uvicorn)
