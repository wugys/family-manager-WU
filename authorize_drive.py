"""一次性 OAuth 授權腳本:跑一次拿 drive-token.json,之後 drive_storage 自動用。

跑法:
    .\\venv\\Scripts\\python.exe authorize_drive.py

第一次跑會:
    1. 開瀏覽器讓 Kevin 用 wugys.tw@gmail.com 登入
    2. 看到「未驗證 app」警告 → 點「Advanced → Go to 家庭管理系統 (unsafe)」
    3. 點「允許」授權 Drive 存取
    4. 瀏覽器自動重導到 localhost,顯示「The authentication flow has completed」
    5. 終端機跑出「✅ 授權成功」+ token 寫進 drive-token.json
    6. 之後 drive_storage 都讀 drive-token.json,不需要再跑這支

什麼時候要重跑:
    - testing 階段:refresh token 每 7 天過期,過期就重跑這支
    - 解法:授權後到 Google Cloud → OAuth consent screen 點「PUBLISH APP」轉「In production」
"""
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

# Drive 完整存取(讀寫刪)
SCOPES = ["https://www.googleapis.com/auth/drive"]

# Kevin 從 Google Cloud Console 下載的 OAuth Client secret JSON
CLIENT_SECRET_FILE = Path(__file__).parent / "oauth-client-secret.json"

# 跑完授權後產生的 token,drive_storage 讀這個檔
TOKEN_FILE = Path(__file__).parent / "drive-token.json"


def main():
    """跑 OAuth installed-app flow,拿 token 寫進 drive-token.json。"""
    if not CLIENT_SECRET_FILE.exists():
        print(f"❌ 找不到 {CLIENT_SECRET_FILE}")
        print("請去 Google Cloud Console 建 OAuth Client ID(電腦版應用程式),")
        print("下載 JSON 改名為 oauth-client-secret.json 放專案根目錄。")
        return

    print("正在開瀏覽器跑授權流程...")
    print("(看到「未驗證 app」警告時,點 Advanced → Go to 家庭管理系統 (unsafe))")
    flow = InstalledAppFlow.from_client_secrets_file(
        str(CLIENT_SECRET_FILE), SCOPES
    )
    # port=0 自動找空 port,redirect URI 自動設 http://localhost:<port>/
    creds = flow.run_local_server(port=0)

    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"\n✅ 授權成功,token 已寫入 {TOKEN_FILE}")
    print("現在 drive_storage 可以正常上傳 Drive 檔案了。")


if __name__ == "__main__":
    main()
