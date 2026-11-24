const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPPORTED_EXTS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".md",
  ".markdown",
  ".txt",
]);

const MAX_BYTES = 58 * 1024 * 1024;

function readWeChatIniCustomRoot() {
  const roots = [];
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const iniCandidates = [
    path.join(appData, "Tencent", "WeChat", "All Users", "config", "3ebffe94.ini"),
    path.join(appData, "Tencent", "xwechat", "config", "3ebffe94.ini"),
  ];

  for (const iniPath of iniCandidates) {
    if (!fs.existsSync(iniPath)) continue;
    try {
      const rawBuf = fs.readFileSync(iniPath);
      const text =
        rawBuf[0] === 0xff && rawBuf[1] === 0xfe
          ? rawBuf.toString("utf16le")
          : rawBuf.toString("utf8");
      const trimmed = text.replace(/\0/g, "").trim();
      if (!trimmed || trimmed === "MyDocument:") continue;
      const candidateWeChat = path.join(trimmed, "WeChat Files");
      const candidateXWeChat = path.join(trimmed, "xwechat_files");
      if (fs.existsSync(candidateWeChat)) roots.push({ dir: candidateWeChat, type: "wechat3" });
      if (fs.existsSync(candidateXWeChat)) roots.push({ dir: candidateXWeChat, type: "wechat4" });
      if (fs.existsSync(trimmed)) roots.push({ dir: trimmed, type: "wechat-direct" });
    } catch {
      // ignore unreadable ini
    }
  }
  return roots;
}

function discoverChatScanTargets(customDirs = []) {
  const home = os.homedir();
  const docs = path.join(home, "Documents");
  const targets = [];
  const seen = new Set();

  const addTarget = (dirPath, source) => {
    if (!dirPath) return;
    const resolved = path.resolve(dirPath);
    const key = resolved.toLowerCase();
    if (seen.has(key) || !fs.existsSync(resolved)) return;
    seen.add(key);
    targets.push({ dir: resolved, source });
  };

  // 1. User-specified custom folders
  for (const c of customDirs) {
    const lower = c.toLowerCase();
    const src = lower.includes("wechat") || lower.includes("weixin")
      ? "微信"
      : lower.includes("tencent") || lower.includes("qq")
        ? "QQ"
        : "自定义目录";
    addTarget(c, src);
  }

  // 2. Discover WeChat roots (default Documents + ini custom path + D:/E:/F: common drives)
  const wechatRoots = [
    ...readWeChatIniCustomRoot().map((r) => r.dir),
    path.join(docs, "WeChat Files"),
    path.join(docs, "xwechat_files"),
    "D:\\WeChat Files",
    "D:\\xwechat_files",
    "E:\\WeChat Files",
    "E:\\xwechat_files",
    "F:\\WeChat Files",
  ];

  for (const root of wechatRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "All Users" || entry.name === "Applet" || entry.name === "WMPF") {
          continue;
        }
        const acctDir = path.join(root, entry.name);
        // Classic WeChat 3.x: FileStorage\File
        addTarget(path.join(acctDir, "FileStorage", "File"), "微信");
        // WeChat 4.x: msg\file
        addTarget(path.join(acctDir, "msg", "file"), "微信");
      }
    } catch {
      // ignore permission errors
    }
  }

  // 3. Discover QQ / NTQQ / TIM FileRecv roots
  const qqRoots = [
    path.join(docs, "Tencent Files"),
    "D:\\Tencent Files",
    "E:\\Tencent Files",
    "F:\\Tencent Files",
  ];

  for (const root of qqRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "All Users") continue;
        addTarget(path.join(root, entry.name, "FileRecv"), "QQ");
        addTarget(path.join(root, entry.name, "nt_qq", "nt_data", "File"), "QQ");
      }
    } catch {
      // ignore
    }
  }

  return targets;
}

function walkRecentDocs(dir, source, collector, depth = 0) {
  if (depth > 3) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name;
    if (!name || name.startsWith(".") || name.startsWith("~$")) continue;
    const fullPath = path.join(dir, name);

    if (entry.isDirectory()) {
      const lower = name.toLowerCase();
      if (
        lower === "thumb" ||
        lower === "cache" ||
        lower === "temp" ||
        lower === "image" ||
        lower === "video" ||
        lower === "node_modules"
      ) {
        continue;
      }
      walkRecentDocs(fullPath, source, collector, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 0 || stat.size > MAX_BYTES) continue;
        collector.push({
          fullPath,
          name,
          ext,
          source,
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs),
          folderHint: path.basename(path.dirname(fullPath)),
        });
      } catch {
        // skip unreadable file
      }
    }
  }
}

function scanAllChatFiles(customDirs = []) {
  const targets = discoverChatScanTargets(customDirs);
  const rawList = [];

  for (const target of targets) {
    walkRecentDocs(target.dir, target.source, rawList, 0);
  }

  rawList.sort((a, b) => b.mtime - a.mtime);

  // Deduplicate identical name + size (WeChat sometimes saves (1) or duplicate cache copies)
  const deduped = [];
  const seenSig = new Set();
  const pathLookup = new Map();

  for (const item of rawList) {
    const sig = `${item.name}|${item.size}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);

    const id = crypto
      .createHash("sha1")
      .update(item.fullPath)
      .digest("hex")
      .slice(0, 16);

    pathLookup.set(id, item.fullPath);
    deduped.push({
      id,
      name: item.name,
      ext: item.ext,
      source: item.source,
      size: item.size,
      mtime: item.mtime,
      folderHint: item.folderHint,
    });

    if (deduped.length >= 40) break;
  }

  return {
    files: deduped,
    scannedDirs: targets.map((t) => t.dir),
    pathLookup,
  };
}

module.exports = {
  scanAllChatFiles,
  SUPPORTED_EXTS,
};
