"use client";

// 家人通訊錄頁(對應原本 static/contacts.html)
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Contact } from "@/lib/contacts";
import { DateField } from "@/components/DateField";
import { normalizeDate } from "@/lib/dates";

const API = "/api/contacts";

// 6 種頭像漸層配色(按 id 取餘數選)
const AVATAR_COLORS = [
  "bg-gradient-to-br from-blue-400 to-blue-600",
  "bg-gradient-to-br from-pink-400 to-pink-600",
  "bg-gradient-to-br from-emerald-400 to-emerald-600",
  "bg-gradient-to-br from-amber-400 to-amber-600",
  "bg-gradient-to-br from-violet-400 to-violet-600",
  "bg-gradient-to-br from-rose-400 to-rose-600",
];

const ROLE_OPTIONS = [
  "父親",
  "母親",
  "長子",
  "長女",
  "次子",
  "次女",
  "三子",
  "三女",
  "其他",
];

const inputCls =
  "w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

// 算生日距今的天數,給卡片顯示
function getBirthdayInfo(birthday: string): { text: string; urgent: boolean } {
  const [, mm, dd] = birthday.split("-").map((s) => parseInt(s, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), mm - 1, dd);
  if (next < today) next = new Date(today.getFullYear() + 1, mm - 1, dd);
  const days = Math.round((next.getTime() - today.getTime()) / 86400000);
  const dateText = `${mm} 月 ${dd} 日`;
  if (days === 0) return { text: "今天生日!", urgent: true };
  if (days === 1) return { text: `明天生日 · ${dateText}`, urgent: true };
  if (days <= 14) return { text: `${days} 天後 · ${dateText}`, urgent: true };
  return { text: dateText, urgent: false };
}

// 表單欄位的初始空值
type FormState = {
  id: number | null;
  name: string;
  nickname: string;
  role: string;
  birthday: string;
  blood_type: string;
  phone: string;
  line_id: string;
  email: string;
  address: string;
  work_address: string;
};

