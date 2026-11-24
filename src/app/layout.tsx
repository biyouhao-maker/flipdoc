import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FlipDoc 轻翻 · 文档一键转微信翻页画册",
    template: "%s · FlipDoc 轻翻",
  },
  description:
    "将 PDF、Word、PPT、Markdown 或图集一键转化为适合微信浏览的 3D 翻书与丝滑滑动电子画册，支持双指缩放、目录跳转、密码访问与分享海报。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "FlipDoc 轻翻",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F7F5F0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased selection:bg-[#C85A32]/20 selection:text-[#1A1816]">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
