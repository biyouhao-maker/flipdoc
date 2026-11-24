import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let cachedPath: string | null | undefined;

export function findLibreOfficePath(): string | null {
  if (cachedPath !== undefined) return cachedPath;

  const candidates: string[] = [];
  if (process.env.LIBREOFFICE_PATH) {
    candidates.push(process.env.LIBREOFFICE_PATH);
  }
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      "/usr/local/bin/soffice",
      "/opt/homebrew/bin/soffice"
    );
  } else {
    candidates.push("/usr/bin/soffice", "/usr/local/bin/soffice", "/usr/bin/libreoffice");
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      cachedPath = candidate;
      return cachedPath;
    }
  }

  cachedPath = null;
  return null;
}

function toFileUrl(dirPath: string): string {
  const normalized = path.resolve(dirPath).replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

export async function convertOfficeToPdf(
  inputFilePath: string,
  outputDir: string
): Promise<string | null> {
  const soffice = findLibreOfficePath();
  if (!soffice) return null;

  const runId = crypto.randomBytes(6).toString("hex");
  const profileDir = path.join(os.tmpdir(), `flipdoc-lo-profile-${runId}`);
  const tempOutDir = path.join(os.tmpdir(), `flipdoc-lo-out-${runId}`);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(tempOutDir, { recursive: true });

  try {
    await execFileAsync(
      soffice,
      [
        `-env:UserInstallation=${toFileUrl(profileDir)}`,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--norestore",
        "--convert-to",
        "pdf",
        "--outdir",
        tempOutDir,
        inputFilePath,
      ],
      {
        timeout: 45_000,
        windowsHide: true,
      }
    );

    const files = fs.readdirSync(tempOutDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) return null;

    const producedPdf = path.join(tempOutDir, files[0]);
    const targetPdf = path.join(outputDir, "rendered.pdf");
    fs.copyFileSync(producedPdf, targetPdf);
    return targetPdf;
  } catch (err) {
    console.warn("[FlipDoc] LibreOffice conversion failed, will use built-in fallback:", err);
    return null;
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.rmSync(tempOutDir, { recursive: true, force: true });
  }
}
