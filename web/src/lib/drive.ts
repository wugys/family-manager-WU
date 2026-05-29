// Google Drive 儲存層:讓後端能上傳 / 刪除檔案到指定 Drive 資料夾。
// 這是 Python 版 drive_storage.py 的 JS 移植(用 googleapis 套件)。
//
// 為什麼大檔案放 Google Drive 不放 Supabase?
//   Supabase 免費版 500 MB 配額留給結構化資料更划算;Google Drive 是 Kevin 既有空間。
//   詳見 CLAUDE.md「強制規則 > 資料儲存」。
//
// 認證方式(OAuth 2.0):
//   Kevin 跑過 Python 的 authorize_drive.py,token 寫進專案根目錄 drive-token.json。
//   這裡讀同一個檔(client_id / client_secret / refresh_token),access token 過期會自動 refresh,
//   refresh 後把新 token 寫回 drive-token.json(維持跟 Python 版共用一份)。
//
// 對外簽名:
//   uploadFile(buffer, filename, moduleName, mimeType) -> view_url
//   deleteFileByUrl(url) -> boolean
//   extractFileId(url) -> string | null
import { google, type drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

// drive-token.json 在專案根目錄(web/ 的上一層);dev / build 都從 web/ 跑,所以往上一層
const TOKEN_FILE = join(process.cwd(), "..", "drive-token.json");

// 所有大檔案的根資料夾名稱(自動建在 Drive root 下,板塊子資料夾都在它下)
const ROOT_FOLDER_NAME = "家庭管理系統";

// 模組層級單例(同 process 重用)
let _drive: drive_v3.Drive | null = null;

// 子資料夾 id cache:避免每次上傳都查 Drive。key = 板塊中文名,value = folder id
const _moduleFolderCache: Map<string, string> = new Map();

// drive-token.json 的形狀(沿用 Python google-auth 的欄位名,兩邊共用一份)
interface DriveToken {
  token: string;
  refresh_token: string;
  token_uri: string;
  client_id: string;
  client_secret: string;
  scopes: string[];
  universe_domain?: string;
  account?: string;
  expiry?: string; // ISO 字串(Python 格式)
}

// 惰性建立 Drive client。第一次呼叫才建,之後重用。
function getDrive(): drive_v3.Drive {
  if (_drive !== null) return _drive;

  let token: DriveToken;
  try {
    token = JSON.parse(readFileSync(TOKEN_FILE, "utf-8")) as DriveToken;
  } catch {
    throw new Error(
      `找不到或讀不到 OAuth token:${TOKEN_FILE}\n` +
        "請先在專案根目錄跑授權腳本:.\\venv\\Scripts\\python.exe authorize_drive.py",
    );
  }

  const oauth2 = new OAuth2Client(token.client_id, token.client_secret);
  oauth2.setCredentials({
    access_token: token.token,
    refresh_token: token.refresh_token,
    expiry_date: token.expiry ? new Date(token.expiry).getTime() : undefined,
  });

  // access token 自動 refresh 後,把新 token 寫回 drive-token.json(維持跟 Python 共用)
  oauth2.on("tokens", (creds) => {
    const updated: DriveToken = {
      ...token,
      token: creds.access_token ?? token.token,
      // refresh 通常不會回新的 refresh_token,沒回就保留舊的
      refresh_token: creds.refresh_token ?? token.refresh_token,
      expiry: creds.expiry_date
        ? new Date(creds.expiry_date).toISOString()
        : token.expiry,
    };
    try {
      writeFileSync(TOKEN_FILE, JSON.stringify(updated), "utf-8");
    } catch {
      // 寫回失敗不擋上傳;下次還是能用 refresh_token 再換
    }
  });

  _drive = google.drive({ version: "v3", auth: oauth2 });
  return _drive;
}

// 在指定 parent 下找 / 建 name 子資料夾,回 folder id
async function findOrCreateSubfolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string> {
  // 名稱含單引號要 escape,避免 query 壞掉
  const safeName = name.replace(/'/g, "\\'");
  const q =
    `name = '${safeName}' and '${parentId}' in parents ` +
    `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: "files(id, name)" });
  const files = res.data.files ?? [];
  if (files.length > 0 && files[0].id) return files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("建立子資料夾失敗");
  return created.data.id;
}

// 取得 moduleName 子資料夾的 Drive id;不存在就建。結構:Drive root / 家庭管理系統 / <moduleName>
async function getOrCreateModuleFolder(moduleName: string): Promise<string> {
  const cached = _moduleFolderCache.get(moduleName);
  if (cached) return cached;

  const drive = getDrive();
  const rootId = await findOrCreateSubfolder(drive, ROOT_FOLDER_NAME, "root");
  const folderId = await findOrCreateSubfolder(drive, moduleName, rootId);
  _moduleFolderCache.set(moduleName, folderId);
  return folderId;
}

// 上傳檔案到指定板塊的子資料夾,設為「擁有連結者可檢視」,回 view URL
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  moduleName: string,
  mimeType = "application/octet-stream",
): Promise<string> {
  const drive = getDrive();
  const folderId = await getOrCreateModuleFolder(moduleName);

  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error("上傳檔案失敗");

  // 設為「擁有連結者可檢視」——家人點連結不用登入就能看
  await drive.permissions.create({
    fileId,
    requestBody: { type: "anyone", role: "reader" },
  });

  return `https://drive.google.com/file/d/${fileId}/view`;
}

// 從 view URL 解析 file_id 並刪除 Drive 上的檔案;失敗回 false、不報錯(不擋呼叫者流程)
export async function deleteFileByUrl(
  url: string | null | undefined,
): Promise<boolean> {
  if (!url) return false;
  const fileId = extractFileId(url);
  if (!fileId) return false;
  try {
    await getDrive().files.delete({ fileId });
    return true;
  } catch {
    return false;
  }
}

// 從 Drive URL 反解 file_id;解析失敗回 null
export function extractFileId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  const m2 = url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}
