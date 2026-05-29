"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShoppingItem } from "@/lib/shopping";

const API = "/api/shopping";

type Filter = "all" | "todo" | "bought";

interface EditForm {
  id: string;
  name: string;
  quantity: string;
  category: string;
  note: string;
}

const EMPTY_EDIT: EditForm = {
  id: "",
  name: "",
  quantity: "",
  category: "",
  note: "",
};

const CATEGORY_OPTIONS = [
  "蔬果",
  "肉品",
  "海鮮",
  "冷藏",
  "冷凍",
  "乾貨",
  "飲料",
  "日用品",
  "零食",
];

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [quickAdd, setQuickAdd] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_EDIT);

  async function loadItems() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("HTTP " + res.status);
      setItems(await res.json());
    } catch (e) {
      alert("載入失敗:" + (e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  const todo = items.filter((x) => !x.is_bought);
  const bought = items.filter((x) => x.is_bought);

  // 套用篩選
  let visible = items;
  if (filter === "todo") visible = todo;
  if (filter === "bought") visible = bought;

  const todoVisible = visible.filter((x) => !x.is_bought);
  const boughtVisible = visible.filter((x) => x.is_bought);
  const groups = groupByCategory(todoVisible);

  // ===== 快速新增 =====
  async function onQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = quickAdd.trim();
    if (!name) return;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setQuickAdd("");
      await loadItems();
    } catch (e) {
      alert("加入失敗:" + (e instanceof Error ? e.message : e));
    }
  }

  // ===== 勾選 / 取消勾選 =====
  async function toggleBought(item: ShoppingItem) {
    try {
      const res = await fetch(`${API}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_bought: !item.is_bought }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      await loadItems();
    } catch (e) {
      alert("更新失敗:" + (e instanceof Error ? e.message : e));
    }
  }

  // ===== 編輯 Modal =====
  function openEdit(x: ShoppingItem) {
    setForm({
      id: String(x.id),
      name: x.name,
      quantity: x.quantity ?? "",
      category: x.category ?? "",
      note: x.note ?? "",
    });
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  }

  function closeModal() {
    setModalVisible(false);
    setTimeout(() => setModalOpen(false), 250);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name.trim(),
      quantity: form.quantity.trim() || null,
      category: form.category.trim() || null,
      note: form.note.trim() || null,
    };
    try {
      const res = await fetch(`${API}/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("儲存失敗:" + JSON.stringify(err.detail));
        return;
      }
      closeModal();
      await loadItems();
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    }
  }

  async function onDeleteItem() {
    if (!form.id) return;
    if (!confirm("確定要刪除這筆品項嗎?")) return;
    const res = await fetch(`${API}/${form.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    closeModal();
    await loadItems();
  }

  // ===== 一鍵清掉已買 =====
  async function onClearBought() {
    if (bought.length === 0) return;
    if (!confirm(`確定要清掉 ${bought.length} 筆已買品項嗎?(無法復原)`))
      return;
    const res = await fetch(`${API}/clear-bought`, { method: "POST" });
    if (!res.ok) {
      alert("清除失敗");
      return;
    }
    await loadItems();
  }

  const isEmpty = visible.length === 0;

  return (
    <div className="pb-28">
      {/* 頂部 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-900 text-sm"
          >
            ← 主頁
          </Link>
          <h1 className="text-lg font-bold flex-1">採購清單</h1>
          <span className="text-xs text-slate-500">
            待買 {todo.length} · 已買 {bought.length}
          </span>
        </div>

        {/* 快速新增列 */}
        <div className="max-w-md mx-auto px-4 pb-3">
          <form onSubmit={onQuickAdd} className="flex gap-2">
            <input
              required
              maxLength={50}
              autoComplete="off"
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              placeholder="+ 加入新品項…(按 Enter 即可)"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg px-4 py-2.5 font-medium"
            >
              加入
            </button>
          </form>
          <p className="text-[11px] text-slate-400 mt-1.5">
            小技巧:加進來後點品名可以補數量、類別、備註
          </p>
        </div>

        {/* 篩選 chips */}
        <div className="max-w-md mx-auto px-4 pb-3 flex gap-2">
          {(["all", "todo", "bought"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "px-3 py-1 rounded-full text-sm " +
                (filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-slate-200 text-slate-700")
              }
            >
              {f === "all" ? "全部" : f === "todo" ? "待買" : "已買"}
            </button>
          ))}
        </div>
      </header>

      {/* 列表區 */}
      <main className="max-w-md mx-auto px-4 py-3">
        {loading ? (
          <div className="text-center text-slate-400 py-16">
            <p className="text-sm">載入中…</p>
          </div>
        ) : isEmpty ? (
          <div className="text-center text-slate-500 py-16">
            <p className="text-base">清單是空的</p>
            <p className="text-sm mt-1 text-slate-400">
              用上面的輸入欄加入第一個品項
            </p>
          </div>
        ) : (
          <>
            {/* 未買:依類別分組 */}
            {groups.map(([cat, list]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mt-4 mb-2">
                  {cat}
                </h3>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {list.map((x) => (
                    <Row
                      key={x.id}
                      item={x}
                      onToggle={() => toggleBought(x)}
                      onEdit={() => openEdit(x)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* 已買區塊 */}
            {boughtVisible.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mt-6 mb-2">
                  已買
                </h3>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {boughtVisible.map((x) => (
                    <Row
                      key={x.id}
                      item={x}
                      onToggle={() => toggleBought(x)}
                      onEdit={() => openEdit(x)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 底部「清掉已買」黏住列 */}
      {bought.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 bg-white border-t border-slate-200 shadow-lg p-3">
          <div className="max-w-md mx-auto">
            <button
              onClick={onClearBought}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-3 font-medium"
            >
              一鍵清掉已買 ({bought.length})
            </button>
          </div>
        </div>
      )}

      {/* 編輯 Modal */}
      {modalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-20"
            onClick={closeModal}
          />
          <div
            className={
              "modal-slide fixed inset-x-0 bottom-0 z-30 bg-white rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto" +
              (modalVisible ? " open" : "")
            }
          >
            <div className="max-w-md mx-auto p-5">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold mb-4">編輯品項</h2>

              <form onSubmit={saveEdit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    品名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    maxLength={50}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">數量</label>
                  <input
                    maxLength={30}
                    placeholder="2 瓶 / 半箱 / 500g…"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">類別</label>
                  <input
                    list="shopping-category-options"
                    maxLength={20}
                    placeholder="蔬果 / 肉品 / 日用品…"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className={inputCls}
                  />
                  <datalist id="shopping-category-options">
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">備註</label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    className={inputCls + " resize-none"}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 rounded-lg py-3 font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg py-3 font-medium"
                  >
                    儲存
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onDeleteItem}
                  className="w-full text-red-600 py-3 text-sm"
                >
                  刪除這筆
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const inputCls =
  "w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

// 把未買品項依類別分組,沒類別的歸到「未分類」放最後
function groupByCategory(
  list: ShoppingItem[],
): [string, ShoppingItem[]][] {
  const map = new Map<string, ShoppingItem[]>();
  const uncategorized: ShoppingItem[] = [];
  for (const x of list) {
    if (x.category) {
      if (!map.has(x.category)) map.set(x.category, []);
      map.get(x.category)!.push(x);
    } else {
      uncategorized.push(x);
    }
  }
  const sorted = Array.from(map.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  if (uncategorized.length > 0) sorted.push(["未分類", uncategorized]);
  return sorted;
}

function Row({
  item: x,
  onToggle,
  onEdit,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={
        "flex items-center gap-3 px-3 py-3 " + (x.is_bought ? "opacity-55" : "")
      }
    >
      <button
        onClick={onToggle}
        className={
          "shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition active:scale-90 " +
          (x.is_bought
            ? "bg-green-500 border-green-500 text-white"
            : "bg-white border-slate-300")
        }
      >
        {x.is_bought && (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={
              "font-medium text-slate-900 " +
              (x.is_bought ? "line-through" : "")
            }
          >
            {x.name}
          </span>
          {x.quantity && (
            <span className="text-sm text-slate-500">· {x.quantity}</span>
          )}
        </div>
        {x.note && (
          <p className="text-xs text-slate-400 mt-0.5 truncate">{x.note}</p>
        )}
      </button>
    </div>
  );
}
