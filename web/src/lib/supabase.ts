// Supabase 伺服器端 client(對應 Python 的 _get_client 惰性單例)
//
// ⚠️ 安全重點:這支檔案用的是「秘密金鑰」(SUPABASE_KEY,sb_secret_...),
// 權限最大、能繞過所有 RLS 保護。只能在「伺服器端」程式碼 import
//(route handler、server component、server action),
// 絕對不能被 'use client' 的元件 import,否則金鑰會被打包進瀏覽器。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 模組層級單例:同一個 process 內只建一次,後續重用
let _client: SupabaseClient | null = null;

/**
 * 惰性取得 Supabase client。第一次呼叫才建,之後重用同一個。
 * .env.local 沒設 SUPABASE_URL / SUPABASE_KEY 時丟錯,訊息明確好除錯。
 */
export function getClient(): SupabaseClient {
  if (_client === null) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
      throw new Error(
        ".env.local 沒設 SUPABASE_URL 或 SUPABASE_KEY,無法連到 Supabase",
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false }, // 伺服器端不需要記住登入狀態
    });
  }
  return _client;
}
