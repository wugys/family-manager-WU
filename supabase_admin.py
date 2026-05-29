"""Supabase 管理操作層:跑 DDL / 任意 SQL,給 Claude 自己改 schema 用。

跟領域檔(bills.py / contacts.py 等)的差別:
- 領域檔走 supabase-py REST API,只能 CRUD,**不能改 schema**
- 這個檔案走 PostgreSQL 直連(psycopg2-binary + Session pooler),能跑**任意 SQL**

連線資訊讀 .env 的 SUPABASE_DB_URL(從 Supabase 後台 Connect → Direct → Session pooler 拿)。
這把 password 是 **project-level**,只能連這個 project,碰不到 Kevin 其他 project。

================================================================
兩道護欄(避免 Claude 手滑或 prompt injection 砍資料)
================================================================
1. **黑名單**:破壞性操作的 SQL 樣式直接 raise:
   - drop database
   - drop / truncate 任何現有業務表(bills / shopping_items / appliances / appliance_tasks / contacts)
   黑名單裡的操作真的要做(例如砍 project 重建)要 Kevin 明確同意拆白名單,不從這條路走
2. **稽核 log**:每次跑的 SQL log 到 logs/supabase_admin.log,事後查得到誰在何時改了什麼

註:原本還有第三道「對話確認」(Claude 先給 Kevin 看 SQL + 解釋),
2026-05-28 Kevin 明確取消——他只看最後結果(網頁 + Supabase),不看中間 SQL。
詳見 CLAUDE.md「強制規則 > 開發節奏」第 7 條。
"""

import logging
import os
import re
import sys
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()


# ===== Log 設定:每次跑的 SQL 都寫進 logs/supabase_admin.log =====
_LOG_DIR = Path("logs")
_LOG_DIR.mkdir(exist_ok=True)
_log_handler = logging.FileHandler(_LOG_DIR / "supabase_admin.log", encoding="utf-8")
_log_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
_logger = logging.getLogger("supabase_admin")
_logger.setLevel(logging.INFO)
_logger.addHandler(_log_handler)
_logger.propagate = False  # 不要污染 uvicorn 的 log


# ===== 黑名單:碰到這些樣式的 SQL 直接拒絕 =====
# 加新業務表時順手加進這份清單(防呆,不是真正的安全機制)
_PROTECTED_TABLES = (
    "bills",
    "shopping_items",
    "appliances",
    "appliance_tasks",
    "contacts",
)
_BLACKLIST_PATTERNS: list[re.Pattern] = [
    re.compile(r"\bdrop\s+database\b", re.I),
    re.compile(
        r"\b(drop|truncate)\s+(?:table\s+)?(?:if\s+exists\s+)?("
        + "|".join(_PROTECTED_TABLES)
        + r")\b",
        re.I,
    ),
]


def _get_db_url() -> str:
    """從 .env 拿 SUPABASE_DB_URL,沒設給友善錯誤。"""
    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError(
            ".env 沒設 SUPABASE_DB_URL,無法直連 Postgres。\n"
            "請去 Supabase 後台 Connect → Direct → Session pooler 複製 connection string。"
        )
    return url


def _check_blacklist(sql: str) -> None:
    """碰到黑名單樣式直接 raise,避免手滑或 prompt injection 砍掉業務表。"""
    for pattern in _BLACKLIST_PATTERNS:
        if pattern.search(sql):
            raise RuntimeError(
                f"⛔ 此 SQL 命中黑名單(疑似破壞性操作),拒絕執行。\n"
                f"  命中樣式:{pattern.pattern}\n\n"
                f"SQL:\n{sql.strip()}\n\n"
                f"若真的要跑(例如砍 project 重建),請直接去 Supabase 後台 SQL Editor 手動執行。"
            )


def run_sql(sql: str, description: str = "") -> list[dict[str, Any]]:
    """跑 SQL 到 Supabase Postgres,回傳結果。

    參數:
        sql: 要跑的 SQL,可以多個 statement 用分號分隔
        description: 給 log 用的人類可讀描述(例:「加 contacts.work_address 欄位」)

    回傳:
        SELECT → 結果 rows(list of dict,欄位名當 key)
        DDL / INSERT / UPDATE / DELETE → 空 list

    使用方式:
        Claude 直接呼叫,不需先在對話裡跟 Kevin 確認 SQL。
        Kevin 從前端 UI + Supabase Table Editor 驗收結果。
        (2026-05-28 後的新規則,見 CLAUDE.md「強制規則 > 開發節奏」第 7 條)

    Raises:
        RuntimeError: SQL 命中黑名單(破壞性操作)
        psycopg2.Error: SQL 語法錯誤、權限錯誤、連線錯誤等
    """
    _check_blacklist(sql)
    _logger.info(
        "RUN_SQL%s: %s",
        f" ({description})" if description else "",
        sql.replace("\n", " ⏎ ").strip(),
    )

    with psycopg2.connect(_get_db_url()) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            if cur.description:
                # SELECT(有結果集)→ 拿 rows
                rows = list(cur.fetchall())
                _logger.info("  → %d row(s) returned", len(rows))
                return [dict(r) for r in rows]
            else:
                # DDL / DML(沒有結果集)→ 看 rowcount
                rowcount = cur.rowcount if cur.rowcount >= 0 else 0
                _logger.info("  → %d row(s) affected", rowcount)
                return []


def list_columns(table_name: str) -> list[dict[str, Any]]:
    """便利函式:列出某張表的欄位清單(column_name, data_type, is_nullable)。

    給 Claude 改 schema 前 / 後快速確認用,例:
        from supabase_admin import list_columns
        for c in list_columns("contacts"):
            print(c)
    """
    return run_sql(
        f"""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '{table_name}'
        ORDER BY ordinal_position;
        """,
        description=f"列 {table_name} 欄位",
    )


def list_tables() -> list[str]:
    """便利函式:列出 public schema 底下所有 table 名稱。"""
    rows = run_sql(
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
        """,
        description="列所有 table",
    )
    return [r["table_name"] for r in rows]


# ===== 命令列入口:.\venv\Scripts\python.exe supabase_admin.py [SQL] =====
# 不帶參數 → 列所有 table + contacts 欄位(健康檢查)
# 帶參數 → 跑那段 SQL
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("=== Supabase 直連健康檢查 ===\n")
        print("所有 table:")
        for t in list_tables():
            print(f"  - {t}")
        print("\ncontacts 欄位:")
        for c in list_columns("contacts"):
            nullable = "NULL" if c["is_nullable"] == "YES" else "NOT NULL"
            default = f" default {c['column_default']}" if c["column_default"] else ""
            print(f"  {c['column_name']:24s} {c['data_type']:16s} {nullable}{default}")
    else:
        rows = run_sql(sys.argv[1], description="CLI 直接呼叫")
        if rows:
            for r in rows:
                print(r)
        else:
            print("(no rows)")
