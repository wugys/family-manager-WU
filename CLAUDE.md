# 家庭管理系統

## 專案目標
建立家庭共用的管理系統,管理固定帳單、信用卡、家庭活動、待辦事項、採購支出,透過 LINE 群組通知互動。

## 開發者背景
- 開發者:Kevin,完全沒有後端經驗
- 主要溝通語言:繁體中文
- 已熟悉:單一 HTML 檔前端
- 不熟悉:後端框架、資料庫、雲端部署(Next.js / React / TypeScript 也是新的)

## 技術選型(2026-05-29 全面改用 Next.js)
- 框架:**Next.js 16**(App Router + Turbopack),一個專案同時包前端頁面與後端 API
- 語言:**TypeScript**(React 19)
- 樣式:**Tailwind CSS v4**(`@import "tailwindcss"`,沒有 config 檔)
- 資料庫:**Supabase**(雲端 PostgreSQL),用 `@supabase/supabase-js` SDK,**server-side 直連**(secret key,繞過 RLS)
- 檔案儲存:**Google 雲端硬碟**,用官方 `googleapis` 套件 + OAuth2(`drive-token.json`)
- LINE 整合:line-bot-sdk(未接)
- 排程:未定(未來)
- 部署:未定(Vercel 或 Google Cloud Run,未來)

> **⚠️ 這不是你熟悉的 Next.js**——16 版有破壞性變更,API、慣例、檔案結構都可能跟訓練資料不同。寫任何 Next.js 程式前先讀 `web/node_modules/next/dist/docs/` 內相關指南(見 `web/AGENTS.md`)。重點已踩過的:
> - Route handler 的 `params` 是 **async**:`{ params: Promise<{ id: string }> }`,要 `await ctx.params`
> - Route handler 回傳用 `NextResponse.json(data, { status })`
> - Client component 第一行要 `"use client"`;只能 `import type` 領域型別,**不可** import 到 server-only 的 Supabase / Drive 模組

## 開發守則
1. 每次只做一件事,做完一個板塊(或一個清楚的小步)就停下來讓 Kevin 在瀏覽器驗證
2. 第一次出現的指令、概念、套件都要解釋意義
3. 用繁體中文回覆,程式碼註解也用繁體中文
4. 避免進階優化,除非 Kevin 主動問
5. 變數 / 函式用 camelCase,型別 / 介面 / 元件用 PascalCase(TypeScript 慣例)
6. 重要函式寫繁中註解說明用途

## 強制規則(製作各板塊通用)

Kevin 明確指定、所有板塊都要遵守的規則。語言與註解風格見「開發守則」、金鑰與套件相關見「禁止事項」,**本段聚焦結構、節奏與儲存**。

### 開發節奏
1. **UI/UX 為主,後端少廢話**——對使用者來說只有看得到的部分才存在;API/領域層講重點即可、頁面(`page.tsx`)認真做
2. **新板塊一開始就接 Supabase**——分層架構已驗證(bills/shopping/contacts/appliances 全接通 OK),**禁止再用記憶體假資料庫過渡**
3. **板塊一個一個做完再做下一個**,不要平行展開多個未完成板塊
4. **不啦啦隊**——做的簡化選擇、跳過的細節要主動標出讓 Kevin 反對
5. **介面變動立即可驗**——改完 `page.tsx` / 樣式後,Turbopack 會 **hot-reload**,直接叫 Kevin 重新整理頁面看外觀,不要再接型別檢查才回應。理由:Kevin 看不到的東西不算進度,等不及打斷反而拖時間
6. **dev server 保持在跑,被動處理問題**——`cd web && npm run dev`(port 3000)一旦在背景跑就**保持在跑**,讓 Kevin 隨時看效果。Claude **不主動一直 verify** server。Kevin 看到頁面壞了(ERR_CONNECTION_REFUSED)喊一聲,Claude 立刻背景重啟。**只有這些情況才主動重啟一次**:裝新 npm 套件、改 `.env.local`、server 真的掛了;改 `.tsx` / `route.ts` 靠 hot-reload 不用重啟。重啟前先 `netstat -ano | findstr :3000` 找 PID,`taskkill /PID <pid> /F` 砍舊的再起新的
7. **Kevin 只看最後結果**——Kevin 驗收的是「**網頁是否如預期顯示** + **文字資料是否進 Supabase**」兩件事,不看中間過程。**不需要**先給 Kevin 看 SQL / 程式碼解釋讓他點頭才動手——他點不出細節問題,只會延長等待。一般 DDL(`ALTER TABLE ADD/DROP COLUMN`、`CREATE TABLE`、`CREATE INDEX`)直接跑。例外:`supabase_admin.py` 黑名單擋住的破壞性操作(`DROP TABLE` / `TRUNCATE` 任何現有業務表)要 Kevin 真的同意才能拆白名單
8. **新板塊有上傳功能時,主動 surface Drive 歸檔命名規則**——做新板塊(車輛紀錄、借用紀錄、寵物管理、醫療紀錄、照片回憶等)時,只要該板塊會上傳檔案到 Drive,寫 upload route 前**主動列 2-3 個 `kindLabel` 候選**讓 Kevin 挑(例:車輛 → 「車輛照片 / 行照 / 維修單據」、借用 → 「物品照片 / 歸還憑證」)。命名規則統一 `<板塊主物件名>-<kindLabel>-<原檔名>`(套家電板塊的樣式,見 `web/src/app/api/appliances/[id]/upload/route.ts`)。理由:Drive 歸檔規則每個板塊不同、設定一次永遠用,Claude 自己拍板會偏離 Kevin 想要的命名習慣

