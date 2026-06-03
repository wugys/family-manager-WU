---
name: patterns-refactor
description: family-manager 的「重構既有功能 / 改共用元件」方法論,從 2026-06-03 把上傳區從「選了就傳」改成「暫存待送出」那輪萃取。當你要做以下任一件事時讀這份:(1) 改一個被多處使用的共用元件(MultiUpload、DateField…)的「行為」而不只是樣式;(2) 接手一份「上一個 session 改到一半、沒收尾」的程式碼,要先判斷哪裡壞了再補;(3) 某個前端「暫存 / 草稿狀態」在切頁籤 / 切主物件時會消失,要決定狀態放哪;(4) 想知道這專案改既有功能的驗證 + commit 節奏(tsc、增量 commit、diff-stat、commit 訊息 heredoc 坑)。先讀 system-prep,涉及上傳 / OCR / 子表再配 patterns-rich-ui。
---

# 重構既有功能 / 改共用元件 方法論

這份不是教「怎麼寫新板塊」(那是 module-* + patterns-rich-ui),而是教「**怎麼安全地改既有的東西**」。全部從 2026-06-03 那輪(上傳區 4 個位置從「選了就立刻上傳」統一改成「暫存、按儲存才一次上傳」)的實戰萃取。

實作參考(已 commit):`web/src/app/appliances/page.tsx` 的 `MultiUpload` 元件 + `pending` 父層狀態 + `submitApplianceForm` / `submitContactForm`。

---

## 1. 改「共用元件的行為」前,先審所有使用點(最重要)

改一個只用在一處的元件,你看那一處就好;但改**共用元件的行為**(不是顏色 / 文字,而是「它何時做什麼」),會同時影響每一個用到它的地方。**動手前先 grep 出所有使用點,逐一問「這個改動會不會弄壞它」。**

這輪的教訓:`MultiUpload` 被用在 4 個地方(家電照片 / 說明書 / 收據 / 聯絡資訊價目表)。把它從「選了就上傳」改成「暫存」時,前三個是預期內,但**第 4 個(價目表)被連帶改壞了**——它原本靠「選了就立刻上傳」運作,元件一改成暫存、又沒人幫它在表單送出時上傳,就變成「選了圖卻完全不會傳」。**只看著要改的那處、沒審其他使用點 → 一定漏。**

做法:
```
Grep pattern: "<ElementName"   (找出所有 <MultiUpload ... 使用點)
```
每個使用點列出來,標記「這次改動對它的影響:OK / 要一起改 / 會壞」。會壞的當場決定怎麼補(統一改、或加參數讓它維持舊行為)。

---

## 2. 接手「改一半」的程式碼:先判斷,別假設它是好的

`git status` 顯示某檔 modified、但你沒看到完成訊息時,**很可能上一個 session 改到一半就停了**。別假設現狀可跑。整份讀過,找「**不一致的半成品**」:

這輪實際發現的三種半成品徵兆(通用):
- **只接了一部分**:`submitForm` 已經寫了「按儲存才上傳暫存檔」的邏輯,但 4 個上傳區只有 1 個接上 `ref`,另外 2 個沒接 → 那 2 區的暫存檔永遠抓不到、傳不上去。
- **死掉的 prop / 函式**:元件已經不呼叫 `onUpload` 了,但所有使用點還傳著 `onUpload={...}`,對應的 `uploadFiles` 函式變成沒人會執行的死碼。
- **被連帶改壞的鄰居**:見第 1 點的價目表。

判斷流程:讀完整個檔 → 在腦中跑一遍「使用者實際操作」的資料流(選檔 → 暫存在哪 → 送出時從哪讀 → 上傳)→ 任何一環接不起來就是 bug。修完用第 4 節的驗證確認。

---

## 3. 暫存 / 草稿狀態會在切頁籤時消失 → 狀態提升到父層

**症狀**:使用者在 A 分頁填了一半 / 暫存了檔案,切到 B 分頁再切回來,東西不見了。

**根因**:那個狀態存在「**會被卸載(unmount)的元件內部**」。React 用條件 render(`{tab === 'basic' && <X/>}`)切換時,隱藏的那邊整個卸載,內部 `useState` 跟著清空。`forwardRef` + `useImperativeHandle` 把狀態鎖在元件內也救不了——元件一卸載,ref 指向的實例就沒了。

