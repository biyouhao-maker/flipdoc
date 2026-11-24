"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  FolderOpen,
  Laptop,
  MessageCircle,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";

interface ChatImportModalProps {
  open: boolean;
  onClose: () => void;
  onTriggerBrowserPicker: () => void;
}

export function ChatImportModal({
  open,
  onClose,
  onTriggerBrowserPicker,
}: ChatImportModalProps) {
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    setIsAndroidApp(typeof window !== "undefined" && Boolean(window.FlipDocAndroid));
  }, [open]);

  if (!open) return null;

  const handleOpenChatApp = (pkg: string, name: string) => {
    if (!window.FlipDocAndroid?.openChatApp) return;
    const ok = window.FlipDocAndroid.openChatApp(pkg);
    if (!ok) {
      setToastMsg(`未检测到已安装的${name}客户端`);
    }
  };

  const handlePickSavedFiles = () => {
    if (window.FlipDocAndroid?.pickChatSavedFiles) {
      onClose();
      window.FlipDocAndroid.pickChatSavedFiles();
      return;
    }
    onClose();
    onTriggerBrowserPicker();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="safe-bottom flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[#E6DFD2] bg-[#FAF8F4] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6DFD2] bg-white px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2D5A47]/12 text-[#2D5A47]">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1A1816]">
                从微信 / QQ 聊天记录导入
              </h3>
              <p className="text-xs text-[#6C655B]">
                无需去深层文件夹翻找，一键把聊天文档转成翻页电子书
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-2 text-[#6C655B] hover:bg-[#F2EEE6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-6">
          {/* Method 1: Native WeChat / QQ "Open with FlipDoc" */}
          <div className="rounded-2xl border border-[#2D5A47]/25 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2D5A47]/12 px-2.5 py-0.5 text-xs font-bold text-[#2D5A47]">
                <Sparkles className="h-3.5 w-3.5" />
                安卓最丝滑方式 · 聊天内一键直转
              </span>
              {!isAndroidApp && (
                <a
                  href="/FlipDoc.apk"
                  download="FlipDoc-轻翻.apk"
                  className="text-xs font-semibold text-[#C85A32] underline underline-offset-2"
                >
                  需安装安卓 App
                </a>
              )}
            </div>

            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-[#3D3832]">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F2EEE6] font-mono text-[11px] font-bold text-[#1A1816]">
                  1
                </span>
                <span>
                  在<strong>微信或 QQ 聊天记录</strong>中，点击你要看的文档（PDF / Word / PPT / Markdown / TXT）或图片；
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F2EEE6] font-mono text-[11px] font-bold text-[#1A1816]">
                  2
                </span>
                <span>
                  点右上角 <strong>「···」</strong> → 选择 <strong>「用其他应用打开」</strong>（图片可选「发送给其他应用」）；
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C85A32] font-mono text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  在弹出列表里点 <strong>「FlipDoc 轻翻」</strong>，自动导入并直接打开为苹果图书式翻页电子书！
                </span>
              </li>
            </ol>

            {isAndroidApp ? (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleOpenChatApp("com.tencent.mm", "微信")}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#07C160] py-2.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-95"
                >
                  打开微信选文件
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenChatApp("com.tencent.mobileqq", "QQ")}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0099FF] py-2.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-95"
                >
                  打开 QQ 选文件
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="mt-3.5 flex items-center justify-between rounded-xl bg-[#F5F1E8] px-3.5 py-2.5 text-xs text-[#5A5349]">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-[#C85A32]" />
                  装上 55KB 安卓端即可在微信/QQ 菜单出现
                </span>
                <a
                  href="/FlipDoc.apk"
                  download="FlipDoc-轻翻.apk"
                  className="shrink-0 rounded-lg bg-[#1A1816] px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  下载 APK
                </a>
              </div>
            )}

            {toastMsg && (
              <p className="mt-2 text-center text-xs text-rose-600">{toastMsg}</p>
            )}
          </div>

          {/* Method 2: Pick already-saved Download/WeiXin or Download/QQ files */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1816]">
                  <FolderOpen className="h-4 w-4 text-[#C85A32]" />
                  选择已「保存到手机」的微信 / QQ 文件
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#6C655B]">
                  如果你已经在微信/QQ 里点过「保存到手机」，点右侧按钮可直接定位到下载目录（如 `Download/WeiXin`）导入。
                </p>
              </div>
              <button
                type="button"
                onClick={handlePickSavedFiles}
                className="shrink-0 rounded-xl border border-[#DFD8CA] bg-[#FAF8F4] px-3.5 py-2 text-xs font-semibold text-[#1A1816] transition hover:border-[#C85A32] hover:text-[#C85A32]"
              >
                去选文件
              </button>
            </div>
          </div>

          {/* Method 3: Desktop WeChat / QQ Drag & Drop */}
          <div className="rounded-2xl border border-[#E6DFD2] bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1816]">
              <Laptop className="h-4 w-4 text-[#28537A]" />
              电脑版微信 / QQ 一秒拖拽导入
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#6C655B]">
              在电脑上无需先另存到桌面：直接按住电脑微信或 QQ 聊天记录里的文件气泡，<strong>拖进首页虚线上传框</strong>松手即可！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
