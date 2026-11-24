import crypto from "node:crypto";
import { cookies } from "next/headers";

const SECRET_SEED =
  process.env.FLIPDOC_SECRET ||
  process.env.STUDIO_PASSCODE ||
  "flipdoc-local-signing-key-v1";

function getSigningKey(): Buffer {
  return crypto.createHash("sha256").update(SECRET_SEED).digest();
}

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(passcode, salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPasscode(passcode: string, storedHash: string | null): boolean {
  if (!storedHash) return true;
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(passcode, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function createUnlockToken(docId: string, passcodeHash: string): string {
  const version = crypto.createHash("sha256").update(passcodeHash).digest("hex").slice(0, 12);
  const payload = `${docId}.${version}`;
  const sig = crypto
    .createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("hex")
    .slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyUnlockToken(
  token: string | undefined,
  docId: string,
  passcodeHash: string | null
): boolean {
  if (!passcodeHash) return true;
  if (!token) return false;
  const expected = createUnlockToken(docId, passcodeHash);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getUnlockCookieName(docId: string): string {
  const safeId = docId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `fd_unlock_${safeId}`;
}

export async function isDocUnlockedForCurrentRequest(
  docId: string,
  passcodeHash: string | null
): Promise<boolean> {
  if (!passcodeHash) return true;
  const cookieStore = await cookies();
  const token = cookieStore.get(getUnlockCookieName(docId))?.value;
  return verifyUnlockToken(token, docId, passcodeHash);
}

// Optional Studio admin protection (only enabled when STUDIO_PASSCODE env var is configured)
const STUDIO_COOKIE = "fd_studio_auth";

export function isStudioLockEnabled(): boolean {
  return Boolean(process.env.STUDIO_PASSCODE?.trim());
}

export function createStudioToken(): string {
  const expectedPass = process.env.STUDIO_PASSCODE?.trim() || "";
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(`studio:${expectedPass}`)
    .digest("hex");
}

export async function isStudioAuthorized(): Promise<boolean> {
  if (!isStudioLockEnabled()) return true;
  const cookieStore = await cookies();
  const token = cookieStore.get(STUDIO_COOKIE)?.value;
  if (!token) return false;
  const expected = createStudioToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getStudioCookieName(): string {
  return STUDIO_COOKIE;
}

export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  if (Number.isNaN(time)) return false;
  return Date.now() > time;
}
