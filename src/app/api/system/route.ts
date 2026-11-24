import { NextResponse } from "next/server";
import { findLibreOfficePath } from "@/lib/libreoffice";
import { getLanOrigins, getPublicSiteUrl } from "@/lib/network";
import { isStudioAuthorized, isStudioLockEnabled } from "@/lib/security";
import { isWechatJssdkConfigured } from "@/lib/wechat";
import type { SystemInfo } from "@/types/document";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const port = url.port || process.env.PORT || (url.protocol === "https:" ? "443" : "3000");
  const loPath = findLibreOfficePath();

  const payload: SystemInfo = {
    libreOfficeAvailable: Boolean(loPath),
    libreOfficePath: loPath,
    lanOrigins: getLanOrigins(port),
    publicSiteUrl: getPublicSiteUrl(),
    studioLocked: isStudioLockEnabled(),
    studioAuthorized: await isStudioAuthorized(),
    wechatJssdkConfigured: isWechatJssdkConfigured(),
  };

  return NextResponse.json(payload);
}
