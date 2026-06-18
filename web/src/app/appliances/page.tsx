"use client";

// 家電管理頁(對應原本 static/appliances.html)
// 雙表:家電本體 + 每台底下的保養/耗材任務子清單;含 Drive 檔案上傳 + Ctrl+V 貼截圖。
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import type { Appliance, ApplianceTask } from "@/lib/appliances";
import type { ApplianceContact } from "@/lib/applianceContacts";
import type { ApplianceFile, FileKind } from "@/lib/applianceFiles";
import type { ApplianceContactFile } from "@/lib/applianceContactFiles";
import { DateField } from "@/components/DateField";
import { normalizeDate, formatDateWithWeekday } from "@/lib/dates";

const API_APPLIANCES = "/api/appliances";
const API_TASKS = "/api/appliance-tasks";
const API_CONTACTS = "/api/appliance-contacts";
const API_FILES = "/api/appliance-files";
const API_CONTACT_FILES = "/api/appliance-contact-files";
const API_OCR = "/api/vision-ocr";

const TASK_TYPE_OPTIONS = ["清潔", "保養", "耗材更換", "其他"];

// 聯絡資訊類別(跟 lib/applianceContacts.ts 的 CONTACT_CATEGORIES 對齊)
const CONTACT_CATEGORIES = ["耗材連結", "保養資訊", "購買店家"] as const;
type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

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
  if (a.out_of_warranty) return false; // 手動標過保 → 不算保固中
  const d = daysFromToday(a.warranty_until);
  return d !== null && d >= 0;
}

// 購買日 + 保固期(年 / 月)→ 算出保固到期日(YYYY-MM-DD);用本地時間避免時區位移
function addPeriodToDate(
  isoDate: string,
  amount: number,
  unit: "year" | "month",
): string {
  const d = new Date(isoDate + "T00:00:00");
  if (unit === "year") d.setFullYear(d.getFullYear() + amount);
  else d.setMonth(d.getMonth() + amount);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  out_of_warranty: boolean;
  warranty_note: string;
  note: string;
};

