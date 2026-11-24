import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { getDocumentBySlug, stripSecret } from "@/lib/db";
import { getPublicSiteUrl } from "@/lib/network";
import { isDocUnlockedForCurrentRequest, isExpired } from "@/lib/security";

export const dynamic = "force-dynamic";

async function resolveAbsoluteOrigin(): Promise<string> {
  const configured = getPublicSiteUrl();
  if (configured) return configured;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const record = getDocumentBySlug(slug);

  if (!record) {
    return {
      title: "画册未找到",
      description: "该 FlipDoc 画册不存在或已被移除。",
    };
  }

  const origin = await resolveAbsoluteOrigin();
  const coverUrl = record.coverFile
    ? `${origin}/api/files/${record.id}/${record.coverFile}?v=${encodeURIComponent(
        record.updatedAt
      )}`
    : undefined;
  const desc =
    record.description ||
    `共 ${record.pageCount} 页 · 点击立即翻页浏览，支持 3D 翻书与手机滑动缩放`;

  return {
    title: record.title,
    description: desc,
    openGraph: {
      title: record.title,
      description: desc,
      type: "article",
      url: `${origin}/v/${record.slug}`,
      images: coverUrl
        ? [
            {
              url: coverUrl,
              width: record.pageWidth > record.pageHeight ? 1200 : 840,
              height: record.pageWidth > record.pageHeight ? 750 : 1120,
              alt: record.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: record.title,
      description: desc,
      images: coverUrl ? [coverUrl] : undefined,
    },
  };
}

export default async function ReaderPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const record = getDocumentBySlug(slug);

  if (!record) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#141413] px-6 text-center text-[#F5F2EB]">
        <p className="font-mono text-xs tracking-widest text-[#E07A52]">404 · NOT FOUND</p>
        <h1 className="mt-2 text-2xl font-bold">这份画册不存在或已被删除</h1>
        <p className="mt-2 max-w-sm text-sm text-white/60">
          请检查分享链接是否完整，或者回到工作台重新导入文件生成画册。
        </p>
        <Link
          href="/"
          className="mt-6 rounded-full bg-[#C85A32] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#B24B26]"
        >
          返回 FlipDoc 工作台
        </Link>
      </div>
    );
  }

  const expired = isExpired(record.expiresAt);
  const unlocked = await isDocUnlockedForCurrentRequest(record.id, record.passcodeHash);
  const publicDoc = stripSecret(record, { isExpired: expired, isUnlocked: unlocked });

  return (
    <>
      {/* Classic WeChat built-in browser cover image hint for link forwarding without JSSDK */}
      {publicDoc.coverUrl && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            width: 0,
            height: 0,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicDoc.coverUrl} alt="" width={360} height={360} />
        </div>
      )}
      <ReaderShell initialDoc={publicDoc} />
    </>
  );
}
