"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Globe,
  Image as ImageIcon,
  Link2,
  Lock,
  QrCode,
  Smartphone,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import type { FlipDocumentPublic, SystemInfo } from "@/types/document";

interface ShareModalProps {
  doc: FlipDocumentPublic;
  systemInfo: SystemInfo | null;
  onClose: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  pdf: "PDF 画册",
  docx: "Word 精排",
  pptx: "PPT 演示",
  markdown: "精读画册",
  images: "图片画册",
};

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const lines: string[] = [];
  let line = "";
  for (const ch of clean) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      if (lines.length >= maxLines) break;
      line = ch;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) {
    lines.push(line);
  }
  if (lines.length === maxLines && clean.length > lines.join("").length + 1) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function ShareModal({ doc, systemInfo, onClose }: ShareModalProps) {
  const [tab, setTab] = useState<"link" | "poster">("link");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [posterUrl, setPosterUrl] = useState<string>("");
  const [posterLoading, setPosterLoading] = useState(false);
  const [customOrigin, setCustomOrigin] = useState("");
  const [originMode, setOriginMode] = useState<"current" | "lan" | "public" | "custom">(() => {
    if (systemInfo?.publicSiteUrl) return "public";
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
      systemInfo?.lanOrigins?.length
    ) {
      return "lan";
    }
    return "current";
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const shareOrigin = useMemo(() => {
    if (originMode === "public" && systemInfo?.publicSiteUrl) {
      return systemInfo.publicSiteUrl;
    }
    if (originMode === "lan" && systemInfo?.lanOrigins?.[0]) {
      return systemInfo.lanOrigins[0];
    }
    if (originMode === "custom" && customOrigin.trim()) {
      return customOrigin.trim().replace(/\/+$/, "");
    }
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "http://localhost:3000";
  }, [originMode, systemInfo, customOrigin]);

  const shareUrl = `${shareOrigin}/v/${doc.slug}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(shareUrl, {
      width: 440,
      margin: 2,
      color: { dark: "#1A1816", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [shareUrl]);

  const generatePoster = useCallback(async () => {
    if (!qrDataUrl) return;
    setPosterLoading(true);
    try {
      const canvas = canvasRef.current || document.createElement("canvas");
      canvasRef.current = canvas;
      const W = 900;
      const H = 1360;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Warm editorial backdrop
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#FAF7F1");
      grad.addColorStop(1, "#EFE9DC");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Subtle decorative accent glow
      ctx.fillStyle = "rgba(200, 90, 50, 0.08)";
      ctx.beginPath();
      ctx.arc(W - 80, 120, 210, 0, Math.PI * 2);
      ctx.fill();

      // Main white editorial card container
      const pad = 48;
      ctx.save();
      ctx.shadowColor = "rgba(26, 24, 22, 0.10)";
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(pad, pad, W - pad * 2, H - pad * 2, 28);
      ctx.fill();
      ctx.restore();

      // Top header strip
      ctx.fillStyle = "#C85A32";
      ctx.beginPath();
      ctx.roundRect(92, 92, 138, 38, 19);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(SOURCE_LABELS[doc.sourceType] || "电子画册", 114, 118);

      ctx.fillStyle = "#8C8478";
      ctx.font = '600 18px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(`共 ${doc.pageCount} 页 · 翻页阅读`, W - 92, 118);
      ctx.textAlign = "left";

      // Cover preview frame with 3D book shadow
      const coverBoxX = 92;
      const coverBoxY = 160;
      const coverBoxW = W - 184;
      const coverBoxH = 540;

      ctx.fillStyle = "#F4F0E8";
      ctx.beginPath();
      ctx.roundRect(coverBoxX, coverBoxY, coverBoxW, coverBoxH, 20);
      ctx.fill();

      if (doc.coverUrl) {
        try {
          const coverImg = await loadImage(doc.coverUrl);
          const ratio = Math.min(
            (coverBoxW - 64) / coverImg.width,
            (coverBoxH - 52) / coverImg.height
          );
          const drawW = coverImg.width * ratio;
          const drawH = coverImg.height * ratio;
          const drawX = coverBoxX + (coverBoxW - drawW) / 2;
          const drawY = coverBoxY + (coverBoxH - drawH) / 2;

          ctx.save();
          ctx.shadowColor = "rgba(26, 24, 22, 0.24)";
          ctx.shadowBlur = 28;
          ctx.shadowOffsetY = 12;
          ctx.beginPath();
          ctx.roundRect(drawX, drawY, drawW, drawH, 10);
          ctx.clip();
          ctx.drawImage(coverImg, drawX, drawY, drawW, drawH);

          // Spine highlight
          const spineGrad = ctx.createLinearGradient(drawX, 0, drawX + 26, 0);
          spineGrad.addColorStop(0, "rgba(0,0,0,0.18)");
          spineGrad.addColorStop(0.35, "rgba(255,255,255,0.16)");
          spineGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = spineGrad;
          ctx.fillRect(drawX, drawY, 26, drawH);
          ctx.restore();
        } catch {
          // ignore failed cover image load
        }
      }

      // Title
      ctx.fillStyle = "#1A1816";
      ctx.font = '700 40px "Songti SC", "PingFang SC", "Microsoft YaHei", serif';
      const titleLines = wrapCanvasText(ctx, doc.title, W - 184, 2);
      titleLines.forEach((line, idx) => {
        ctx.fillText(line, 92, 764 + idx * 54);
      });

      // Description
      const descStartY = 764 + Math.max(1, titleLines.length) * 54 + 14;
      ctx.fillStyle = "#6C655B";
      ctx.font = '400 23px "PingFang SC", "Microsoft YaHei", sans-serif';
      const descLines = wrapCanvasText(
        ctx,
        doc.description || "微信内直接点开或扫码即可翻页浏览，支持双指放大与目录跳转。",
        W - 184,
        3
      );
      descLines.forEach((line, idx) => {
        ctx.fillText(line, 92, descStartY + idx * 36);
      });

      // Divider line
      const footerY = 1046;
      ctx.strokeStyle = "#E8E1D5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(92, footerY);
      ctx.lineTo(W - 92, footerY);
      ctx.stroke();

      // QR Code block on bottom right
      const qrImg = await loadImage(qrDataUrl);
      const qrSize = 186;
      const qrX = W - 92 - qrSize;
      const qrY = footerY + 34;

      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#E6DFD2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 16);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Left CTA copy
      ctx.fillStyle = "#1A1816";
      ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("微信长按识别二维码", 92, footerY + 90);

      ctx.fillStyle = "#6C655B";
      ctx.font = '400 21px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("零安装直开 · 仿真翻书 & 手机滑动", 92, footerY + 132);

      if (doc.hasPasscode) {
        ctx.fillStyle = "#C85A32";
        ctx.font = '600 19px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText(
          doc.passcodeHint ? `已加密保护 · ${doc.passcodeHint}` : "已开启访问密码保护",
          92,
          footerY + 172
        );
      }

      ctx.fillStyle = "#9A9185";
      ctx.font = '700 17px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("FLIPDOC 轻翻 · 电子画册", 92, footerY + 216);

      setPosterUrl(canvas.toDataURL("image/png"));
    } finally {
      setPosterLoading(false);
    }
  }, [doc, qrDataUrl]);

  useEffect(() => {
    if (tab === "poster" && qrDataUrl) {
      void generatePoster();
    }
  }, [tab, qrDataUrl, generatePoster]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isAndroidApp =
    typeof window !== "undefined" && Boolean(window.FlipDocAndroid);

  const handleDownloadPoster = () => {
    if (!posterUrl) return;
    const filename = `${doc.title.replace(/[\\/:*?"<>|]/g, "_")}-微信分享海报.png`;
    if (window.FlipDocAndroid) {
      window.FlipDocAndroid.saveImageBase64(posterUrl, filename);
      return;
    }
    const link = document.createElement("a");
    link.href = posterUrl;
    link.download = filename;
    link.click();
  };

  const handleNativeSharePoster = () => {
    if (!posterUrl || !window.FlipDocAndroid) return;
    const filename = `${doc.title.replace(/[\\/:*?"<>|]/g, "_")}-微信分享海报.png`;
    window.FlipDocAndroid.shareImageBase64(posterUrl, filename, doc.title);
  };

  const handleNativeShareLink = () => {
    if (!window.FlipDocAndroid) return;
    window.FlipDocAndroid.shareLink(
      shareUrl,
      doc.title,
      `${doc.title}（共 ${doc.pageCount} 页 · 点击翻页阅读）\n${shareUrl}`
    );
  };

  const isLocalhostShare =
    shareUrl.includes("localhost") || shareUrl.includes("127.0.0.1");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#E6DFD2] bg-[#FAF8F4] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6DFD2] bg-white px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-[#1A1816]">分享到微信</h3>
            <p className="truncate text-xs text-[#6C655B]">{doc.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#6C655B] transition hover:bg-[#F2EEE6] hover:text-[#1A1816]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[#E6DFD2] bg-white px-6 py-2.5">
          <button
            type="button"
            onClick={() => setTab("link")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition ${
              tab === "link"
                ? "bg-[#1A1816] text-white"
                : "text-[#6C655B] hover:bg-[#F2EEE6]"
            }`}
          >
            <QrCode className="h-4 w-4" />
            链接与二维码
          </button>
          <button
            type="button"
            onClick={() => setTab("poster")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition ${
              tab === "poster"
                ? "bg-[#C85A32] text-white"
                : "text-[#6C655B] hover:bg-[#F2EEE6]"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            微信分享海报
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          {/* Origin Selector for Local LAN WeChat Testing vs Public URL */}
          <div className="mb-4 rounded-2xl border border-[#E6DFD2] bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-[#6C655B]">
              <span className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-[#C85A32]" />
                分享访问地址来源
              </span>
              {doc.hasPasscode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#C85A32]/10 px-2 py-0.5 text-[11px] font-medium text-[#C85A32]">
                  <Lock className="h-3 w-3" />
                  已加密
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {systemInfo?.lanOrigins && systemInfo.lanOrigins.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOriginMode("lan")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    originMode === "lan"
                      ? "bg-[#2D5A47] text-white"
                      : "bg-[#F2EEE6] text-[#4E4942] hover:bg-[#E6DFD2]"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  同 Wi-Fi 手机扫码
                </button>
              )}
              {systemInfo?.publicSiteUrl && (
                <button
                  type="button"
                  onClick={() => setOriginMode("public")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    originMode === "public"
                      ? "bg-[#1A1816] text-white"
                      : "bg-[#F2EEE6] text-[#4E4942] hover:bg-[#E6DFD2]"
                  }`}
                >
                  公网域名
                </button>
              )}
              <button
                type="button"
                onClick={() => setOriginMode("current")}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  originMode === "current"
                    ? "bg-[#1A1816] text-white"
                    : "bg-[#F2EEE6] text-[#4E4942] hover:bg-[#E6DFD2]"
                }`}
              >
                当前地址
              </button>
              <button
                type="button"
                onClick={() => setOriginMode("custom")}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  originMode === "custom"
                    ? "bg-[#1A1816] text-white"
                    : "bg-[#F2EEE6] text-[#4E4942] hover:bg-[#E6DFD2]"
                }`}
              >
                自定义域名
              </button>
            </div>
            {originMode === "custom" && (
              <input
                type="url"
                value={customOrigin}
                onChange={(e) => setCustomOrigin(e.target.value)}
                placeholder="例如 https://docs.yourdomain.com"
                className="mt-2.5 w-full rounded-xl border border-[#DFD8CA] bg-[#FAF8F4] px-3 py-2 text-xs text-[#1A1816] outline-none focus:border-[#C85A32]"
              />
            )}
            {isLocalhostShare && (
              <p className="mt-2 text-[11px] leading-relaxed text-[#9C5C2E]">
                提示：`localhost` 仅限本机打开；手机微信扫码请切换到「同 Wi-Fi 手机扫码」或部署公网域名。
              </p>
            )}
          </div>

          {tab === "link" ? (
            <div className="space-y-4">
              {/* QR Card */}
              <div className="flex flex-col items-center rounded-2xl border border-[#E6DFD2] bg-white px-6 py-5 text-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="微信扫码二维码"
                    className="h-48 w-48 rounded-xl border border-[#EFEAE0] p-1"
                  />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-[#F2EEE6] text-xs text-[#6C655B]">
                    生成二维码中…
                  </div>
                )}
                <p className="mt-3 text-sm font-semibold text-[#1A1816]">
                  打开微信「扫一扫」直接翻页阅读
                </p>
                <p className="mt-1 text-xs text-[#6C655B]">
                  支持手机左右滑动、3D 仿真翻书与双指放大图表
                </p>
              </div>

              {/* Copy URL Row */}
              <div className="flex items-center gap-2 rounded-2xl border border-[#E6DFD2] bg-white p-2 pl-3.5">
                <Link2 className="h-4 w-4 shrink-0 text-[#8C8478]" />
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="min-w-0 flex-1 bg-transparent text-xs text-[#1A1816] outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#1A1816] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#33302C]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      复制链接
                    </>
                  )}
                </button>
              </div>
              {isAndroidApp && (
                <button
                  type="button"
                  onClick={handleNativeShareLink}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2D5A47] py-3 text-sm font-semibold text-white transition hover:bg-[#234839]"
                >
                  直接转发链接到微信 / 系统分享
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-center rounded-2xl border border-[#E6DFD2] bg-[#EFEBE2] p-3">
                {posterLoading || !posterUrl ? (
                  <div className="flex h-[300px] w-full items-center justify-center text-xs text-[#6C655B]">
                    正在渲染高清微信分享海报…
                  </div>
                ) : (
                  <img
                    src={posterUrl}
                    alt="微信分享海报预览"
                    className="max-h-[320px] w-auto rounded-xl shadow-lg"
                  />
                )}
              </div>
              <div className={isAndroidApp ? "grid grid-cols-2 gap-2" : ""}>
                <button
                  type="button"
                  onClick={handleDownloadPoster}
                  disabled={!posterUrl || posterLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C85A32] py-3 text-sm font-semibold text-white transition hover:bg-[#B24B26] disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {isAndroidApp ? "存到手机相册" : "保存高清海报图片（直接发微信群 / 朋友圈）"}
                </button>
                {isAndroidApp && (
                  <button
                    type="button"
                    onClick={handleNativeSharePoster}
                    disabled={!posterUrl || posterLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2D5A47] py-3 text-sm font-semibold text-white transition hover:bg-[#234839] disabled:opacity-50"
                  >
                    直接发给微信
                  </button>
                )}
              </div>
              <p className="text-center text-[11px] text-[#6C655B]">
                无需注册微信公众号，直接把海报图发微信，好友长按识别二维码即可进入翻页画册。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
