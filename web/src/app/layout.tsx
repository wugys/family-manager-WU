import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "家庭管理系統",
  description: "7 人家庭共用的管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="bg-slate-50 min-h-screen text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
