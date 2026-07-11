import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentForge｜多智能体协作开发报告平台",
  description: "A local-first sequential multi-agent workspace for requirement analysis and development report generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
