"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Lock, ShieldAlert } from "lucide-react";
import type { FlipDocumentPublic } from "@/types/document";

interface PasscodeGateProps {
  doc: FlipDocumentPublic;
  onUnlocked: () => void;
}

export function PasscodeGate({ doc, onUnlocked }: PasscodeGateProps) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setError("请输入访问密码");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(doc.slug)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = (await res.json()) as { unlocked?: boolean; error?: string };
      if (!res.ok || !data.unlocked) {
        setError(data.error || "访问密码不正确");
        return;
      }
      onUnlocked();
    } catch {
      setError("网络请求失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#151514] px-5 py-10 text-[#F6F3EC]">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#1F1E1C] p-7 shadow-2xl">
        {/* Book Cover Miniature */}
        <div className="mb-6 flex items-center gap-4">
          {doc.coverUrl ? (
            <img
              src={doc.coverUrl}
              alt={doc.title}
              className="fd-book-cover h-24 w-18 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-24 w-18 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs text-white/60">
              {doc.pageCount}P
            </div>
          )}
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#C85A32]/20 px-2.5 py-0.5 text-[11px] font-medium text-[#E88A65]">
              {doc.isExpired ? (
                <>
                  <Clock className="h-3 w-3" />
                  链接已过期
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3" />
                  加密画册
                </>
              )}
            </span>
            <h1 className="mt-1.5 line-clamp-2 text-lg font-bold leading-snug text-white">
              {doc.title}
            </h1>
            <p className="mt-1 text-xs text-white/55">共 {doc.pageCount} 页 · FlipDoc 轻翻</p>
          </div>
        </div>

        {doc.isExpired ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-center">
            <ShieldAlert className="mx-auto h-7 w-7 text-amber-400" />
            <p className="mt-2 text-sm font-medium text-amber-200">该分享链接已超过有效期</p>
            <p className="mt-1 text-xs text-white/60">
              如需继续翻阅，请联系文档分享者重新开启或延长有效期。
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-1 rounded-xl bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/20"
            >
              返回 FlipDoc 工作台
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/75">
                请输入访问密码后翻阅全文
              </label>
              <input
                type="password"
                inputMode="text"
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="输入访问密码"
                className="w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3.5 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[#C85A32]"
              />
              {doc.passcodeHint && (
                <p className="mt-2 text-xs text-[#E8A07A]">提示：{doc.passcodeHint}</p>
              )}
              {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C85A32] py-3.5 text-sm font-semibold text-white transition hover:bg-[#B24B26] disabled:opacity-60"
            >
              {submitting ? "正在验证…" : "解锁并翻页阅读"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
