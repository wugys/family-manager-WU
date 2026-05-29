"use client";

// 家電管理頁(對應原本 static/appliances.html)
// 雙表:家電本體 + 每台底下的保養/耗材任務子清單;含 Drive 檔案上傳 + Ctrl+V 貼截圖。
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import type { Appliance, ApplianceTask } from "@/lib/appliances";

const API_APPLIANCES = "/api/appliances";
const API_TASKS = "/api/appliance-tasks";

const TASK_TYPE_OPTIONS = ["清潔", "保養", "耗材更換", "其他"];

const inputCls =
  "w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

type Filter = "all" | "overdue" | "warranty";

// ===== 日期算數工具 =====
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysFromToday(isoDate: string | null): number | null {
  if (!isoDate) return null;
  return Math.round(
    (new Date(isoDate + "T00:00:00").getTime() - todayMidnight().getTime()) /
      86400000,
  );
}
function hasOverdueTask(tasks: ApplianceTask[]): boolean {
  return tasks.some((t) => {
    const d = daysFromToday(t.next_due_date);
    return d !== null && d < 0;
  });
}
function isInWarranty(a: Appliance): boolean {
  const d = daysFromToday(a.warranty_until);
  return d !== null && d >= 0;
}

// 從 Drive view URL 反解 file_id(算 thumbnail URL 用)
function extractDriveFileId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  const m2 = url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

function computeTaskStatus(t: ApplianceTask): { color: string; text: string } {
  if (!t.next_due_date)
    return { color: "bg-slate-100 text-slate-600", text: "不定期" };
  const days = daysFromToday(t.next_due_date)!;
  if (days < 0)
    return { color: "bg-red-100 text-red-700", text: `逾期 ${-days} 天` };
  if (days === 0)
    return { color: "bg-amber-100 text-amber-700", text: "今天該做" };
  if (days <= 7)
    return { color: "bg-amber-100 text-amber-700", text: `${days} 天後` };
  return { color: "bg-green-100 text-green-700", text: `${days} 天後` };
}

type ApplianceForm = {
  name: string;
  location: string;
  brand: string;
  model: string;
  purchase_date: string;
  warranty_until: string;
  note: string;
};

const emptyApplianceForm: ApplianceForm = {
  name: "",
  location: "",
  brand: "",
  model: "",
  purchase_date: "",
  warranty_until: "",
  note: "",
};

type TaskForm = {
  name: string;
  task_type: string;
  cycle_days: string;
  last_done_date: string;
  note: string;
};

const emptyTaskForm: TaskForm = {
  name: "",
  task_type: "",
  cycle_days: "",
  last_done_date: "",
  note: "",
};

