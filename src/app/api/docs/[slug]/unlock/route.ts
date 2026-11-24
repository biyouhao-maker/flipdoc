import { NextResponse } from "next/server";
import { getDocumentBySlug } from "@/lib/db";
import {
  createUnlockToken,
  getUnlockCookieName,
  isExpired,
  verifyPasscode,
} from "@/lib/security";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const record = getDocumentBySlug(slug);
  if (!record) {
    return NextResponse.json({ error: "画册不存在" }, { status: 404 });
  }
  if (isExpired(record.expiresAt)) {
    return NextResponse.json({ error: "链接已过期" }, { status: 410 });
  }
  if (!record.passcodeHash) {
    return NextResponse.json({ unlocked: true });
  }

  let body: { passcode?: string } = {};
  try {
    body = (await request.json()) as { passcode?: string };
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }

  const code = (body.passcode || "").trim();
  if (!code || !verifyPasscode(code, record.passcodeHash)) {
    return NextResponse.json({ error: "访问密码不正确，请重试" }, { status: 401 });
  }

  const token = createUnlockToken(record.id, record.passcodeHash);
  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(getUnlockCookieName(record.id), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