### 上傳區標準(強制,所有板塊一致)
任何 Google Drive 上傳區(不論哪個板塊、哪個位置)都**必須**符合下面三點,格式統一:
1. **支援 Ctrl+V 貼上圖片上傳**——滑鼠移到 / 點到該上傳區後,直接貼上剪貼簿的圖片即可上傳,不用一定要按「選檔」
2. **支援多檔**——一個上傳區可放多張(收據可能多頁、照片可能多張),用**縮圖列表(grid)**呈現,每張縮圖可檢視 / 刪除,旁邊永遠有「+ 再加一張」的虛線格
3. **每個上傳區外觀一致**——都套同一個 `MultiUpload` 元件(見 `web/src/app/appliances/page.tsx`),不要每個板塊各做一套
資料模型:多檔存獨立子表 `<module>_files`(欄位 `<parent>_id` FK on delete cascade、`kind`、`url`、`name`、`created_at`),不要再用家電早期那種 `photo_url`/`manual_url` 單欄存單檔的做法。

### 自我檢查(寫完程式碼自己跑,不丟給 Kevin)
- 寫完一個板塊用 `cd web && npx tsc --noEmit` 確認 TypeScript 沒型別錯誤(等同舊時代的 `python -c "import main"` sanity check)
- 型別 / 語法錯誤自己修掉,不要丟給 Kevin 看

### 資料儲存(強制)
1. **所有結構化文字資料**(清單、紀錄、設定、人員、金額、日期、狀態…)**一律存 Supabase**——禁止用記憶體假資料庫(`dict` / array 模擬),新板塊直接套現有領域檔(`src/lib/<module>.ts`)模板
2. **大檔案**(照片、影片、PDF、語音等)**存 Google 雲端硬碟**(OAuth2 寫入),**不存 Supabase Storage**——免費版 500 MB 配額留給結構化資料,大檔案放 Drive 更划算
3. **Drive 檔案按板塊分子資料夾**——所有透過後端上傳的大檔案,都進 `家庭管理系統/` 父資料夾,並**按板塊名自動建子資料夾**(例:「家電管理/」、「帳單管理/」、「照片回憶/」)。呼叫 `uploadFile(buffer, filename, moduleName, mimeType)` 時,`src/lib/drive.ts` 內部會檢查同名子資料夾是否存在,沒有就建、有就重用(用 cache 避免每次都查 Drive)。**重新授權 / 重啟不會重複開新資料夾**(`findOrCreateSubfolder` 先用名字搜尋再決定建不建)。Kevin 從自己 Drive 打開父資料夾就能按板塊瀏覽所有上傳檔案
4. 例外(例如真的需要 SQLite / 本機 cache / 第三方 API 即時資料)要 Kevin 同意才能用

