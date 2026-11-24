import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pdfjsRoot = path.join(root, "node_modules", "pdfjs-dist");
const publicDir = path.join(root, "public");

function copyFileIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirIfExists(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirIfExists(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyFileIfExists(
  path.join(pdfjsRoot, "build", "pdf.worker.min.mjs"),
  path.join(publicDir, "pdf.worker.min.mjs")
);
copyDirIfExists(path.join(pdfjsRoot, "cmaps"), path.join(publicDir, "cmaps"));
copyDirIfExists(
  path.join(pdfjsRoot, "standard_fonts"),
  path.join(publicDir, "standard_fonts")
);
console.log("[FlipDoc] Synced PDF.js worker, cmaps, and standard fonts.");
