"use client";

// 可打字的日期欄位(全板塊共用,見 CLAUDE.md「日期欄位標準」)
// 直接輸入(支援 2026/4/8、20260408),或點 📅 從日曆挑;
// 一形成合法日期就即時把欄位內容補成 2026-05-29(五)。送出前用 normalizeDate() 去掉星期再存。
import { useRef, useEffect } from "react";
import { normalizeDate, isIsoDate, formatDateWithWeekday } from "@/lib/dates";

export function DateField({
  value,
  onChange,
  placeholder = "2026-04-08",
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);

  // 外部塞進來的乾淨日期(編輯開啟、自動算出的保固到期日等)也補上星期
  useEffect(() => {
    if (isIsoDate(value)) onChange(formatDateWithWeekday(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // 使用者輸入:一旦正規化後是合法日期就即時顯示成 2026-05-29(五);
  // 還沒打完整就把殘留的星期標記去掉再顯示(避免編輯刪數字時「(五)」卡在中間)
  function handleInput(raw: string) {
    const iso = normalizeDate(raw);
    if (isIsoDate(iso)) onChange(formatDateWithWeekday(iso));
    else onChange(raw.replace(/[(（].*$/, ""));
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker) return;
    const cur = normalizeDate(value);
    if (isIsoDate(cur)) picker.value = cur;
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.focus();
  }

  return (
    <div className="flex gap-1">
      <input
        type="text"
        inputMode="numeric"
        maxLength={16}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={openPicker}
        className="px-2 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg text-lg shrink-0"
        title="從日曆選"
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="absolute opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handleInput(e.target.value)}
      />
    </div>
  );
}