const emptyApplianceForm: ApplianceForm = {
  name: "",
  location: "",
  brand: "",
  model: "",
  purchase_date: "",
  warranty_until: "",
  out_of_warranty: false,
  warranty_note: "",
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

// 聯絡資訊表單(類別決定要填哪些欄位)
type ContactForm = {
  category: ContactCategory;
  name: string; // 耗材名稱 或 店家名稱
  contact_person: string; // 聯絡人(店家窗口)
  url: string; // 耗材購買連結
  phone: string; // 市話
  mobile: string; // 行動電話
  address: string;
  business_hours: string; // 店家營業時間
  note: string;
  also_maintenance: boolean; // 購買店家是否同為保養店家
};

const emptyContactForm: ContactForm = {
  category: "耗材連結",
  name: "",
  contact_person: "",
  url: "",
  phone: "",
  mobile: "",
  address: "",
  business_hours: "",
  note: "",
  also_maintenance: false,
};

export default function AppliancesPage() {
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [tasksByAppliance, setTasksByAppliance] = useState<
    Record<number, ApplianceTask[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  // 區域篩選:"all" = 全部區域;否則為某個 location
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalApplianceId, setModalApplianceId] = useState<number | null>(null);
  // 卡片點一下 → 任務檢視("tasks");點 ✎ 或 +新增 → 編輯檢視("edit")
  const [modalMode, setModalMode] = useState<"tasks" | "edit">("tasks");
  // 編輯檢視上方的兩個頁籤
  const [editTab, setEditTab] = useState<"basic" | "warranty">("basic");
  const [form, setForm] = useState<ApplianceForm>(emptyApplianceForm);
  // 每台家電的上傳檔(照片 / 說明書 / 收據,皆可多檔)
  const [filesByAppliance, setFilesByAppliance] = useState<
    Record<number, ApplianceFile[]>
  >({});
  const [uploading, setUploading] = useState<Record<FileKind, boolean>>({
    photo: false,
    manual: false,
    receipt: false,
    warranty_card: false,
  });
  // Ctrl+V 貼上要丟到哪個上傳區(滑鼠移到 / 點到該區時設定)
  const [activeUploadKind, setActiveUploadKind] = useState<FileKind>("photo");

  // 各上傳區「暫存待上傳」的檔案,統一由父層保管(切頁籤 / 切家電 / 切店家都不會掉)。
  // key:photo / manual / receipt / contactPrice
  const [pending, setPending] = useState<Record<string, PendingFile[]>>({});

  // 任務檢視上方兩個頁籤:保養/耗材任務 vs 聯絡資訊
  const [tasksTab, setTasksTab] = useState<"tasks" | "contacts">("tasks");

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);

  // 聯絡資訊:每台家電可有多筆(分類別)
  const [contactsByAppliance, setContactsByAppliance] = useState<
    Record<number, ApplianceContact[]>
  >({});
  // 每筆聯絡資訊底下的檔案(目前只有價目表),依 contact_id 分組
  const [contactFilesByContact, setContactFilesByContact] = useState<
    Record<number, ApplianceContactFile[]>
  >({});
  const [contactUploading, setContactUploading] = useState(false);
  // null = 不在編輯;0 = 新增中;>0 = 正在編輯該 id 的聯絡資訊
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContactForm);
  const [scanning, setScanning] = useState(false);

  // 保固期換算小工具(只在表單暫存,不存進資料庫)
  const [warrantyPeriod, setWarrantyPeriod] = useState("");
  const [warrantyUnit, setWarrantyUnit] = useState<"year" | "month">("year");

  const scanFileRef = useRef<HTMLInputElement>(null);

  const loadAppliances = useCallback(async () => {
    try {
      const [aRes, tRes, cRes, fRes, cfRes] = await Promise.all([
        fetch(API_APPLIANCES),
        fetch(API_TASKS),
        fetch(API_CONTACTS),
        fetch(API_FILES),
        fetch(API_CONTACT_FILES),
      ]);
      if (!aRes.ok) throw new Error("家電 HTTP " + aRes.status);
      if (!tRes.ok) throw new Error("任務 HTTP " + tRes.status);
      if (!cRes.ok) throw new Error("聯絡資訊 HTTP " + cRes.status);
      if (!fRes.ok) throw new Error("檔案 HTTP " + fRes.status);
      if (!cfRes.ok) throw new Error("聯絡資訊檔案 HTTP " + cfRes.status);
      const aList: Appliance[] = await aRes.json();
      const allTasks: ApplianceTask[] = await tRes.json();
      const allContacts: ApplianceContact[] = await cRes.json();
      const allFiles: ApplianceFile[] = await fRes.json();
      const allContactFiles: ApplianceContactFile[] = await cfRes.json();

      const byAppliance: Record<number, ApplianceTask[]> = {};
      allTasks.forEach((t) => {
        (byAppliance[t.appliance_id] ||= []).push(t);
      });
      const contactsByApp: Record<number, ApplianceContact[]> = {};
      allContacts.forEach((c) => {
        (contactsByApp[c.appliance_id] ||= []).push(c);
      });
      const filesByApp: Record<number, ApplianceFile[]> = {};
      allFiles.forEach((f) => {
        (filesByApp[f.appliance_id] ||= []).push(f);
      });
      const contactFilesByCt: Record<number, ApplianceContactFile[]> = {};
      allContactFiles.forEach((f) => {
        (contactFilesByCt[f.contact_id] ||= []).push(f);
      });
      setAppliances(aList);
      setTasksByAppliance(byAppliance);
      setContactsByAppliance(contactsByApp);
      setFilesByAppliance(filesByApp);
      setContactFilesByContact(contactFilesByCt);
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

  // 取某台家電某個上傳區(kind)的檔案清單
  function filesOf(id: number | null, kind: FileKind): ApplianceFile[] {
    if (id === null) return [];
    return (filesByAppliance[id] ?? []).filter((f) => f.kind === kind);
  }

  // ===== 暫存檔操作(共用給所有上傳區)=====
  // 暫存一批檔到某個上傳區(圖片產生預覽縮圖,PDF 不預覽)
  function addPending(key: string, fileList: FileList | File[]) {
    const list = Array.from(fileList);
    for (const file of list) {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) =>
          setPending((prev) => ({
            ...prev,
            [key]: [
              ...(prev[key] ?? []),
              { file, preview: (e.target?.result as string) || "" },
            ],
          }));
        reader.readAsDataURL(file);
      } else {
        setPending((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), { file, preview: "" }],
        }));
      }
    }
  }
  // 移除某個上傳區裡第 idx 張暫存檔
  function removePending(key: string, idx: number) {
    setPending((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((_, i) => i !== idx),
    }));
  }
  // 清空指定上傳區的暫存(送出成功後呼叫)
  function clearPending(...keys: string[]) {
    setPending((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  // ===== Modal 開關 =====
  function showModal() {
    setModalOpen(true);
    requestAnimationFrame(() => setModalVisible(true));
  }
  function closeModal() {
    setModalVisible(false);
    setPending({}); // 關閉時丟掉所有未送出的暫存檔
    setTimeout(() => setModalOpen(false), 250);
  }

  function openAddModal() {
    setModalApplianceId(null);
    setForm(emptyApplianceForm);
    setActiveUploadKind("photo");
    setPending({});
    setShowTaskForm(false);
    setTaskForm(emptyTaskForm);
    setEditingContactId(null);
    setWarrantyPeriod("");
    setWarrantyUnit("year");
    setModalMode("edit");
    setEditTab("basic");
    showModal();
  }

  // 卡片點一下 → 直接看「保養/耗材任務」+ 聯絡資訊
  function openTasksModal(a: Appliance) {
    setModalApplianceId(a.id);
    setShowTaskForm(false);
    setTaskForm(emptyTaskForm);
    setEditingContactId(null);
    setTasksTab("tasks");
    setModalMode("tasks");
    showModal();
  }

  // 點 ✎ 編輯鈕 → 編輯家電(基本資料 / 保固資料兩頁籤)
  function openEditModal(a: Appliance) {
    setModalApplianceId(a.id);
    setForm({
      name: a.name ?? "",
      location: a.location ?? "",
      brand: a.brand ?? "",
      model: a.model ?? "",
      purchase_date: a.purchase_date ?? "",
      warranty_until: a.warranty_until ?? "",
      out_of_warranty: a.out_of_warranty ?? false,
      warranty_note: a.warranty_note ?? "",
      note: a.note ?? "",
    });
    setActiveUploadKind("photo");
    setPending({});
    setShowTaskForm(false);
    setTaskForm(emptyTaskForm);
    setEditingContactId(null);
    setWarrantyPeriod("");
    setWarrantyUnit("year");
    setModalMode("edit");
    setEditTab("basic");
    showModal();
  }

  // 新增聯絡資訊:開空白表單(editingContactId=0)
  function openNewContact() {
    setContactForm(emptyContactForm);
    clearPending("contactPrice");
    setEditingContactId(0);
  }

  // 編輯既有聯絡資訊:把該筆帶進表單
  function openEditContact(c: ApplianceContact) {
    setContactForm({
      category: (CONTACT_CATEGORIES as readonly string[]).includes(c.category)
        ? (c.category as ContactCategory)
        : "耗材連結",
      name: c.name ?? "",
      contact_person: c.contact_person ?? "",
      url: c.url ?? "",
      phone: c.phone ?? "",
      mobile: c.mobile ?? "",
      address: c.address ?? "",
      business_hours: c.business_hours ?? "",
      note: c.note ?? "",
      also_maintenance: c.also_maintenance ?? false,
    });
    clearPending("contactPrice");
    setEditingContactId(c.id);
  }

  // 儲存聯絡資訊(新增 POST / 編輯 PATCH 到 appliance_contacts)
  async function submitContactForm(e: React.FormEvent) {
    e.preventDefault();
    if (!modalApplianceId || editingContactId === null) return;
    const isUrl = contactForm.category === "耗材連結";
    const data = {
      appliance_id: modalApplianceId,
      category: contactForm.category,
      name: contactForm.name.trim() || null,
      contact_person: isUrl ? null : contactForm.contact_person.trim() || null,
      url: isUrl ? contactForm.url.trim() || null : null,
      phone: isUrl ? null : contactForm.phone.trim() || null,
      mobile: isUrl ? null : contactForm.mobile.trim() || null,
      address: isUrl ? null : contactForm.address.trim() || null,
      business_hours: isUrl ? null : contactForm.business_hours.trim() || null,
      note: contactForm.note.trim() || null,
      also_maintenance:
        contactForm.category === "購買店家" ? contactForm.also_maintenance : false,
    };
    try {
      const res =
        editingContactId === 0
          ? await fetch(API_CONTACTS, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            })
          : await fetch(`${API_CONTACTS}/${editingContactId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
      if (!res.ok) {
        const err = await res.json();
        alert("儲存失敗:" + JSON.stringify(err.detail));
        return;
      }
      // 取得這筆聯絡資訊的 id(新增時讀 POST 回傳),把暫存的價目表一起送出上傳
      const savedContactId =
        editingContactId === 0
          ? ((await res.json()) as ApplianceContact).id
          : editingContactId;
      const stagedPrice = (pending.contactPrice ?? []).map((p) => p.file);
      if (stagedPrice.length > 0) {
        await uploadContactFiles(savedContactId, stagedPrice); // 內部會 reload
        clearPending("contactPrice");
      } else {
        await loadAppliances();
      }
      setEditingContactId(null);
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    }
  }

  async function deleteContact(id: number) {
    if (!confirm("確定要刪除這筆聯絡資訊嗎?")) return;
    const res = await fetch(`${API_CONTACTS}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    await loadAppliances();
  }

  // 複製搜索關鍵字:廠牌 + 型號 + 耗材名稱,讓你貼到購物平台比價
  async function copySearchKeyword() {
    const a = appliances.find((x) => x.id === modalApplianceId);
    const keyword = [a?.brand, a?.model, contactForm.name.trim()]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!keyword) {
      alert("請先填家電廠牌/型號或耗材名稱");
      return;
    }
    try {
      await navigator.clipboard.writeText(keyword);
      alert(`已複製搜索關鍵字:\n${keyword}`);
    } catch {
      alert(`複製失敗,關鍵字是:\n${keyword}`);
    }
  }

  // 點擊掃描:用手機相機拍名片 → 送 Google Vision OCR → 自動填電話/地址
  function triggerScan() {
    scanFileRef.current?.click();
  }
  async function handleScanFile(file: File | undefined | null) {
    if (!file) return;
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(API_OCR, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert("掃描失敗:" + JSON.stringify(data.detail));
        return;
      }
      // 把辨識到的店家名稱/聯絡人/市話/行動電話/地址/濃縮備註自動填入。
      // 以名片辨識結果為主(覆蓋舊值);名片沒抓到的欄位才保留你原本填的。
      setContactForm((f) => ({
        ...f,
        name: data.name || f.name || "",
        contact_person: data.contact_person || f.contact_person || "",
        phone: data.phone || f.phone || "",
        mobile: data.mobile || f.mobile || "",
        address: data.address || f.address || "",
        note: data.note || f.note || "",
      }));
      if (!data.name && !data.phone && !data.mobile && !data.address) {
        alert(
          "辨識完成,但沒抓到明確的店家/電話/地址,請手動填寫(可參考備註)",
        );
      }
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    } finally {
      setScanning(false);
    }
  }

  // 保固期變動 → 用「購買日 + 保固期」算出保固到期日,自動填進表單
  function applyWarrantyPeriod(amountStr: string, unit: "year" | "month") {
    setWarrantyPeriod(amountStr);
    setWarrantyUnit(unit);
    const amount = parseInt(amountStr, 10);
    const purchase = normalizeDate(form.purchase_date);
    if (
      amountStr.trim() !== "" &&
      amount > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(purchase)
    ) {
      setForm((f) => ({
        ...f,
        purchase_date: purchase,
        warranty_until: addPeriodToDate(purchase, amount, unit),
      }));
    }
  }

  // ===== 家電表單送出 =====
  async function submitApplianceForm(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name.trim(),
      location: form.location.trim() || null,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      purchase_date: normalizeDate(form.purchase_date) || null,
      warranty_until: form.out_of_warranty
        ? null
        : normalizeDate(form.warranty_until) || null,
      out_of_warranty: form.out_of_warranty,
      warranty_note: form.warranty_note.trim() || null,
      note: form.note.trim() || null,
    };
    try {
      setUploading((u) => ({
        ...u,
        photo: true,
        manual: true,
        receipt: true,
        warranty_card: true,
      }));

      // 步驟 1:先儲存家電基本資料
      let applianceId = modalApplianceId;
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

      // 新增時取得返回的 id(整個物件留著,稍後切編輯模式直接用,避免讀到過時的 state)
      let createdAppliance: Appliance | null = null;
      if (!modalApplianceId) {
        createdAppliance = await res.json();
        applianceId = createdAppliance!.id;
      }

      // 步驟 2:把三個上傳區的暫存檔一次送出
      const allUploads = [
        ...(pending.photo ?? []).map((p) => ({ file: p.file, kind: "photo" as const })),
        ...(pending.manual ?? []).map((p) => ({ file: p.file, kind: "manual" as const })),
        ...(pending.receipt ?? []).map((p) => ({ file: p.file, kind: "receipt" as const })),
        ...(pending.warranty_card ?? []).map((p) => ({
          file: p.file,
          kind: "warranty_card" as const,
        })),
      ];

      for (const { file, kind } of allUploads) {
        const formData = new FormData();
        formData.append("appliance_id", String(applianceId));
        formData.append("kind", kind);
        formData.append("file", file);
        const uploadRes = await fetch(API_FILES, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes
            .json()
            .catch(() => ({ detail: "HTTP " + uploadRes.status }));
          alert("上傳失敗:" + JSON.stringify(err.detail));
          break;
        }
      }

      // 步驟 3:清空暫存、刷新、關閉
      clearPending("photo", "manual", "receipt", "warranty_card");

      await loadAppliances();

      // 不論新增或編輯,存完都關閉 modal 回到列表 —— 讓使用者看到卡片(含剛上傳的頭貼)確認成功
      closeModal();
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    } finally {
      setUploading((u) => ({
        ...u,
        photo: false,
        manual: false,
        receipt: false,
        warranty_card: false,
      }));
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

  // 從卡片直接刪除家電(連同任務 / 聯絡資訊 / Drive 上的所有上傳檔)
  async function deleteApplianceFromCard(a: Appliance) {
    const taskCount = tasksOf(a.id).length;
    const fileCount = (filesByAppliance[a.id] ?? []).length;
    const extras = [
      taskCount > 0 ? `${taskCount} 個保養/耗材任務` : null,
      fileCount > 0 ? `${fileCount} 個雲端檔案` : null,
    ].filter(Boolean);
    const msg =
      extras.length > 0
        ? `確定要刪除「${a.name}」?連同 ${extras.join(
            "、",
          )}一起刪掉,雲端硬碟上的檔案也會移除,無法復原。`
        : `確定要刪除「${a.name}」?無法復原。`;
    if (!confirm(msg)) return;
    const res = await fetch(`${API_APPLIANCES}/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    await loadAppliances();
  }

  // 刪除單一檔案(連同 Drive 上的實體檔)
  async function removeFile(id: number) {
    if (!confirm("確定要刪除這個檔案嗎?")) return;
    const res = await fetch(`${API_FILES}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    await loadAppliances();
  }

  // ===== 聯絡資訊檔案(價目表)上傳 / 刪除 =====
  // 綁在某筆已存的聯絡資訊(contactId)底下,可多檔;送到 /api/appliance-contact-files
  const uploadContactFiles = useCallback(
    async (
      contactId: number,
      files: FileList | File[] | null | undefined,
    ) => {
      const list = files ? Array.from(files) : [];
      if (list.length === 0) return;
      setContactUploading(true);
      try {
        for (const file of list) {
          const formData = new FormData();
          formData.append("contact_id", String(contactId));
          formData.append("kind", "pricelist");
          formData.append("file", file);
          const res = await fetch(API_CONTACT_FILES, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const err = await res
              .json()
              .catch(() => ({ detail: "HTTP " + res.status }));
            alert("上傳失敗:" + JSON.stringify(err.detail));
            break;
          }
        }
        await loadAppliances();
      } catch (e) {
        alert("網路錯誤:" + (e instanceof Error ? e.message : e));
      } finally {
        setContactUploading(false);
      }
    },
    [loadAppliances],
  );

  async function removeContactFile(id: number) {
    if (!confirm("確定要刪除這張價目表嗎?")) return;
    const res = await fetch(`${API_CONTACT_FILES}/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    await loadAppliances();
  }

  // ===== Ctrl+V 貼截圖 =====
  // 貼上的圖片丟到「目前作用中的上傳區」(activeUploadKind,滑鼠移到該區時設定);
  // 現在改成暫存到前端記憶體,不直接上傳
  useEffect(() => {
    if (!modalOpen || modalMode !== "edit") return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length === 0) return;
      e.preventDefault();
      // 丟到目前作用中的上傳區暫存(不上傳)
      addPending(activeUploadKind, imgs);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [modalOpen, modalMode, activeUploadKind]);

  // ===== Ctrl+V 貼圖到「價目表」上傳區 =====
  // 聯絡資訊表單開著時(新增 0 或編輯 >0)都可貼,一律丟進暫存待表單送出
  useEffect(() => {
    if (editingContactId === null) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length === 0) return;
      e.preventDefault();
      addPending("contactPrice", imgs);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [editingContactId]);

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
      last_done_date: normalizeDate(taskForm.last_done_date) || null,
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

  // 現有家電出現過的所有區域(location),去重後給篩選列用
  const locationOptions = Array.from(
    new Set(
      appliances
        .map((a) => (a.location ?? "").trim())
        .filter((l) => l !== ""),
    ),
  );

  // ===== 篩選 + 排序 =====
  let filtered = appliances;
  if (filter === "overdue")
    filtered = appliances.filter((a) => hasOverdueTask(tasksOf(a.id)));
  if (filter === "warranty") filtered = appliances.filter(isInWarranty);
  // 再依區域篩(跟上面的狀態篩選疊加)
  if (locationFilter !== "all")
    filtered = filtered.filter(
      (a) => (a.location ?? "").trim() === locationFilter,
    );
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

  // 任務檢視要顯示的家電本體(標題、保固徽章都從這拿)
  const modalAppliance =
    appliances.find((x) => x.id === modalApplianceId) ?? null;
  // 這台家電的聯絡資訊清單
  const modalContacts =
    modalApplianceId === null
      ? []
      : contactsByAppliance[modalApplianceId] ?? [];

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
        <div className="max-w-md mx-auto px-4 pb-2 flex gap-2">
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

        {/* 第二排:依區域篩選(選項由現有家電的位置自動產生)
            用上方分隔線 + 「區域」標籤,跟狀態篩選明顯分成兩類
            改用下拉式選單(原生 select),區域多的時候比一整排 chips 省空間 */}
        {locationOptions.length > 0 && (
          <div className="max-w-md mx-auto px-4 pt-2 pb-3 mt-1 border-t border-slate-200 flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">區域</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部區域</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  📍 {loc}
                </option>
              ))}
            </select>
          </div>
        )}
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
                photoUrl={filesOf(a.id, "photo")[0]?.url ?? null}
                onOpenTasks={() => openTasksModal(a)}
                onEdit={() => openEditModal(a)}
                onDelete={() => deleteApplianceFromCard(a)}
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
              {modalMode === "edit" ? (
                <>
              <h2 className="text-lg font-bold mb-4">
                {modalApplianceId ? "編輯家電" : "新增家電"}
              </h2>

              {/* 兩頁籤:基本資料 / 保固資料 */}
              <div className="flex gap-2 mb-4">
                {(
                  [
                    ["basic", "基本資料"],
                    ["warranty", "保固資料"],
                  ] as ["basic" | "warranty", string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEditTab(key)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                      editTab === key
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={submitApplianceForm} className="space-y-3">
                {editTab === "basic" && (
                  <>
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

                {/* 照片上傳(可多張,第一張為主頁卡片頭貼)*/}
                <MultiUpload
                  label="家電照片(第一張為主頁卡片頭貼)"
                  accept="image/*"
                  files={filesOf(modalApplianceId, "photo")}
                  pending={pending.photo ?? []}
                  uploading={uploading.photo}
                  onActivate={() => setActiveUploadKind("photo")}
                  onAddFiles={(files) => addPending("photo", files)}
                  onRemovePending={(idx) => removePending("photo", idx)}
                  onDelete={removeFile}
                />

                {/* 說明書上傳(可多張)*/}
                <MultiUpload
                  label="說明書(PDF 或圖片)"
                  accept=".pdf,image/*"
                  files={filesOf(modalApplianceId, "manual")}
                  pending={pending.manual ?? []}
                  uploading={uploading.manual}
                  onActivate={() => setActiveUploadKind("manual")}
                  onAddFiles={(files) => addPending("manual", files)}
                  onRemovePending={(idx) => removePending("manual", idx)}
                  onDelete={removeFile}
                />

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
                  </>
                )}

                {editTab === "warranty" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        購買日
                      </label>
                      <DateField
                        value={form.purchase_date}
                        onChange={(v) => setForm({ ...form, purchase_date: v })}
                      />
                    </div>

                    <label className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={form.out_of_warranty}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            out_of_warranty: e.target.checked,
                          })
                        }
                        className="w-4 h-4"
                      />
                      <span className="text-sm">
                        已過保固(不追蹤保固到期日)
                      </span>
                    </label>

                    {!form.out_of_warranty && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            保固期(填了自動換算到期日)
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={warrantyPeriod}
                              onChange={(e) =>
                                applyWarrantyPeriod(e.target.value, warrantyUnit)
                              }
                              className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="例:1"
                            />
                            <select
                              value={warrantyUnit}
                              onChange={(e) =>
                                applyWarrantyPeriod(
                                  warrantyPeriod,
                                  e.target.value as "year" | "month",
                                )
                              }
                              className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="year">年</option>
                              <option value="month">月</option>
                            </select>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            填購買日 + 保固期,下面到期日自動算好;也可直接打到期日
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">
                            保固到期日
                          </label>
                          <DateField
                            value={form.warranty_until}
                            onChange={(v) =>
                              setForm({ ...form, warranty_until: v })
                            }
                          />
                        </div>
                      </>
                    )}

                    {/* 收據上傳(可多張,保固求償用,過保與否都可留存)*/}
                    <MultiUpload
                      label="購買收據"
                      accept="image/*,.pdf"
                      files={filesOf(modalApplianceId, "receipt")}
                      pending={pending.receipt ?? []}
                      uploading={uploading.receipt}
                      onActivate={() => setActiveUploadKind("receipt")}
                      onAddFiles={(files) => addPending("receipt", files)}
                      onRemovePending={(idx) => removePending("receipt", idx)}
                      onDelete={removeFile}
                    />

                    {/* 保固卡上傳(跟收據分開,雲端命名為「保固卡」)*/}
                    <MultiUpload
                      label="保固卡"
                      accept="image/*,.pdf"
                      files={filesOf(modalApplianceId, "warranty_card")}
                      pending={pending.warranty_card ?? []}
                      uploading={uploading.warranty_card}
                      onActivate={() => setActiveUploadKind("warranty_card")}
                      onAddFiles={(files) => addPending("warranty_card", files)}
                      onRemovePending={(idx) =>
                        removePending("warranty_card", idx)
                      }
                      onDelete={removeFile}
                    />

                    {/* 保固備註(跟基本資料的備註分開)*/}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        保固備註
                      </label>
                      <textarea
                        rows={2}
                        maxLength={200}
                        value={form.warranty_note}
                        onChange={(e) =>
                          setForm({ ...form, warranty_note: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="保固範圍、延長保固、維修紀錄…"
                      />
                    </div>
                  </>
                )}

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
                </>
              ) : (
                <>
                  {/* 任務檢視:家電名稱 + ✎ 編輯捷徑 */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="text-lg font-bold">
                      {modalAppliance?.name}
                    </h2>
                    {modalAppliance && (
                      <button
                        type="button"
                        onClick={() => openEditModal(modalAppliance)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ✎ 編輯家電
                      </button>
                    )}
                  </div>
                  {modalAppliance &&
                    [
                      modalAppliance.brand,
                      modalAppliance.model,
                      modalAppliance.location,
                    ]
                      .filter(Boolean)
                      .join(" · ") && (
                      <p className="text-xs text-slate-500 mb-4">
                        {[
                          modalAppliance.brand,
                          modalAppliance.model,
                          modalAppliance.location,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}

                  {/* 兩頁籤:保養/耗材任務 | 聯絡資訊 */}
                  <div className="flex gap-2 mb-4">
                    {(
                      [
                        ["tasks", "保養 / 耗材任務"],
                        ["contacts", "聯絡資訊"],
                      ] as ["tasks" | "contacts", string][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTasksTab(key)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                          tasksTab === key
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* === 聯絡資訊頁籤 === */}
                  {tasksTab === "contacts" && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold">
                          聯絡資訊{" "}
                          <span className="text-slate-500 font-normal text-sm">
                            {modalContacts.length > 0
                              ? `(${modalContacts.length})`
                              : ""}
                          </span>
                        </h3>
                        {editingContactId === null && (
                          <button
                            type="button"
                            onClick={openNewContact}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            + 新增
                          </button>
                        )}
                      </div>

                      {editingContactId !== null ? (
                        <form
                          onSubmit={submitContactForm}
                          className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2"
                        >
                          {/* 類別 */}
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              類別
                            </label>
                            <select
                              value={contactForm.category}
                              onChange={(e) =>
                                setContactForm({
                                  ...contactForm,
                                  category: e.target.value as ContactCategory,
                                })
                              }
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {CONTACT_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>

                          {contactForm.category === "耗材連結" ? (
                            <>
                              <input
                                maxLength={50}
                                value={contactForm.name}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    name: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="耗材名稱(例:濾網、集塵袋)"
                              />
                              <input
                                maxLength={500}
                                inputMode="url"
                                value={contactForm.url}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    url: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="貼上購買連結"
                              />
                              <button
                                type="button"
                                onClick={copySearchKeyword}
                                className="w-full bg-white border border-slate-300 hover:bg-slate-50 rounded-lg py-2 text-sm text-slate-700"
                              >
                                🔍 複製搜索關鍵字(到購物平台比價)
                              </button>
                            </>
                          ) : (
                            <>
                              <input
                                maxLength={50}
                                value={contactForm.name}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    name: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="店家名稱"
                              />
                              <input
                                maxLength={30}
                                value={contactForm.contact_person}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    contact_person: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="聯絡人(店家窗口)"
                              />
                              <input
                                maxLength={30}
                                inputMode="tel"
                                value={contactForm.phone}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    phone: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="電話(市話)"
                              />
                              <input
                                maxLength={30}
                                inputMode="tel"
                                value={contactForm.mobile}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    mobile: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="行動電話"
                              />
                              <input
                                maxLength={100}
                                value={contactForm.address}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    address: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="店家地址"
                              />
                              <input
                                maxLength={100}
                                value={contactForm.business_hours}
                                onChange={(e) =>
                                  setContactForm({
                                    ...contactForm,
                                    business_hours: e.target.value,
                                  })
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="營業時間(例:週一~五 09:00-18:00)"
                              />
                              {contactForm.category === "購買店家" && (
                                <label className="flex items-center gap-2 py-1">
                                  <input
                                    type="checkbox"
                                    checked={contactForm.also_maintenance}
                                    onChange={(e) =>
                                      setContactForm({
                                        ...contactForm,
                                        also_maintenance: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4"
                                  />
                                  <span className="text-sm">同為保養店家</span>
                                </label>
                              )}
                              <button
                                type="button"
                                onClick={triggerScan}
                                disabled={scanning}
                                className="w-full bg-white border border-slate-300 hover:bg-slate-50 rounded-lg py-2 text-sm text-slate-700 disabled:opacity-50"
                              >
                                {scanning ? "辨識中…" : "📷 掃描名片自動填寫"}
                              </button>
                              <input
                                ref={scanFileRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) =>
                                  handleScanFile(e.target.files?.[0])
                                }
                              />

                              {/* 價目表上傳區:新增 / 編輯都可,暫存待表單「儲存」時一起送出 */}
                              <MultiUpload
                                label="價目表"
                                accept="image/*,application/pdf"
                                files={
                                  editingContactId && editingContactId > 0
                                    ? contactFilesByContact[editingContactId] ??
                                      []
                                    : []
                                }
                                pending={pending.contactPrice ?? []}
                                uploading={contactUploading}
                                onActivate={() => {}}
                                onAddFiles={(files) =>
                                  addPending("contactPrice", files)
                                }
                                onRemovePending={(idx) =>
                                  removePending("contactPrice", idx)
                                }
                                onDelete={removeContactFile}
                              />
                            </>
                          )}

                          <textarea
                            rows={4}
                            maxLength={500}
                            value={contactForm.note}
                            onChange={(e) =>
                              setContactForm({
                                ...contactForm,
                                note: e.target.value,
                              })
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y whitespace-pre-wrap"
                            placeholder="備註(職稱、Email、營業項目…可多行)"
                          />

                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingContactId(null)}
                              className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg py-2 text-sm"
                            >
                              取消
                            </button>
                            <button
                              type="submit"
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium"
                            >
                              儲存
                            </button>
                          </div>
                        </form>
                      ) : modalContacts.length === 0 ? (
                        <div className="text-center text-slate-400 py-4 text-sm">
                          還沒聯絡資訊,點上方「+ 新增」
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {modalContacts.map((c) => (
                            <ContactRow
                              key={c.id}
                              c={c}
                              priceFiles={contactFilesByContact[c.id] ?? []}
                              onEdit={() => openEditContact(c)}
                              onDelete={() => deleteContact(c.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* === 保養/耗材任務頁籤 === */}
                  {tasksTab === "tasks" && (
                  <div>
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
                      <DateField
                        value={taskForm.last_done_date}
                        placeholder="上次完成日(空=未做過)"
                        onChange={(v) =>
                          setTaskForm({ ...taskForm, last_done_date: v })
                        }
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

                  {/* 說明書區:任務頁籤下方常駐顯示,直接連到已上傳的說明書檔
                      (唯讀;要新增 / 刪除說明書到「✎ 編輯家電」的基本資料頁籤) */}
                  {filesOf(modalApplianceId, "manual").length > 0 && (
                    <div className="mt-6 pt-4 border-t border-slate-200">
                      <h3 className="font-bold mb-2">
                        📖 說明書{" "}
                        <span className="text-slate-500 font-normal text-sm">
                          ({filesOf(modalApplianceId, "manual").length})
                        </span>
                      </h3>
                      <div className="space-y-2">
                        {filesOf(modalApplianceId, "manual").map((f, idx, arr) => {
                          const isPdf = (f.name ?? "")
                            .toLowerCase()
                            .endsWith(".pdf");
                          // 連結文字用友善標籤(多份才編號),原始雲端檔名移到 hover 提示
                          const label =
                            arr.length > 1 ? `說明書 ${idx + 1}` : "說明書";
                          return (
                            <a
                              key={f.id}
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={f.name ?? "說明書"}
                              className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3 hover:bg-slate-50 active:scale-[0.98] transition"
                            >
                              <span className="text-2xl shrink-0">
                                {isPdf ? "📄" : "🖼"}
                              </span>
                              <span className="flex-1 min-w-0 text-sm text-blue-600 truncate">
                                {label}
                              </span>
                              <span className="text-slate-300 shrink-0">›</span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                  )}
                </>
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
  photoUrl,
  onOpenTasks,
  onEdit,
  onDelete,
}: {
  a: Appliance;
  tasks: ApplianceTask[];
  photoUrl: string | null;
  onOpenTasks: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
  if (a.out_of_warranty) {
    // 手動標已過保 → 直接顯示,不看日期
    warrantyBadge = { color: "bg-slate-100 text-slate-500", text: "已過保固" };
  } else if (wDays !== null) {
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
  const photoId = extractDriveFileId(photoUrl);

  return (
    <div
      onClick={onOpenTasks}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenTasks();
      }}
      className="w-full text-left bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-slate-400 hover:text-blue-600 text-sm"
              title="編輯家電"
            >
              ✎
            </button>
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
        <div className="flex flex-col items-center justify-between self-stretch shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-slate-300 hover:text-red-600 p-1 -mr-1 -mt-1"
            title="刪除這台家電(連同雲端檔案)"
          >
            🗑
          </button>
          <span className="text-slate-300 text-xl">›</span>
        </div>
      </div>
    </div>
  );
}

// 一筆聯絡資訊的顯示卡(依類別顯示不同欄位)
function ContactRow({
  c,
  priceFiles,
  onEdit,
  onDelete,
}: {
  c: ApplianceContact;
  priceFiles: ApplianceContactFile[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isUrl = c.category === "耗材連結";
  // 類別色票
  const catColor =
    c.category === "耗材連結"
      ? "bg-blue-100 text-blue-700"
      : c.category === "保養資訊"
        ? "bg-green-100 text-green-700"
        : "bg-purple-100 text-purple-700";

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full ${catColor}`}>
          {c.category}
        </span>
        {c.name && <span className="font-medium">{c.name}</span>}
        {!isUrl && c.contact_person && (
          <span className="text-sm text-slate-500">👤 {c.contact_person}</span>
        )}
        {c.also_maintenance && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            同為保養店家
          </span>
        )}
      </div>
      <div className="space-y-0.5 text-sm">
        {isUrl && c.url && (
          <p>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline break-all"
            >
              🔗 {c.url}
            </a>
          </p>
        )}
        {!isUrl && c.phone && (
          <p>
            <a
              href={`tel:${c.phone}`}
              className="text-blue-600 hover:underline"
            >
              ☎️ {c.phone}
            </a>
          </p>
        )}
        {!isUrl && c.mobile && (
          <p>
            <a
              href={`tel:${c.mobile}`}
              className="text-blue-600 hover:underline"
            >
              📱 {c.mobile}
            </a>
          </p>
        )}
        {!isUrl && c.address && (
          <p className="text-slate-600">📍 {c.address}</p>
        )}
        {!isUrl && c.business_hours && (
          <p className="text-slate-600">🕐 {c.business_hours}</p>
        )}
        {c.note && (
          <p className="text-slate-400 whitespace-pre-wrap break-words">
            {c.note}
          </p>
        )}
        {priceFiles.length > 0 && (
          <div className="pt-1">
            <p className="text-xs text-slate-400 mb-1">📋 價目表</p>
            <div className="flex flex-wrap gap-2">
              {priceFiles.map((f) => {
                const fileId = extractDriveFileId(f.url);
                const isPdf = (f.name ?? "").toLowerCase().endsWith(".pdf");
                return (
                  <a
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={f.name ?? "檢視價目表"}
                    className="block w-16 h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200"
                  >
                    {!isPdf && fileId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://drive.google.com/thumbnail?id=${fileId}&sz=w160`}
                        className="w-full h-full object-cover"
                        alt=""
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">
                        📄
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          onClick={onEdit}
          className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg py-2 text-sm"
        >
          編輯
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
    t.last_done_date ? `上次:${formatDateWithWeekday(t.last_done_date)}` : null,
    t.next_due_date ? `下次:${formatDateWithWeekday(t.next_due_date)}` : null,
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

// 共用的多檔上傳區(所有 Drive 上傳區都套這個,見 CLAUDE.md「上傳區標準」):
//   · 縮圖列表(可多張),每張可檢視 / 刪除
//   · 選檔複選 + Ctrl+V 貼上(貼上由父層 activeUploadKind 決定丟到哪區)
//   · 暫存狀態由「父層」保管(pending),切頁籤 / 切家電 / 切店家都不會掉;
//     送出時父層直接讀 pending 一次上傳。本元件是純受控顯示,不自己管狀態。
//   · 格式統一,各板塊重用
type PendingFile = { file: File; preview: string };

function MultiUpload({
  label,
  accept,
  files,
  pending,
  uploading,
  onActivate,
  onAddFiles,
  onRemovePending,
  onDelete,
}: {
  label: string;
  accept: string;
  files: { id: number; url: string; name: string | null }[];
  pending: PendingFile[];
  uploading: boolean;
  onActivate: () => void;
  onAddFiles: (fileList: FileList | File[]) => void;
  onRemovePending: (idx: number) => void;
  onDelete: (id: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
      <div onMouseEnter={onActivate} onFocusCapture={onActivate}>
        <label className="block text-sm font-medium mb-1">
          {label}
          <span className="text-xs font-normal text-slate-400">
            {" "}
            · 可多張 · Ctrl+V 貼上
          </span>
        </label>
        <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-lg">
          {/* 已上傳的檔案(從 Supabase 讀來) */}
          {files.map((f) => {
            const fileId = extractDriveFileId(f.url);
            const isPdf = (f.name ?? "").toLowerCase().endsWith(".pdf");
            return (
              <div key={f.id} className="relative">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={f.name ?? "檢視"}
                  className="block w-20 h-20 rounded-lg overflow-hidden bg-slate-100 border border-slate-200"
                >
                  {!isPdf && fileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://drive.google.com/thumbnail?id=${fileId}&sz=w160`}
                      className="w-full h-full object-cover"
                      alt=""
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">
                      📄
                    </div>
                  )}
                </a>
                <button
                  type="button"
                  onClick={() => onDelete(f.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs leading-none flex items-center justify-center shadow"
                  title="刪除"
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* 本地暫存的待上傳檔案(虛線框) */}
          {pending.map((p, idx) => {
            const isPdf = p.file.type === "application/pdf";
            return (
              <div key={`pending-${idx}`} className="relative">
                <div className="block w-20 h-20 rounded-lg overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300">
                  {!isPdf && p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.preview}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">
                      {isPdf ? "📄" : "🖼"}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemovePending(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs leading-none flex items-center justify-center shadow"
                  title="移除"
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* 「再加一張」虛線格 */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-400 hover:text-blue-600 flex flex-col items-center justify-center transition disabled:opacity-50"
          >
            <span className="text-xl">＋</span>
            <span className="text-[10px] mt-0.5">
              {uploading ? "上傳中…" : files.length + pending.length ? "加一張" : "選檔上傳"}
            </span>
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length) onAddFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
  );
}

