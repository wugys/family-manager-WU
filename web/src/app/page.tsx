import Link from "next/link";
import { MODULE_CATEGORIES, type ModuleItem } from "@/lib/modules";
import PlannedCard from "./_components/PlannedCard";

// 已啟用板塊的卡片:綠色標籤、可點進入該板塊頁面。
function ActiveCard({ item }: { item: ModuleItem }) {
  return (
    <Link
      href={item.href!}
      className="bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md active:scale-95 transition p-4 flex flex-col items-start gap-1"
    >
      <div className="flex items-start justify-between w-full">
        <span className="text-3xl">{item.icon}</span>
        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
          已啟用
        </span>
      </div>
      <h3 className="font-semibold text-slate-900 mt-1">{item.name}</h3>
      <p className="text-xs text-slate-500">{item.desc}</p>
    </Link>
  );
}

export default function HomePage() {
  return (
    <>
      {/* 頂部 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">家庭管理系統</h1>
          <p className="text-sm text-slate-500 mt-1">
            7 人家庭共用 · 點卡片進入各功能
          </p>
        </div>
      </header>

      {/* 主畫面 */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8 pb-16">
        {MODULE_CATEGORIES.map((cat) => (
          <section key={cat.key}>
            <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {cat.items.map((item) =>
                item.status === "active" ? (
                  <ActiveCard key={item.name} item={item} />
                ) : (
                  <PlannedCard key={item.name} item={item} />
                ),
              )}
            </div>
          </section>
        ))}

        <p className="text-xs text-slate-400 text-center pt-4">
          想優先做哪個「規劃中」板塊?告訴 Kevin。
        </p>
      </main>
    </>
  );
}
