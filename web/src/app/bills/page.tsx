"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Bill } from "@/lib/bills";

const API = "/api/bills";

// 週期翻譯:後端用英文 key,前端顯示中文
const CYCLE_LABELS: Record<string, string> = {
  monthly: "每月",
  "bi-monthly": "每兩月",
  quarterly: "每季",
  yearly: "每年",
  "one-time": "一次性",
  custom: "自訂",
};

type Filter = "all" | "unpaid" | "paid";

// 表單欄位狀態(字串為主,送出時再轉型)
interface FormState {
  id: string;
  name: string;
  amount: string;
  cycle: string;
  cycle_days: string;
  next_due_date: string;
  category: string;
  payer: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  amount: "",
  cycle: "monthly",
  cycle_days: "",
  next_due_date: "",
  category: "",
  payer: "",
  note: "",
};

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  // modal 狀態:modalOpen 控制掛載,modalVisible 控制滑入動畫
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const isEditing = form.id !== "";

  // ===== 載入列表 =====
  async function loadBills() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("HTTP " + res.status);
      setBills(await res.json());
    } catch (e) {
      alert("載入帳單失敗:" + (e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBills();
  }, []);

  // ===== 套用篩選 + 排序 =====
  let filtered = bills;
  if (filter === "unpaid") filtered = bills.filter((b) => !b.is_paid);
  if (filter === "paid") filtered = bills.filter((b) => b.is_paid);
  filtered = [...filtered].sort((a, b) => {
    if (a.is_paid !== b.is_paid) return a.is_paid ? 1 : -1;
    return a.next_due_date.localeCompare(b.next_due_date);
  });

  // ===== Modal 開關 =====
  function openAddModal() {
    const next = new Date();
    next.setMonth(next.getMonth() + 1, 1);
    setForm({ ...EMPTY_FORM, next_due_date: next.toISOString().slice(0, 10) });
    showModal();
  }

  function openEditModal(b: Bill) {
    setForm({
      id: String(b.id),
      name: b.name,
      amount: String(b.amount),
      cycle: b.cycle,
      cycle_days: b.cycle_days != null ? String(b.cycle_days) : "",
      next_due_date: b.next_due_date,
      category: b.category ?? "",
      payer: b.payer ?? "",
      note: b.note ?? "",
    });
    showModal();
  }

  function showModal() {
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  }

  function closeModal() {
    setModalVisible(false);
    setTimeout(() => setModalOpen(false), 250);
  }

  // ===== 送出表單(新增 or 更新) =====
  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      cycle: form.cycle,
      cycle_days: form.cycle === "custom" ? parseInt(form.cycle_days) : null,
      next_due_date: form.next_due_date,
      category: form.category.trim() || null,
      payer: form.payer.trim() || null,
      note: form.note.trim() || null,
    };
    try {
      const res = form.id
        ? await fetch(`${API}/${form.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
        : await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
      if (!res.ok) {
        const err = await res.json();
        alert("儲存失敗:" + JSON.stringify(err.detail));
        return;
      }
      closeModal();
      await loadBills();
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    }
  }

  // ===== 標記已繳 / 未繳 =====
  async function markPaid(id: number) {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_paid: true, last_paid_date: today }),
    });
    if (!res.ok) {
      alert("標記失敗");
      return;
    }
    await loadBills();
  }

  async function markUnpaid(id: number) {
    const res = await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_paid: false }),
    });
    if (!res.ok) {
      alert("標記失敗");
      return;
    }
    await loadBills();
  }

  // ===== 刪除 =====
  async function deleteBill() {
    if (!form.id) return;
    if (!confirm("確定要刪除這筆帳單嗎?無法復原。")) return;
    const res = await fetch(`${API}/${form.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    closeModal();
    await loadBills();
  }

  return (
    <>
      {/* 頂部固定列 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-slate-500 hover:text-slate-900 text-sm"
            >
              ← 主頁
            </Link>
            <h1 className="text-xl font-bold">家庭帳單</h1>
          </div>
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            + 新增
          </button>
        </div>
        {/* 篩選 chips */}
        <div className="max-w-md mx-auto px-4 pb-3 flex gap-2">
          {(["all", "unpaid", "paid"] as Filter[]).map((f) => (
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
              {f === "all" ? "全部" : f === "unpaid" ? "待繳" : "已繳"}
            </button>
          ))}
        </div>
      </header>

      {/* 列表區 */}
      <main className="max-w-md mx-auto px-4 py-4 pb-24">
        {loading ? (
          <div className="text-center text-slate-400 py-16">
            <p className="text-sm">載入中…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-500 py-16">
            <p className="text-base">這裡還沒有帳單</p>
            <p className="text-sm mt-1 text-slate-400">點右上「+ 新增」開始</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <BillCard
                key={b.id}
                bill={b}
                onMarkPaid={() => markPaid(b.id)}
                onMarkUnpaid={() => markUnpaid(b.id)}
                onEdit={() => openEditModal(b)}
              />
            ))}
          </div>
        )}
      </main>

      {/* 新增/編輯 Modal */}
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
              <h2 className="text-lg font-bold mb-4">
                {isEditing ? "編輯帳單" : "新增帳單"}
              </h2>

              <form onSubmit={submitForm} className="space-y-3">
                <Field label="名稱" required>
                  <input
                    required
                    maxLength={50}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                    placeholder="例:電費、Netflix"
                  />
                </Field>

                <Field label="金額" required>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    className={inputCls}
                    placeholder="1500"
                  />
                </Field>

                <Field label="週期" required>
                  <select
                    required
                    value={form.cycle}
                    onChange={(e) =>
                      setForm({ ...form, cycle: e.target.value })
                    }
                    className={inputCls + " bg-white"}
                  >
                    <option value="monthly">每月</option>
                    <option value="bi-monthly">每兩月</option>
                    <option value="quarterly">每季</option>
                    <option value="yearly">每年</option>
                    <option value="one-time">一次性</option>
                    <option value="custom">自訂天數</option>
                  </select>
                </Field>

                {form.cycle === "custom" && (
                  <Field label="每幾天?">
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={form.cycle_days}
                      onChange={(e) =>
                        setForm({ ...form, cycle_days: e.target.value })
                      }
                      className={inputCls}
                      placeholder="例:45"
                    />
                  </Field>
                )}

                <Field label="下次到期日" required>
                  <input
                    type="date"
                    required
                    value={form.next_due_date}
                    onChange={(e) =>
                      setForm({ ...form, next_due_date: e.target.value })
                    }
                    className={inputCls}
                  />
                </Field>

                <Field label="類別">
                  <input
                    list="category-options"
                    maxLength={20}
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className={inputCls}
                    placeholder="水電 / 保險 / 訂閱…"
                  />
                  <datalist id="category-options">
                    {["水電", "保險", "訂閱", "教育", "稅費", "其他"].map(
                      (c) => (
                        <option key={c} value={c} />
                      ),
                    )}
                  </datalist>
                </Field>

                <Field label="負責人">
                  <input
                    maxLength={20}
                    value={form.payer}
                    onChange={(e) =>
                      setForm({ ...form, payer: e.target.value })
                    }
                    className={inputCls}
                    placeholder="爸爸、媽媽…"
                  />
                </Field>

                <Field label="備註">
                  <textarea
                    rows={2}
                    maxLength={200}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    className={inputCls + " resize-none"}
                  />
                </Field>

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

                {isEditing && (
                  <button
                    type="button"
                    onClick={deleteBill}
                    className="w-full text-red-600 py-3 text-sm"
                  >
                    刪除這筆帳單
                  </button>
                )}
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ===== 共用小元件 =====
const inputCls =
  "w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function BillCard({
  bill: b,
  onMarkPaid,
  onMarkUnpaid,
  onEdit,
}: {
  bill: Bill;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  onEdit: () => void;
}) {
  // 算狀態徽章(逾期 / 快到期 / 已繳 / 一般)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(b.next_due_date + "T00:00:00");
  const daysToDue = Math.round((due.getTime() - today.getTime()) / 86400000);

  let badge = { color: "bg-slate-100 text-slate-600", text: "待繳" };
  if (b.is_paid) {
    badge = { color: "bg-green-100 text-green-700", text: "已繳" };
  } else if (daysToDue < 0) {
    badge = { color: "bg-red-100 text-red-700", text: `逾期 ${-daysToDue} 天` };
  } else if (daysToDue === 0) {
    badge = { color: "bg-amber-100 text-amber-700", text: "今天到期" };
  } else if (daysToDue <= 7) {
    badge = {
      color: "bg-amber-100 text-amber-700",
      text: `${daysToDue} 天後到期`,
    };
  }

  const cycleText = CYCLE_LABELS[b.cycle] || b.cycle;
  const cycleSuffix =
    b.cycle === "custom" && b.cycle_days ? `(每 ${b.cycle_days} 天)` : "";
  const meta = [cycleText + cycleSuffix, b.payer].filter(Boolean).join(" · ");

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{b.name}</h3>
            {b.category && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {b.category}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            ${b.amount.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">{meta}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            下次:{b.next_due_date}
          </p>
          {b.note && (
            <p className="text-xs text-slate-400 mt-1">{b.note}</p>
          )}
        </div>
        <span
          className={
            "text-xs font-medium px-2 py-1 rounded-full shrink-0 " + badge.color
          }
        >
          {badge.text}
        </span>
      </div>
      <div className="flex gap-2 mt-3">
        {b.is_paid ? (
          <button
            onClick={onMarkUnpaid}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg py-2.5 text-sm font-medium"
          >
            標記未繳
          </button>
        ) : (
          <button
            onClick={onMarkPaid}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium"
          >
            標記已繳
          </button>
        )}
        <button
          onClick={onEdit}
          className="px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg py-2.5 text-sm font-medium"
        >
          編輯
        </button>
      </div>
    </div>
  );
}
