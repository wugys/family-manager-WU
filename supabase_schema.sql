-- ============================================================
-- family-manager Supabase 建表 SQL
-- ============================================================
-- 用法:
--   1. 開 Supabase 後台 → 左側 SQL Editor
--   2. 點「+ New query」開一個新查詢
--   3. 把整份檔案內容貼進去
--   4. 點右下「RUN」執行
--   5. 看到「Success. No rows returned」就成功
--   6. 進左側 Table Editor 應該能看到 bills、shopping_items、appliances、appliance_tasks、contacts 五張表
--
-- 注意:
--   - create table if not exists:重複跑不會出錯
--   - 改 schema(加欄位、改型別)要寫額外的 alter table,不能改這份重跑
-- ============================================================


-- ===== 帳單(bills)=====
create table if not exists bills (
  id              bigint generated always as identity primary key,
  name            text        not null,
  category        text,
  amount          numeric     not null,
  cycle           text        not null,
  cycle_days      integer,
  next_due_date   date        not null,
  payer           text,
  is_paid         boolean     not null default false,
  last_paid_date  date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 開啟 Row Level Security(RLS)
-- 啟用後預設「拒絕所有存取」,只有 service_role key 能繞過。
-- 我們後端用 service_role 從 .env 打,所以照常能用;
-- 之後做家人登入(用 anon key 從前端打)時再寫 policy 開放讀寫權限。
alter table bills enable row level security;


-- ===== 採購清單(shopping_items)=====
create table if not exists shopping_items (
  id          bigint generated always as identity primary key,
  name        text        not null,
  quantity    text,
  category    text,
  note        text,
  is_bought   boolean     not null default false,
  bought_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table shopping_items enable row level security;


-- ===== 家電(appliances)=====
-- 家電本體的基本資料:廠牌、型號、保固、說明書連結等。
create table if not exists appliances (
  id              bigint generated always as identity primary key,
  name            text        not null,                        -- 家電名稱(例:客廳冷氣)
  brand           text,                                        -- 廠牌(例:大金)
  model           text,                                        -- 型號(例:RXM50RVLT)
  location        text,                                        -- 擺放位置(例:客廳)
  purchase_date   date,                                        -- 購買日
  warranty_until  date,                                        -- 保固到期日
  manual_url      text,                                        -- 說明書連結(MVP 階段先存 Google Drive URL)
  photo_url       text,                                        -- 照片連結(同上)
  note            text,                                        -- 備註(序號、購買通路等)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table appliances enable row level security;


-- ===== 家電任務(appliance_tasks)=====
-- 每台家電可以有多個「保養 / 耗材更換 / 清潔」任務,各自有自己的週期和日期。
-- 例如「客廳冷氣」可以有「清洗濾網(30 天)」「機體保養(365 天)」「補冷媒(視情況)」三個任務。
--
-- 外鍵 references appliances(id) on delete cascade:
--   刪除家電時,該家電底下的所有任務一起被刪掉(避免孤兒紀錄)。
create table if not exists appliance_tasks (
  id              bigint generated always as identity primary key,
  appliance_id    bigint      not null references appliances(id) on delete cascade,  -- 所屬家電
  name            text        not null,                        -- 任務名(例:清洗濾網)
  task_type       text,                                        -- 任務類型(例:清潔、保養、耗材更換)
  cycle_days      integer,                                     -- 週期幾天(null = 不定期,只記上次)
  last_done_date  date,                                        -- 上次完成日
  next_due_date   date,                                        -- 下次該做日(=last + cycle,標已完成時自動算)
  note            text,                                        -- 備註(用哪牌耗材、找哪家維修等)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table appliance_tasks enable row level security;


-- ===== 家人通訊錄(contacts)=====
-- 7 人家庭的「主鍵資料」。其他板塊(待辦、家事輪值、醫療紀錄等)未來透過名字/暱稱引用。
-- 目前先存通訊錄本身,FK 串接等其他板塊建好再加。
create table if not exists contacts (
  id                  bigint generated always as identity primary key,
  name                text        not null,                        -- 姓名(必填)
  nickname            text,                                        -- 家中稱呼(例:爸爸、大哥、小妤)
  role                text,                                        -- 家庭角色(例:父親、母親、長子)
  phone               text,                                        -- 主要電話
  line_id             text,                                        -- LINE ID
  email               text,                                        -- Email
  birthday            date,                                        -- 生日(之後接「生日紀念日」板塊提醒)
  blood_type          text,                                        -- 血型(緊急時用)
  address             text,                                        -- 住址(長輩可能不同處)
  work_address        text,                                        -- 工作地址(公司 / 就讀學校)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table contacts enable row level security;