### 安全規範(Supabase / 金鑰)
1. **Supabase secret key 只在 server 端用**——`SUPABASE_URL` / `SUPABASE_SECRET_KEY` 放 `web/.env.local`,**環境變數名稱不可加 `NEXT_PUBLIC_` 前綴**(加了會被打包進前端、洩漏 secret key)
2. **領域檔 / route handler 是 server-only**——`src/lib/*.ts`(連 Supabase / Drive)、`src/app/api/**/route.ts` 都跑在 server,client 元件(`page.tsx`)只能 `import type` 它們的型別,不可 import 函式
3. secret key 格式是 `sb_secret_...`(新版),不是舊版 JWT service_role key;`SUPABASE_URL` 只放 project root,別貼到 `/rest/v1/` 結尾

### 資料夾結構(板塊放哪都照這個,別發明新位置)
```
family-manager/
├── web/                          # Next.js 專案(所有網頁開發都在這)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── supabase.ts        # Supabase client(server-only,secret key)
│   │   │   ├── drive.ts           # Google Drive 上傳(OAuth2 + googleapis)
│   │   │   ├── modules.ts         # 主頁板塊清單(active / planned + href)
│   │   │   └── <module>.ts        # 領域層:型別 + Supabase CRUD(例 bills.ts、contacts.ts)
│   │   └── app/
│   │       ├── page.tsx           # 主頁(板塊入口卡片)
│   │       ├── <module>/page.tsx  # 每個板塊一個頁面(client component)
│   │       └── api/
│   │           ├── <resource>/route.ts        # GET 列表 / POST 新增
│   │           └── <resource>/[id]/route.ts   # GET / PATCH / DELETE 單筆
│   ├── .env.local                 # 金鑰(SUPABASE_*,不 commit)
│   ├── AGENTS.md                  # Next.js 16 警告(寫程式前讀 docs)
│   └── package.json
├── drive-token.json              # Drive OAuth token(refresh_token,不 commit)
├── authorize_drive.py            # 一次性:重新取得 Drive OAuth token(7 天過期時跑)
├── supabase_admin.py             # DDL 工具(psycopg2,有破壞性操作黑名單)
├── supabase_schema.sql           # 建表 SQL 紀錄
└── .claude/skills/
    ├── system-prep/              # foundation skill(部分內容已過時,以本檔為準)
    └── module-<name>/            # 各板塊專屬 skill
```

### 命名規範
- **領域檔**:`src/lib/<module>.ts`(英文複數或單數對應資源,例 `bills.ts`、`contacts.ts`、`appliances.ts`)
- **頁面檔**:`src/app/<module>/page.tsx`
- **API 路徑**:`/api/<resource>`,全用複數(例 `/api/bills`、`/api/contacts`)
- **Route handler**:export `GET` / `POST` / `PATCH` / `DELETE` 函式;`[id]` 動態段放單筆操作
- **TypeScript 三類型別**:`<Name>Create` / `<Name>Update` / `<Name>`(例 `BillCreate` / `BillUpdate` / `Bill`);`Update` 常用 `Partial<...>`
- **Skill 資料夾**:`.claude/skills/module-<name>/`

### 流程慣例(每做新板塊都跑一遍)
1. 寫 Next.js 程式前先確認讀過 `web/AGENTS.md`(16 版破壞性變更);需要時翻 `web/node_modules/next/dist/docs/`
2. 依分層做:Supabase schema(DDL)→ 領域檔 `lib/<module>.ts` → API route → 頁面 `page.tsx` → 主頁 `modules.ts` 啟用
   - **一氣呵成做到主頁能點進去**,中間不要停下來給 Kevin 看自我測試(Kevin 看不到的東西不算進度)
   - 寫完用 `npx tsc --noEmit` 自己 sanity check
   - Kevin 從**前端 UI** 直接測新板塊功能(這是唯一的驗收方式)
3. **完成後順手建 `.claude/skills/module-<name>/SKILL.md`**,只放該板塊獨有的:schema 設計選擇 + 理由、特殊端點(非 CRUD 領域操作,例如採購清單的 `clear-bought`)、特殊 UI 模式、跟其他板塊的串接點
4. **主動提議更新本檔「目前進度」**(Kevin 同意才動手,用 Edit 工具只改那一段)