export default function AppliancesPage() {
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [tasksByAppliance, setTasksByAppliance] = useState<
    Record<number, ApplianceTask[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalApplianceId, setModalApplianceId] = useState<number | null>(null);
  const [form, setForm] = useState<ApplianceForm>(emptyApplianceForm);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ photo: boolean; manual: boolean }>(
    { photo: false, manual: false },
  );

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);

  const photoFileRef = useRef<HTMLInputElement>(null);
  const manualFileRef = useRef<HTMLInputElement>(null);
  const manualBlockRef = useRef<HTMLDivElement>(null);

  const loadAppliances = useCallback(async () => {
    try {
      const [aRes, tRes] = await Promise.all([
        fetch(API_APPLIANCES),
        fetch(API_TASKS),
      ]);
      if (!aRes.ok) throw new Error("家電 HTTP " + aRes.status);
      if (!tRes.ok) throw new Error("任務 HTTP " + tRes.status);
      const aList: Appliance[] = await aRes.json();
      const allTasks: ApplianceTask[] = await tRes.json();

      const byAppliance: Record<number, ApplianceTask[]> = {};
      allTasks.forEach((t) => {
        (byAppliance[t.appliance_id] ||= []).push(t);
      });
      setAppliances(aList);
      setTasksByAppliance(byAppliance);
    } catch (e) {
      alert("載入失敗:" + (e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppliances();
  }, [loadAppliances]);

  function tasksOf(id: number | null): ApplianceTask[] {
    if (id === null) return [];
    return tasksByAppliance[id] ?? [];
  }

  // ===== Modal 開關 =====
  function showModal() {
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  }
  function closeModal() {
    setModalVisible(false);
    setTimeout(() => setModalOpen(false), 250);
  }

  function openAddModal() {
    setModalApplianceId(null);
    setForm(emptyApplianceForm);
    setPhotoUrl(null);
    setManualUrl(null);
    setShowTaskForm(false);
    setTaskForm(emptyTaskForm);
    showModal();
  }

  function openEditModal(a: Appliance) {
    setModalApplianceId(a.id);
    setForm({
      name: a.name ?? "",
      location: a.location ?? "",
      brand: a.brand ?? "",
      model: a.model ?? "",
      purchase_date: a.purchase_date ?? "",
      warranty_until: a.warranty_until ?? "",
      note: a.note ?? "",
    });
    setPhotoUrl(a.photo_url);
    setManualUrl(a.manual_url);
    setShowTaskForm(false);
    setTaskForm(emptyTaskForm);
    showModal();
  }

  // ===== 家電表單送出 =====
  async function submitApplianceForm(e: React.FormEvent) {
    e.preventDefault();
    // photo_url / manual_url 不從這個 form 送 → 它們透過 /upload endpoint 改
    const data = {
      name: form.name.trim(),
      location: form.location.trim() || null,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      purchase_date: form.purchase_date || null,
      warranty_until: form.warranty_until || null,
      note: form.note.trim() || null,
    };
    try {
      const res = modalApplianceId
        ? await fetch(`${API_APPLIANCES}/${modalApplianceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
        : await fetch(API_APPLIANCES, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
      if (!res.ok) {
        const err = await res.json();
        alert("儲存失敗:" + JSON.stringify(err.detail));
        return;
      }
      if (!modalApplianceId) {
        // 新增成功 → 取回新 id,自動切到編輯模式以便繼續加任務 / 上傳
        const created: Appliance = await res.json();
        await loadAppliances();
        openEditModal(created);
      } else {
        closeModal();
        await loadAppliances();
      }
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    }
  }

  async function deleteAppliance() {
    if (!modalApplianceId) return;
    const a = appliances.find((x) => x.id === modalApplianceId);
    const taskCount = tasksOf(modalApplianceId).length;
    const msg =
      taskCount > 0
        ? `確定要刪除「${a?.name}」?連同 ${taskCount} 個保養/耗材任務一起被刪掉,無法復原。`
        : `確定要刪除「${a?.name}」?無法復原。`;
    if (!confirm(msg)) return;
    const res = await fetch(`${API_APPLIANCES}/${modalApplianceId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    closeModal();
    await loadAppliances();
  }

  // ===== 檔案上傳 =====
  function triggerUpload(kind: "photo" | "manual") {
    if (!modalApplianceId) {
      alert("請先儲存家電,才能上傳檔案");
      return;
    }
    (kind === "photo" ? photoFileRef : manualFileRef).current?.click();
  }

  const handleFileSelected = useCallback(
    async (kind: "photo" | "manual", file: File | undefined | null) => {
      if (!file || !modalApplianceId) return;
      setUploading((u) => ({ ...u, [kind]: true }));
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(
          `${API_APPLIANCES}/${modalApplianceId}/upload?kind=${kind}`,
          { method: "POST", body: formData },
        );
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ detail: "HTTP " + res.status }));
          alert("上傳失敗:" + JSON.stringify(err.detail));
          return;
        }
        const data = await res.json();
        if (kind === "photo") setPhotoUrl(data.view_url);
        else setManualUrl(data.view_url);
        await loadAppliances();
      } catch (e) {
        alert("網路錯誤:" + (e instanceof Error ? e.message : e));
      } finally {
        setUploading((u) => ({ ...u, [kind]: false }));
      }
    },
    [modalApplianceId, loadAppliances],
  );

  // ===== Ctrl+V 貼截圖上傳 =====
  useEffect(() => {
    if (!modalOpen) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      let imageItem: DataTransferItem | null = null;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          imageItem = item;
          break;
        }
      }
      if (!imageItem) return;
      e.preventDefault();
      if (!modalApplianceId) {
        alert("請先儲存家電,才能上傳檔案");
        return;
      }
      // active element 落在說明書區塊內 → 貼到說明書;否則照片
      const active = document.activeElement;
      const kind =
        active && manualBlockRef.current?.contains(active) ? "manual" : "photo";
      const file = imageItem.getAsFile();
      if (file) handleFileSelected(kind, file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [modalOpen, modalApplianceId, handleFileSelected]);

  // ===== 任務操作 =====
  async function submitTaskForm(e: React.FormEvent) {
    e.preventDefault();
    if (!modalApplianceId) {
      alert("請先儲存家電才能加任務");
      return;
    }
    const cycle = taskForm.cycle_days.trim();
    const data = {
      appliance_id: modalApplianceId,
      name: taskForm.name.trim(),
      task_type: taskForm.task_type.trim() || null,
      cycle_days: cycle === "" ? null : parseInt(cycle, 10),
      last_done_date: taskForm.last_done_date || null,
      note: taskForm.note.trim() || null,
    };
    try {
      const res = await fetch(API_TASKS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("新增任務失敗:" + JSON.stringify(err.detail));
        return;
      }
      setShowTaskForm(false);
      setTaskForm(emptyTaskForm);
      await loadAppliances();
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    }
  }

  async function markTaskDone(taskId: number) {
    const res = await fetch(`${API_TASKS}/${taskId}/mark-done`, {
      method: "POST",
    });
    if (!res.ok) {
      alert("標記失敗");
      return;
    }
    await loadAppliances();
  }

  async function deleteTask(taskId: number) {
    if (!confirm("確定要刪除這個任務嗎?")) return;
    const res = await fetch(`${API_TASKS}/${taskId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    await loadAppliances();
  }

  // ===== 篩選 + 排序 =====
  let filtered = appliances;
  if (filter === "overdue")
    filtered = appliances.filter((a) => hasOverdueTask(tasksOf(a.id)));
  if (filter === "warranty") filtered = appliances.filter(isInWarranty);
  filtered = [...filtered].sort((a, b) => {
    const ao = hasOverdueTask(tasksOf(a.id)) ? 0 : 1;
    const bo = hasOverdueTask(tasksOf(b.id)) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.id - b.id;
  });

  const modalTasks = [...tasksOf(modalApplianceId)].sort((a, b) => {
    const da = daysFromToday(a.next_due_date);
    const db = daysFromToday(b.next_due_date);
    if (da === null && db === null) return a.id - b.id;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  return (
    <>
      {/* 頂部固定列 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-slate-500 hover:text-slate-900 text-sm">
            ← 主頁
          </Link>
          <h1 className="text-xl font-bold flex-1">家庭家電</h1>
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            + 新增
          </button>
        </div>
        <div className="max-w-md mx-auto px-4 pb-3 flex gap-2">
          {([
            ["all", "全部"],
            ["overdue", "有逾期"],
            ["warranty", "保固中"],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-full text-sm ${
                filter === key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* 卡片列表 */}
      <main className="max-w-md mx-auto px-4 py-4 pb-24">
        {loading ? (
          <div className="text-center text-slate-400 py-16">
            <p className="text-sm">載入中…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-500 py-16">
            <p className="text-base">這裡還沒有家電</p>
            <p className="text-sm mt-1 text-slate-400">點右上「+ 新增」開始</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <ApplianceCard
                key={a.id}
                a={a}
                tasks={tasksOf(a.id)}
                onClick={() => openEditModal(a)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {modalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-20"
            onClick={closeModal}
          />
          <div
            className={`modal-slide fixed inset-x-0 bottom-0 z-30 bg-white rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto${
              modalVisible ? " open" : ""
            }`}
          >
            <div className="max-w-md mx-auto p-5">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold mb-4">
                {modalApplianceId ? "編輯家電" : "新增家電"}
              </h2>

              <form onSubmit={submitApplianceForm} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    maxLength={50}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                    placeholder="例:客廳冷氣、洗衣機"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">位置</label>
                  <input
                    maxLength={20}
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    className={inputCls}
                    placeholder="客廳、主臥…"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">廠牌</label>
                    <input
                      maxLength={30}
                      value={form.brand}
                      onChange={(e) =>
                        setForm({ ...form, brand: e.target.value })
                      }
                      className={inputCls}
                      placeholder="大金、國際…"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">型號</label>
                    <input
                      maxLength={50}
                      value={form.model}
                      onChange={(e) =>
                        setForm({ ...form, model: e.target.value })
                      }
                      className={inputCls}
                      placeholder="RXM50RVLT"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      購買日
                    </label>
                    <input
                      type="date"
                      value={form.purchase_date}
                      onChange={(e) =>
                        setForm({ ...form, purchase_date: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      保固到期日
                    </label>
                    <input
                      type="date"
                      value={form.warranty_until}
                      onChange={(e) =>
                        setForm({ ...form, warranty_until: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* 照片上傳 */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    家電照片(會成為主頁卡片頭貼)
                    <span className="text-xs font-normal text-slate-400">
                      {" "}
                      · Ctrl+V 可直接貼截圖
                    </span>
                  </label>
                  <UploadBlock
                    kind="photo"
                    url={photoUrl}
                    uploading={uploading.photo}
                    onTrigger={() => triggerUpload("photo")}
                  />
                  <input
                    ref={photoFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleFileSelected("photo", e.target.files?.[0])
                    }
                  />
                </div>

                {/* 說明書上傳 */}
                <div ref={manualBlockRef}>
                  <label className="block text-sm font-medium mb-1">
                    說明書(PDF 或圖片)
                    <span className="text-xs font-normal text-slate-400">
                      {" "}
                      · 點此區後 Ctrl+V 貼截圖
                    </span>
                  </label>
                  <UploadBlock
                    kind="manual"
                    url={manualUrl}
                    uploading={uploading.manual}
                    onTrigger={() => triggerUpload("manual")}
                  />
                  <input
                    ref={manualFileRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) =>
                      handleFileSelected("manual", e.target.files?.[0])
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">備註</label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="序號、購買通路、維修聯絡…"
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

                {modalApplianceId && (
                  <button
                    type="button"
                    onClick={deleteAppliance}
                    className="w-full text-red-600 py-3 text-sm"
                  >
                    🗑 刪除這台家電(連同所有任務)
                  </button>
                )}
              </form>

              {/* 任務子區塊(只在編輯模式顯示) */}
              {modalApplianceId && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold">
                      保養 / 耗材任務{" "}
                      <span className="text-slate-500 font-normal text-sm">
                        {modalTasks.length > 0 ? `(${modalTasks.length})` : ""}
                      </span>
                    </h3>
                    {!showTaskForm && (
                      <button
                        type="button"
                        onClick={() => setShowTaskForm(true)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        + 新增任務
                      </button>
                    )}
                  </div>

                  {showTaskForm && (
                    <form
                      onSubmit={submitTaskForm}
                      className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2"
                    >
                      <input
                        required
                        maxLength={50}
                        autoFocus
                        value={taskForm.name}
                        onChange={(e) =>
                          setTaskForm({ ...taskForm, name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="任務名(例:清洗濾網)"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          list="task-type-options"
                          maxLength={20}
                          value={taskForm.task_type}
                          onChange={(e) =>
                            setTaskForm({
                              ...taskForm,
                              task_type: e.target.value,
                            })
                          }
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="類型"
                        />
                        <datalist id="task-type-options">
                          {TASK_TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={taskForm.cycle_days}
                          onChange={(e) =>
                            setTaskForm({
                              ...taskForm,
                              cycle_days: e.target.value,
                            })
                          }
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="週期(天),空=不定期"
                        />
                      </div>
                      <input
                        type="date"
                        value={taskForm.last_done_date}
                        onChange={(e) =>
                          setTaskForm({
                            ...taskForm,
                            last_done_date: e.target.value,
                          })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        maxLength={100}
                        value={taskForm.note}
                        onChange={(e) =>
                          setTaskForm({ ...taskForm, note: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="備註(用哪牌耗材…)"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowTaskForm(false);
                            setTaskForm(emptyTaskForm);
                          }}
                          className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg py-2 text-sm"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium"
                        >
                          新增任務
                        </button>
                      </div>
                    </form>
                  )}

                  {modalTasks.length === 0 ? (
                    <div className="text-center text-slate-400 py-4 text-sm">
                      還沒任務,點上方「+ 新增任務」
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {modalTasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          t={t}
                          onDone={() => markTaskDone(t.id)}
                          onDelete={() => deleteTask(t.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ApplianceCard({
  a,
  tasks,
  onClick,
}: {
  a: Appliance;
  tasks: ApplianceTask[];
  onClick: () => void;
}) {
  const overdue = tasks.filter((t) => {
    const d = daysFromToday(t.next_due_date);
    return d !== null && d < 0;
  }).length;
  const upcoming = tasks.filter((t) => {
    const d = daysFromToday(t.next_due_date);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  const wDays = daysFromToday(a.warranty_until);
  let warrantyBadge: { color: string; text: string } | null = null;
  if (wDays !== null) {
    if (wDays < 0)
      warrantyBadge = { color: "bg-slate-100 text-slate-500", text: "保固已過" };
    else if (wDays <= 30)
      warrantyBadge = {
        color: "bg-amber-100 text-amber-700",
        text: `保固剩 ${wDays} 天`,
      };
    else warrantyBadge = { color: "bg-green-100 text-green-700", text: "保固中" };
  }

  let taskSummary: { color: string; text: string };
  if (tasks.length === 0)
    taskSummary = { color: "text-slate-400", text: "無任務" };
  else if (overdue > 0)
    taskSummary = {
      color: "font-medium text-red-600",
      text: `⚠️ ${overdue} 項逾期 / 共 ${tasks.length} 項`,
    };
  else if (upcoming > 0)
    taskSummary = {
      color: "font-medium text-amber-600",
      text: `⏰ ${upcoming} 項即將到期 / 共 ${tasks.length} 項`,
    };
  else
    taskSummary = {
      color: "text-green-600",
      text: `✓ ${tasks.length} 項任務全正常`,
    };

  const meta = [a.brand, a.model, a.location].filter(Boolean).join(" · ");
  const photoId = extractDriveFileId(a.photo_url);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:bg-slate-50 active:scale-[0.98] transition"
    >
      <div className="flex items-start gap-3">
        {photoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://drive.google.com/thumbnail?id=${photoId}&sz=w160`}
            className="w-14 h-14 rounded-lg object-cover shrink-0 bg-slate-100"
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center text-2xl shrink-0">
            🔌
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{a.name}</h3>
            {warrantyBadge && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${warrantyBadge.color}`}
              >
                {warrantyBadge.text}
              </span>
            )}
          </div>
          {meta && <p className="text-xs text-slate-500 mt-1">{meta}</p>}
          <p className={`mt-2 text-xs ${taskSummary.color}`}>{taskSummary.text}</p>
        </div>
        <span className="text-slate-300 text-xl shrink-0">›</span>
      </div>
    </button>
  );
}

function TaskRow({
  t,
  onDone,
  onDelete,
}: {
  t: ApplianceTask;
  onDone: () => void;
  onDelete: () => void;
}) {
  const status = computeTaskStatus(t);
  const meta = [
    t.cycle_days ? `每 ${t.cycle_days} 天` : "不定期",
    t.last_done_date ? `上次:${t.last_done_date}` : null,
    t.next_due_date ? `下次:${t.next_due_date}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{t.name}</span>
            {t.task_type && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {t.task_type}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">{meta}</div>
          {t.note && (
            <div className="text-xs text-slate-400 mt-1">{t.note}</div>
          )}
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${status.color}`}
        >
          {status.text}
        </span>
      </div>
      <div className="flex gap-2 mt-2">
        <button
          onClick={onDone}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium"
        >
          ✓ 標已完成
        </button>
        <button
          onClick={onDelete}
          className="px-3 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 text-slate-600 hover:text-red-600 rounded-lg py-2 text-sm"
        >
          刪除
        </button>
      </div>
    </div>
  );
}

function UploadBlock({
  kind,
  url,
  uploading,
  onTrigger,
}: {
  kind: "photo" | "manual";
  url: string | null;
  uploading: boolean;
  onTrigger: () => void;
}) {
  const label = kind === "photo" ? "照片" : "說明書";

  if (uploading) {
    return (
      <div className="text-center text-slate-500 py-4 text-sm">上傳中…</div>
    );
  }

  if (url) {
    const fileId = extractDriveFileId(url);
    return (
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
        {kind === "photo" && fileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://drive.google.com/thumbnail?id=${fileId}&sz=w160`}
            className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-100"
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-2xl shrink-0">
            {kind === "photo" ? "🖼" : "📄"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 font-medium">已上傳</p>
          <div className="flex gap-3 mt-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              檢視
            </a>
            <button
              type="button"
              onClick={onTrigger}
              className="text-xs text-slate-500 hover:underline"
            >
              換一張
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onTrigger}
      className="w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-lg p-4 text-center text-slate-500 hover:text-blue-600 transition"
    >
      <span className="text-2xl">📤</span>
      <p className="text-sm mt-1">選擇{label}上傳</p>
    </button>
  );
}
