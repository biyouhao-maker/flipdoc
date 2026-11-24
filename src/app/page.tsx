import { StudioApp } from "@/components/studio/StudioApp";
import { listDocuments, stripSecret } from "@/lib/db";
import { findLibreOfficePath } from "@/lib/libreoffice";
import { getLanOrigins, getPublicSiteUrl } from "@/lib/network";
import { isExpired, isStudioAuthorized, isStudioLockEnabled } from "@/lib/security";
import { ensureDemoSeeded } from "@/lib/seed";
import { isWechatJssdkConfigured } from "@/lib/wechat";
import type { SystemInfo } from "@/types/document";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDemoSeeded(false);

  const records = listDocuments();
  const docs = records.map((r) =>
    stripSecret(r, {
      isExpired: isExpired(r.expiresAt),
      isUnlocked: true,
    })
  );

  const loPath = findLibreOfficePath();
  const systemInfo: SystemInfo = {
    libreOfficeAvailable: Boolean(loPath),
    libreOfficePath: loPath,
    lanOrigins: getLanOrigins(process.env.PORT || "3000"),
    publicSiteUrl: getPublicSiteUrl(),
    studioLocked: isStudioLockEnabled(),
    studioAuthorized: await isStudioAuthorized(),
    wechatJssdkConfigured: isWechatJssdkConfigured(),
  };

  return <StudioApp initialDocs={docs} initialSystemInfo={systemInfo} />;
}