## LINE 指令格式
所有指令以 / 開頭:
- /帳單 新增 <名稱> <金額> <週期> <日期>
- /帳單 已繳 <名稱>
- /帳單 列表
- /待辦 <內容> @<成員> <期限>
- /支出 <分類> <金額> <備註>
- /支出 本月
- /活動 新增 <標題> <時間> <地點>
- /help

## 階段目標
- 階段 1-3 MVP:Supabase 接通 + Web 管理介面(一次做完一個板塊再加下一個)— **進行中**
- 階段 4:LINE Bot 接收訊息、解析指令、寫進同一份 Supabase
- 階段 5:排程提醒 + 部署 + 視需求擴充 Google Drive

## 7 人家庭未來可考慮加入的功能(待 Kevin 挑選)
- 採購清單(任何人加項目,去超市的人勾掉)✅ 已做
- 活動行程(誰今天接誰下課、今晚誰煮飯、誰加班/補習,集中安排)
- 生日/紀念日提醒(自動提前 N 天通知群組)
- 公佈欄(全家公告:停水、聚餐、就醫等)
- 共用物品借用紀錄(車鑰匙、線材、書本)

## 禁止事項
- 不要把金鑰寫在程式碼裡,必須用 `web/.env.local`
- 不要 commit `.env*`、`drive-token.json`、`oauth-client-secret.json`、Service Account JSON 進 git
- 不要寫假資料進正式資料庫
- **不要再用記憶體假資料庫**——所有結構化資料一律存 Supabase、大檔案存 Google 雲端硬碟(見「強制規則 > 資料儲存」)
- **不要把 Supabase secret key 暴露到 client component**(不加 `NEXT_PUBLIC_`、client 只 `import type`)
- 不要主動引入新套件而不說明用途
- 不要要求 Kevin 把金鑰、token、secret 貼進聊天(只在他本機的 `.env.local`)

## 工作技術對照

維護/擴充這個系統會用到的技術 + 重要程度(⭐⭐⭐ 核心 / ⭐⭐ 常碰 / ⭐ 偶爾或未來)。

### Next.js / React / TypeScript
- Next.js 16 App Router:`page.tsx`、`route.ts`、`[id]` 動態段、async `params`、`NextResponse` ⭐⭐⭐
- Server vs Client component:`"use client"`、server-only 模組邊界、`import type` ⭐⭐⭐
- TypeScript:interface、`Partial<>`、`Omit<>`、型別匯入 ⭐⭐⭐
- React 19:`useState` / `useEffect` / `useCallback` / `useRef`、受控表單、條件 render ⭐⭐⭐
- Tailwind CSS v4:utility classes、mobile-first 響應式、條件 class ⭐⭐⭐
- HTTP 語意:GET/POST/PATCH/DELETE、200/201/204/400/404/422 ⭐⭐
- UX patterns:底部滑出 modal、sticky 頂底列、filter chips、`confirm` / `alert`、`active:scale` 動效 ⭐⭐
- XSS:React 預設轉義,危險的只有 `dangerouslySetInnerHTML`(別用) ⭐⭐

### 資料 / DB
- Schema 設計:欄位型別(text / numeric / date / timestamptz / boolean / bigint)、必填、自動欄位 ⭐⭐⭐
- Supabase JS SDK:`.from().select()/.insert()/.update()/.delete()`、`.eq()`、`.single()` ⭐⭐⭐
- 分層:`lib/<module>.ts` 只管資料,`route.ts` 只管 HTTP ⭐⭐⭐

### 外部整合
- Google Drive(`googleapis` + OAuth2):上傳、權限、子資料夾歸檔 ⭐⭐(已接通,家電在用)
- LINE Messaging API、Channel Secret、簽章 ⭐(未接)
- 部署(Vercel / Cloud Run) ⭐(未來)

### 環境 / 工具
- dev server:`cd web && npm run dev`(port 3000,Turbopack hot-reload);保持在跑(見開發節奏 6)
- 型別檢查:`cd web && npx tsc --noEmit`
- 砍 server:`netstat -ano | findstr :3000` 找 PID → `taskkill /PID <pid> /F`
- `web/.env.local`:金鑰永遠在這,不 commit
- 新加 npm 套件要說明用途 + 之後主動重啟一次 dev server

