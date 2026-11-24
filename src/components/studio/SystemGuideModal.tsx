"use client";

import { CheckCircle2, Globe, Shield, Smartphone, Sparkles, X } from "lucide-react";
import type { SystemInfo } from "@/types/document";

interface SystemGuideModalProps {
  systemInfo: SystemInfo | null;
  onClose: () => void;
}

export function SystemGuideModal({ systemInfo, onClose }: SystemGuideModalProps) {
  const isAndroidApp =
    typeof window !== "undefined" && Boolean(window.FlipDocAndroid);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#E6DFD2] bg-[#FAF8F4] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E6DFD2] bg-white px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-[#1A1816]">微信扫码、App 体验与环境状态</h3>
            <p className="text-xs text-[#6C655B]">FlipDoc 轻翻 · 本地与公网使用指引</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#6C655B] hover:bg-[#F2EEE6]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6 text-xs leading-relaxed text-[#4E4942]">
          {isAndroidApp && (
            <div className="rounded-2xl border border-[#C85A32]/30 bg-[#FFF8F4] p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#1A1816]">
                    FlipDoc 安卓客户端已连接
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#6C655B]">
                    可随时切换连接的服务器地址（免费隧道 / Railway 云端 / 局域网）
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.FlipDocAndroid?.openServerSettings()}
                  className="shrink-0 rounded-xl bg-[#C85A32] px-3 py-2 text-xs font-semibold text-white"
                >
                  切换地址
                </button>
              </div>
            </div>
          )}

          {/* LibreOffice status */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#1A1816]">
                <Sparkles className="h-4 w-4 text-[#C85A32]" />
                文档高保真转换引擎
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  systemInfo?.libreOfficeAvailable
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                {systemInfo?.libreOfficeAvailable ? "LibreOffice 已就绪" : "内置零依赖模式"}
              </span>
            </div>
            <p className="mt-2 text-[#6C655B]">
              {systemInfo?.libreOfficeAvailable
                ? "已自动检测到本机 LibreOffice：导入 Word (.docx) 和 PPT (.pptx) 时可无损还原原始版式与图表，也支持手动切换「手机精排重排」模式。"
                : "未检测到本机 LibreOffice：PDF 原版渲染、Markdown 杂志分页、Word 手机精排、PPT 轻量解析及多图画册均可正常使用。"}
            </p>
          </div>

          {/* Local Wi-Fi WeChat scanning */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1816]">
              <Smartphone className="h-4 w-4 text-[#2D5A47]" />
              立刻用手机微信扫码体验（同 Wi-Fi）
            </div>
            <p className="mt-1.5 text-[#6C655B]">
              只要手机和电脑连在同一个 Wi-Fi 下，点击任意画册的「分享」，选择「同 Wi-Fi 手机扫码」，打开微信扫一扫即可直接在微信内翻页！
            </p>
            {systemInfo?.lanOrigins && systemInfo.lanOrigins.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {systemInfo.lanOrigins.slice(0, 3).map((origin) => (
                  <code
                    key={origin}
                    className="rounded-lg bg-[#F2EEE6] px-2.5 py-1 font-mono text-[11px] text-[#1A1816]"
                  >
                    {origin}
                  </code>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-[#8E867B]">
              提示：如果手机无法连接局域网地址，请在 Windows 防火墙放行 Node.js 的 3000 端口，或使用 Cloudflare Tunnel / 部署到公网服务器。
            </p>
          </div>

          {/* PWA App Mode */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1816]">
              <Globe className="h-4 w-4 text-[#28537A]" />
              作为手机 App 使用（PWA）
            </div>
            <p className="mt-1.5 text-[#6C655B]">
              在 iPhone Safari 点击「分享 → 添加到主屏幕」，或在 Android Chrome 点击「安装应用」，即可像独立 App 一样全屏打开 FlipDoc 工作台与翻页阅读器。
            </p>
          </div>

          {/* Production & WeChat JSSDK env */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1816]">
              <Shield className="h-4 w-4 text-[#C85A32]" />
              部署到公网与微信卡片增强（可选环境变量）
            </div>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-[#1A1816] p-3 font-mono text-[11px] leading-relaxed text-[#F5F2EB]">
{`STUDIO_PASSCODE=你的管理口令          # 公网部署时保护上传与编辑页
NEXT_PUBLIC_SITE_URL=https://你的域名  # 固定生成公网分享链接与 OG 封面
WECHAT_APP_ID=公众号AppID              # 可选：接入微信 JS-SDK 自定义卡片
WECHAT_APP_SECRET=公众号AppSecret`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
