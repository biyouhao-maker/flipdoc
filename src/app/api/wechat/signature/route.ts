import { NextResponse } from "next/server";
import { createWechatJssdkSignature } from "@/lib/wechat";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const result = await createWechatJssdkSignature(url);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "WeChat signature error";
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
