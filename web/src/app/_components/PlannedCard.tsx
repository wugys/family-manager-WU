"use client";

import type { ModuleItem } from "@/lib/modules";

// 規劃中板塊的卡片:灰色、點了跳「敬請期待」提示。
// 因為要在瀏覽器處理 onClick(彈 alert),所以是 client component。
export default function PlannedCard({ item }: { item: ModuleItem }) {
  function handleClick() {
    alert(
      `「${item.name}」還在規劃中,敬請期待。\n\n想優先做這個的話,告訴 Kevin 一聲。`,
    );
  }

  return (
    <button
      onClick={handleClick}
      className="bg-white/60 rounded-xl border border-slate-200 border-dashed p-4 flex flex-col items-start gap-1 text-left hover:bg-white transition"
    >
      <div className="flex items-start justify-between w-full">
        <span className="text-3xl grayscale opacity-60">{item.icon}</span>
        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
          規劃中
        </span>
      </div>
      <h3 className="font-semibold text-slate-500 mt-1">{item.name}</h3>
      <p className="text-xs text-slate-400">{item.desc}</p>
    </button>
  );
}