### 工作流程習慣(最關鍵)
1. 每次做完一個板塊(或清楚的小步)停下來讓 Kevin 在瀏覽器驗證
2. 第一次出現的指令、套件、概念要解釋意義
3. 繁體中文回覆,程式碼註解都繁中
4. 變數 / 函式 camelCase、型別 / 元件 PascalCase
5. 不主動引入新套件,要先說明用途
6. 金鑰只進 `.env.local`,不貼聊天、不 commit
7. 「UI/UX 為主,後端少廢話」——對使用者來說只有看得到的部分才存在
8. server-only 與 client 邊界別搞混(secret key 不外洩)

## 目前進度(2026-05-29)

**大轉向:全面改用 Next.js**
- 2026-05-29 把整個專案從 Python/FastAPI + 單一 HTML 重寫成 **Next.js 16 + Supabase 直連**,全部 4 個板塊忠實移植完成,以後所有網頁與後續工作都走 Next.js
- 舊的 Python 後端(`main.py` 等 7 個 `.py`)+ `static/*.html`(5 個)已刪除
- **保留的 Python 工具**:`authorize_drive.py`(重新取 Drive token)、`supabase_admin.py`(DDL 工具,有破壞性操作黑名單)

**已完成的功能板塊(全部 Next.js + Supabase)**
- ✅ **帳單管理**:`lib/bills.ts` + `/api/bills` + `bills/page.tsx`
- ✅ **採購清單**:`lib/shopping.ts`(`is_bought` 變化自動填 `bought_at`)+ `/api/shopping` + `clear-bought` + `shopping/page.tsx`
- ✅ **家人通訊錄**:`lib/contacts.ts` + `/api/contacts` + `contacts/page.tsx`(頭像漸層、生日提醒、tel/line/mailto 動作鍵)
- ✅ **家電管理**:`lib/appliances.ts`(雙表 `appliances` + `appliance_tasks`,FK cascade,`markTaskDone` 自動推進下次日期)+ `lib/drive.ts`(**Google Drive 上傳已做到底**:OAuth2、子資料夾歸檔、照片/說明書上傳)+ `/api/appliances` + `/api/appliance-tasks` + `appliances/page.tsx`(modal 內任務子清單、Drive 縮圖、Ctrl+V 貼上上傳、保固徽章)
- ✅ **主頁**:`page.tsx` + `lib/modules.ts`,17 個板塊卡片(4 已啟用、13 規劃中)

**17 個板塊規劃(已啟用 4、規劃中 13)**
- 💰 金錢:帳單管理 ✅、家庭支出、信用卡
- 🧹 家事:採購清單 ✅、待辦事項、日用品存量、家事分配(7 人輪值)
- 📅 行事曆:家庭活動、接送排程、生日紀念日
- 📂 資訊:公佈欄、家人通訊錄 ✅、車輛紀錄、**家電管理 ✅**、借用紀錄、醫療紀錄、照片回憶

**外部整合狀態**
- ✅ Supabase 已接通:`SUPABASE_URL` + `SUPABASE_SECRET_KEY` 在 `web/.env.local`,4 張表已建好
- ✅ Google Drive 已接通:`drive-token.json`(OAuth2 + refresh_token),家電板塊可從系統內上傳照片/說明書,自動歸檔到 `家庭管理系統/家電管理/`
  - ⚠️ OAuth consent 在 **Testing** 模式 → `refresh_token` **7 天過期**。過期後跑 `authorize_drive.py` 重新授權即可(不會開新資料夾);永久解法是把 app 發布到 Production

**下一步候選**
1. 多做一個規劃中的板塊(單表套 bills/contacts 模板;雙表 + 上傳套 appliances 模板)
2. 深化現有板塊(帳單標已繳推進到期日、家電保固快到期提醒、採購複製上次清單等)
3. 把 Drive OAuth app 發布到 Production(永久解 7 天過期)
4. 開放給家人(本機 WiFi 或部署)
5. 處理 LINE webhook(需先有 ngrok)

**已知狀態 / 小坑**
- Next.js 16 有破壞性變更:route `params` 是 async、寫前讀 `web/AGENTS.md`
- PowerShell 每個指令是獨立 process;dev server 用 `run_in_background` 啟動、保持在跑
- PowerShell 輸出中文常顯示亂碼(編碼問題),實際資料正常,瀏覽器顯示正確即可
- Drive token 7 天過期(Testing 模式),見上方外部整合狀態