const emptyForm: FormState = {
  id: null,
  name: "",
  nickname: "",
  role: "",
  birthday: "",
  blood_type: "",
  phone: "",
  line_id: "",
  email: "",
  address: "",
  work_address: "",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function loadContacts() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("HTTP " + res.status);
      setContacts(await res.json());
    } catch (e) {
      alert("載入家人通訊錄失敗:" + (e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  function openAddModal() {
    setForm(emptyForm);
    showModal();
  }

  function openEditModal(c: Contact) {
    setForm({
      id: c.id,
      name: c.name,
      nickname: c.nickname ?? "",
      role: c.role ?? "",
      birthday: c.birthday ?? "",
      blood_type: c.blood_type ?? "",
      phone: c.phone ?? "",
      line_id: c.line_id ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      work_address: c.work_address ?? "",
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

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();

    const birthdayRaw = form.birthday.trim();
    const birthday = normalizeDate(birthdayRaw);
    if (birthdayRaw && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      alert("生日格式不對,請用「1985-05-15」之類的格式,或點 📅 從日曆選");
      return;
    }

    const data = {
      name: form.name.trim(),
      nickname: form.nickname.trim() || null,
      role: form.role.trim() || null,
      birthday: birthday || null,
      blood_type: form.blood_type || null,
      phone: form.phone.trim() || null,
      line_id: form.line_id.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      work_address: form.work_address.trim() || null,
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
      await loadContacts();
    } catch (e) {
      alert("網路錯誤:" + (e instanceof Error ? e.message : e));
    }
  }

  async function deleteContact() {
    if (!form.id) return;
    const name = form.nickname || form.name || "這位家人";
    if (!confirm(`確定要刪除「${name}」嗎?無法復原。`)) return;
    const res = await fetch(`${API}/${form.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("刪除失敗");
      return;
    }
    closeModal();
    await loadContacts();
  }

  // 套用搜尋
  const q = search.trim().toLowerCase();
  const filtered = q
    ? contacts.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.nickname?.toLowerCase().includes(q) ||
          c.role?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.line_id?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q),
      )
    : contacts;

  return (
    <>
      {/* 頂部固定列 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-900 text-sm"
          >
            ← 主頁
          </Link>
          <h1 className="text-lg font-bold flex-1">家人通訊錄</h1>
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            + 新增
          </button>
        </div>
        <div className="max-w-md mx-auto px-4 pb-3">
          <input
            type="search"
            placeholder="搜尋姓名、暱稱、電話…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </header>

      {/* 列表區 */}
      <main className="max-w-md mx-auto px-4 py-4 pb-24">
        {loading ? (
          <div className="text-center text-slate-400 py-16">
            <p className="text-sm">載入中…</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center text-slate-500 py-16">
            <p className="text-base">這裡還沒有家人通訊錄</p>
            <p className="text-sm mt-1 text-slate-400">點右上「+ 新增」開始</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-500 py-16">
            <p className="text-base">找不到符合的家人</p>
            <p className="text-sm mt-1 text-slate-400">換個關鍵字試試</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
              <ContactCard key={c.id} c={c} onEdit={() => openEditModal(c)} />
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
            className={`modal-slide fixed inset-x-0 bottom-0 z-30 bg-white rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto${
              modalVisible ? " open" : ""
            }`}
          >
            <div className="max-w-md mx-auto p-5">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold mb-4">
                {form.id ? "編輯家人" : "新增家人"}
              </h2>

              <form onSubmit={submitForm} className="space-y-4">
                {/* 區段:基本資料 */}
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    基本資料
                  </h3>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      姓名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      maxLength={30}
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      className={inputCls}
                      placeholder="例:王大明"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        家中稱呼
                      </label>
                      <input
                        maxLength={20}
                        value={form.nickname}
                        onChange={(e) =>
                          setForm({ ...form, nickname: e.target.value })
                        }
                        className={inputCls}
                        placeholder="爸爸、小妤…"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        家庭角色
                      </label>
                      <input
                        list="role-options"
                        maxLength={20}
                        value={form.role}
                        onChange={(e) =>
                          setForm({ ...form, role: e.target.value })
                        }
                        className={inputCls}
                        placeholder="父親、長子…"
                      />
                      <datalist id="role-options">
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        生日
                      </label>
                      <DateField
                        value={form.birthday}
                        placeholder="1985-05-15"
                        onChange={(v) => setForm({ ...form, birthday: v })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        血型
                      </label>
                      <select
                        value={form.blood_type}
                        onChange={(e) =>
                          setForm({ ...form, blood_type: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value=""></option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="O">O</option>
                        <option value="AB">AB</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* 區段:聯絡方式 */}
                <section className="space-y-3 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    聯絡方式
                  </h3>

                  <div>
                    <label className="block text-sm font-medium mb-1">電話</label>
                    <input
                      type="tel"
                      maxLength={30}
                      inputMode="tel"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      className={inputCls}
                      placeholder="0912-345-678"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      LINE ID
                    </label>
                    <input
                      maxLength={40}
                      value={form.line_id}
                      onChange={(e) =>
                        setForm({ ...form, line_id: e.target.value })
                      }
                      className={inputCls}
                      placeholder="kevin.wu"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      maxLength={60}
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      className={inputCls}
                      placeholder="kevin@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">住址</label>
                    <input
                      maxLength={100}
                      value={form.address}
                      onChange={(e) =>
                        setForm({ ...form, address: e.target.value })
                      }
                      className={inputCls}
                      placeholder="台北市…"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      工作地址
                    </label>
                    <input
                      maxLength={100}
                      value={form.work_address}
                      onChange={(e) =>
                        setForm({ ...form, work_address: e.target.value })
                      }
                      className={inputCls}
                      placeholder="公司、學校…"
                    />
                  </div>
                </section>

                <div className="flex gap-2 pt-3">
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

                {form.id && (
                  <button
                    type="button"
                    onClick={deleteContact}
                    className="w-full text-red-600 py-3 text-sm"
                  >
                    刪除這位家人
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

function ContactCard({ c, onEdit }: { c: Contact; onEdit: () => void }) {
  const initial = (c.nickname || c.name || "?").charAt(0);
  const colorClass = AVATAR_COLORS[c.id % AVATAR_COLORS.length];

  const birthdayInfo = c.birthday ? getBirthdayInfo(c.birthday) : null;
  const nicknameShown = c.nickname && c.nickname !== c.name ? c.nickname : null;

  const details: { icon: string; text: string }[] = [];
  if (c.phone) details.push({ icon: "📱", text: c.phone });
  if (c.email) details.push({ icon: "✉️", text: c.email });
  if (c.address) details.push({ icon: "🏠", text: c.address });
  if (c.work_address) details.push({ icon: "🏢", text: c.work_address });
  if (c.blood_type) details.push({ icon: "🩸", text: `${c.blood_type} 型` });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <div
          className={`${colorClass} text-white w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shrink-0`}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{c.name}</h3>
            {nicknameShown && (
              <span className="text-sm text-slate-500">({nicknameShown})</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {c.role && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {c.role}
              </span>
            )}
            {birthdayInfo && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  birthdayInfo.urgent
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                🎂 {birthdayInfo.text}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onEdit}
          className="text-slate-400 hover:text-slate-700 active:scale-95 p-1 shrink-0"
        >
          <span className="text-sm">編輯</span>
        </button>
      </div>

      {details.length > 0 && (
        <div className="mt-3 space-y-0.5">
          {details.map((d, i) => (
            <p key={i} className="text-xs text-slate-500">
              {d.icon} {d.text}
            </p>
          ))}
        </div>
      )}

      {(c.phone || c.line_id || c.email) && (
        <div className="flex gap-2 mt-3">
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg py-2 text-sm text-center font-medium"
            >
              📞 撥打
            </a>
          )}
          {c.line_id && (
            <a
              href={`https://line.me/ti/p/~${encodeURIComponent(c.line_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg py-2 text-sm text-center font-medium"
            >
              💬 LINE
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="flex-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg py-2 text-sm text-center font-medium"
            >
              ✉️ Email
            </a>
          )}
        </div>
      )}
    </div>
  );
}
