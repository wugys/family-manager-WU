// 主頁的板塊清單(對應原本 static/index.html 的 MODULES 物件)
// status: 'active' = 可點;'planned' = 規劃中(灰色,點了跳提示)
// 之後每完成一個板塊,把 status 改成 'active' 並填 href 即可。

export type ModuleStatus = "active" | "planned";

export interface ModuleItem {
  name: string;
  icon: string;
  desc: string;
  status: ModuleStatus;
  href?: string;
}

export interface ModuleCategory {
  key: string;
  label: string;
  emoji: string;
  items: ModuleItem[];
}

export const MODULE_CATEGORIES: ModuleCategory[] = [
  {
    key: "money",
    label: "金錢",
    emoji: "💰",
    items: [
      { name: "帳單管理", icon: "🧾", desc: "固定支出、繳費提醒", status: "active", href: "/bills" },
      { name: "家庭支出", icon: "💸", desc: "日常開銷分類記帳", status: "planned" },
      { name: "信用卡", icon: "💳", desc: "紅利、繳款日", status: "planned" },
    ],
  },
  {
    key: "chores",
    label: "家事",
    emoji: "🧹",
    items: [
      { name: "待辦事項", icon: "✅", desc: "誰要做什麼、何時前", status: "planned" },
      { name: "採購清單", icon: "🛒", desc: "逛超市勾掉", status: "active", href: "/shopping" },
      { name: "日用品存量", icon: "📦", desc: "剩多少、低就提醒", status: "planned" },
      { name: "家事分配", icon: "🧽", desc: "7 人輪值表", status: "planned" },
    ],
  },
  {
    key: "calendar",
    label: "行事曆",
    emoji: "📅",
    items: [
      { name: "家庭活動", icon: "🎉", desc: "聚餐、出遊", status: "planned" },
      { name: "接送排程", icon: "🚸", desc: "誰接誰下課", status: "planned" },
      { name: "生日紀念日", icon: "🎂", desc: "提前 N 天提醒", status: "planned" },
    ],
  },
  {
    key: "info",
    label: "資訊",
    emoji: "📂",
    items: [
      { name: "公佈欄", icon: "📢", desc: "停水、聚會公告", status: "planned" },
      { name: "家人通訊錄", icon: "📞", desc: "電話、生日、緊急聯絡", status: "active", href: "/contacts" },
      { name: "車輛紀錄", icon: "🚗", desc: "保養、驗車、加油", status: "planned" },
      { name: "家電管理", icon: "🔌", desc: "保養、耗材、保固", status: "active", href: "/appliances" },
      { name: "借用紀錄", icon: "🔑", desc: "誰借走什麼", status: "planned" },
      { name: "醫療紀錄", icon: "🏥", desc: "預防接種、用藥史", status: "planned" },
      { name: "照片回憶", icon: "📸", desc: "家人上傳分享", status: "planned" },
    ],
  },
];
