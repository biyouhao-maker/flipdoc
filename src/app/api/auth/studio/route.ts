import { NextResponse } from "next/server";
import {
  createStudioToken,
  getStudioCookieName,
  isStudioLockEnabled,
} from "@/lib/security";

export async function POST(request: Request) {
  if (!isStudioLockEnabled()) {
    return NextResponse.json({ authorized: true });
  }

  let body: { passcode?: string } = {};
  try {
    body = (await request.json()) as { passcode?: string };
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const expected = process.env.STUDIO_PASSCODE?.trim() || "";
  if (!body.passcode || body.passcode.trim() !== expected) {
    return NextResponse.json({ error: "管理口令不正确" }, { status: 401 });
  }

  const response = NextResponse.json({ authorized: true });
  response.cookies.set(getStudioCookieName(), createStudioToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authorized: false });
  response.cookies.delete(getStudioCookieName());
  return response;
}
