// 純日期工具:不連任何 server-only 模組,client / server 都能 import。
// 全板塊共用,日期輸入與顯示一律走這裡(見 CLAUDE.md「日期欄位標準」)。

// 把使用者打的日期正規化成 YYYY-MM-DD(支援 2026/4/8、2026.4.8、20260408 等)
export function normalizeDate(s: string): string {
  if (!s) return "";
  s = s.trim();
  // 去掉結尾可能附帶的星期標記,如「2026-05-29(五)」→「2026-05-29」
  s = s.replace(/[(（].*$/, "").trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  const m = s.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return s;
}

// 已經是合法的 YYYY-MM-DD?
export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 取得某日期是星期幾(用本地時間 00:00,避免時區位移到前一天)
export function weekdayLabel(isoDate: string): string {
  return WEEKDAYS[new Date(isoDate + "T00:00:00").getDay()];
}

// 把日期顯示成 2026-05-29(五);空值回空字串、非法輸入原樣回傳
export function formatDateWithWeekday(
  isoDate: string | null | undefined,
): string {
  if (!isoDate) return "";
  const iso = normalizeDate(isoDate);
  if (!isIsoDate(iso)) return isoDate;
  return `${iso}(${weekdayLabel(iso)})`;
}
