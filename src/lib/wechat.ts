import crypto from "node:crypto";

interface CachedTicket {
  ticket: string;
  expiresAt: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedTicket: CachedTicket | null = null;

export function isWechatJssdkConfigured(): boolean {
  return Boolean(process.env.WECHAT_APP_ID?.trim() && process.env.WECHAT_APP_SECRET?.trim());
}

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
      appId
    )}&secret=${encodeURIComponent(appSecret)}`
  );
  const data = (await res.json()) as { access_token?: string; expires_in?: number; errmsg?: string };
  if (!data.access_token) {
    throw new Error(data.errmsg || "Failed to obtain WeChat access_token");
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in || 7200) - 300) * 1000,
  };
  return cachedToken.token;
}

async function getJsApiTicket(appId: string, appSecret: string): Promise<string> {
  if (cachedTicket && Date.now() < cachedTicket.expiresAt) {
    return cachedTicket.ticket;
  }
  const token = await getAccessToken(appId, appSecret);
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(
      token
    )}&type=jsapi`
  );
  const data = (await res.json()) as { ticket?: string; expires_in?: number; errmsg?: string };
  if (!data.ticket) {
    throw new Error(data.errmsg || "Failed to obtain WeChat jsapi_ticket");
  }
  cachedTicket = {
    ticket: data.ticket,
    expiresAt: Date.now() + Math.max(60, (data.expires_in || 7200) - 300) * 1000,
  };
  return cachedTicket.ticket;
}

export async function createWechatJssdkSignature(url: string) {
  const appId = process.env.WECHAT_APP_ID?.trim();
  const appSecret = process.env.WECHAT_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { configured: false as const };
  }

  const cleanUrl = url.split("#")[0];
  const jsapiTicket = await getJsApiTicket(appId, appSecret);
  const nonceStr = crypto.randomBytes(8).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${cleanUrl}`;
  const signature = crypto.createHash("sha1").update(raw).digest("hex");

  return {
    configured: true as const,
    appId,
    timestamp,
    nonceStr,
    signature,
  };
}