**解法:把該狀態提升到「不會卸載的父層」集中管**,子元件改成純受控顯示(只收 props、不自己存)。這輪的具體做法:
```ts
// 父層(modal 元件,切分頁時它不卸載):
type PendingFile = { file: File; preview: string };
const [pending, setPending] = useState<Record<string, PendingFile[]>>({});
// key 區分各上傳區:photo / manual / receipt / contactPrice
function addPending(key, fileList) { /* 圖片 FileReader 生 dataURL 預覽後塞進 pending[key] */ }
function removePending(key, idx) { /* 從 pending[key] 移除第 idx 張 */ }
function clearPending(...keys) { /* 送出成功後清掉 */ }

// 子元件 MultiUpload 變純受控:收 files(已上傳)/ pending(暫存)/ onAddFiles / onRemovePending / onDelete,
//   自己「不」存 useState,不用 forwardRef。切分頁卸載也不怕,因為狀態在父層。
```
判斷準則:**狀態的生命週期該跟「誰」一樣長,就放在「誰」身上。** 暫存檔要活過分頁切換 → 放管理分頁的父層,不是放分頁內的元件。

延伸:同樣道理,送出後要「用後端剛回傳的物件」更新畫面,別用 `appliances.find(...)` 去現有 state 撈——`await loadData()` 之後,當前 closure 裡的 state 變數仍是舊的(stale closure),會找不到剛建立的那筆。直接用 `await res.json()` 拿回傳物件。

---

## 4. 改既有功能的驗證 + commit 節奏

1. **每改一步自己跑** `cd web && npx tsc --noEmit`,型別錯自己修(刪函式 / 改 props 後特別容易留下未引用符號或型別不符)。
2. **改完 grep 確認舊符號清乾淨**:重構常會刪掉舊機制(`forwardRef`、某個 ref、某個 prop)。用 `Grep` 搜那些舊名字,確定沒有殘留引用(`onUpload`、`xxxRef`、`getFiles`…)。
3. **一個獨立改動一個 commit**:行為重構、skill 更新、bug 修正分開 commit,訊息講清楚「為什麼」。
4. **commit 後在聊天框附 diff stat**(見記憶 feedback_show_diffstat_in_chat:每則回覆都附「分支 vs origin/main」數字)。
5. **push 是 Kevin 自己做**(見 workflow_git_push):Claude 只 add / commit,Kevin 在終端機 `git push`。

### commit 訊息的坑:Bash 工具用 heredoc,別用 PowerShell here-string
這台是 Windows,但 **Bash 工具**跑的是 bash、不是 PowerShell。多行 commit 訊息:
- ❌ `git commit -m @'...'@`(PowerShell here-string)→ 在 bash 下 `@` 會被當字面字元塞進訊息,污染標題。
- ✅ 用 bash heredoc:
```bash
git -C "C:\...\family-manager" commit -F - <<'EOF'
標題行

- 條列說明
Co-Authored-By: ...
EOF
```
(`<<'EOF'` 單引號版不會展開 `$`;結尾 `EOF` 要頂格。)

---

## 5. 不啦啦隊:改既有功能尤其要主動標出取捨

改既有功能常有「為了 A 犧牲 B」的取捨,**主動講出來讓 Kevin 反對**,別自己默默拍板。這輪兩個實例:
- 把「新增後自動切編輯模式」改成「存完關 modal 回列表」→ 代價是要加任務得回列表再點一次卡片。主動講 → Kevin 確認可接受 → 才定案 + 更新 module-appliances skill。
- 一開始只把價目表改成「立即上傳」例外(加 `immediate` 開關),主動標出「這跟你要的一致性不符」→ Kevin 要求全部統一 → 才回頭拿掉例外、全改暫存。

準則:做了簡化 / 留了例外 / 改了既有 UX,**在回覆裡用一段標出來**,等 Kevin 點頭或反對,而不是當成定局。

---

## 6. 改完記得回頭更新「會過時的文件」

改既有功能 = 某些文件 / skill 的描述會變過時。改完順手檢查並更新:
- **CLAUDE.md**:強制規則(這輪改了「上傳區標準」加第 4 點暫存)、目前進度段。
- **相關 skill**:這輪連動更新了 `patterns-rich-ui`(樣式2 多檔上傳)、`module-appliances`(第7節存完行為)。
- 改的若是「全板塊通用標準」,務必更新 CLAUDE.md 那條強制規則,否則下個板塊會照舊的做。
