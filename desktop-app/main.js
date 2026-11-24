const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { scanAllChatFiles, SUPPORTED_EXTS } = require("./scanner");

const DEFAULT_SERVER_URL = "https://flipdoc-production.up.railway.app";

let mainWindow = null;
let tray = null;
let isQuitting = false;
let latestPathLookup = new Map();

function getSettingsPath() {
  return path.join(app.getPath("userData"), "flipdoc-desktop-settings.json");
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch {
    // ignore corrupt settings
  }
  return { serverUrl: DEFAULT_SERVER_URL, customChatDirs: [] };
}

function saveSettings(next) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    // ignore write error
  }
}

function getServerUrl() {
  const s = loadSettings();
  return (s.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, "");
}

function extractSupportedFilesFromArgv(argv) {
  const files = [];
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith("-")) continue;
    try {
      const resolved = path.resolve(arg);
      if (!fs.existsSync(resolved)) continue;
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) continue;
      const ext = path.extname(resolved).toLowerCase();
      if (
        SUPPORTED_EXTS.has(ext) ||
        [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)
      ) {
        files.push(resolved);
      }
    } catch {
      // ignore invalid arg
    }
  }
  return files;
}

async function uploadLocalFilesToServer(filePaths) {
  const form = new FormData();
  form.append("docxMode", "reflow");
  form.append("theme", "warm-paper");
  form.append("defaultViewMode", "auto");

  for (const fp of filePaths) {
    const buf = fs.readFileSync(fp);
    const filename = path.basename(fp);
    form.append("files", new Blob([buf]), filename);
  }

  const res = await fetch(`${getServerUrl()}/api/docs`, {
    method: "POST",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.doc?.slug) {
    throw new Error(data.error || `服务器返回状态码 ${res.status}`);
  }
  return data.doc.slug;
}

async function importAndOpenFiles(filePaths) {
  if (!filePaths || filePaths.length === 0 || !mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  const prevTitle = mainWindow.getTitle();
  mainWindow.setTitle(`正在转换《${path.basename(filePaths[0])}》为翻页电子书…`);

  try {
    const slug = await uploadLocalFilesToServer(filePaths);
    await mainWindow.loadURL(`${getServerUrl()}/v/${slug}`);
  } catch (err) {
    dialog.showErrorBox(
      "导入转换失败",
      err instanceof Error ? err.message : "上传转换过程中发生异常，请检查网络连接"
    );
    mainWindow.setTitle(prevTitle);
  }
}

function createShortcuts() {
  const exePath = process.execPath;
  const desktopLnk = path.join(app.getPath("desktop"), "FlipDoc 轻翻.lnk");
  const sendToDir = path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "SendTo"
  );
  const sendToLnk = path.join(sendToDir, "FlipDoc 轻翻（转电子书）.lnk");

  let desktopOk = false;
  let sendToOk = false;

  try {
    desktopOk = shell.writeShortcutLink(desktopLnk, "create", {
      target: exePath,
      cwd: path.dirname(exePath),
      description: "FlipDoc 轻翻 · 文档一键转翻页电子书",
      icon: exePath,
      iconIndex: 0,
    });
  } catch {
    // ignore
  }

  try {
    fs.mkdirSync(sendToDir, { recursive: true });
    sendToOk = shell.writeShortcutLink(sendToLnk, "create", {
      target: exePath,
      cwd: path.dirname(exePath),
      description: "将文档发送到 FlipDoc 轻翻生成电子书",
      icon: exePath,
      iconIndex: 0,
    });
  } catch {
    // ignore
  }

  return { ok: desktopOk || sendToOk, desktop: desktopOk, sendTo: sendToOk };
}

async function pickAndImportLocalFiles() {
  if (!mainWindow) return;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: "选择要转成翻页电子书的文件",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "支持的文档与图片",
        extensions: [
          "pdf",
          "docx",
          "doc",
          "pptx",
          "ppt",
          "md",
          "markdown",
          "txt",
          "png",
          "jpg",
          "jpeg",
          "webp",
        ],
      },
    ],
  });

  if (!res.canceled && res.filePaths.length > 0) {
    await importAndOpenFiles(res.filePaths);
  }
}

function buildAppMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "导入本地文档转电子书…",
          accelerator: "CmdOrCtrl+O",
          click: () => void pickAndImportLocalFiles(),
        },
        {
          label: "回到我的画册书架",
          accelerator: "CmdOrCtrl+H",
          click: () => mainWindow?.loadURL(getServerUrl()),
        },
        { type: "separator" },
        {
          label: "创建桌面图标 & 右键「发送到」菜单",
          click: () => {
            const res = createShortcuts();
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "快捷方式已就绪",
              message: res.ok
                ? "已成功创建桌面快捷方式，并已加入系统右键「发送到 → FlipDoc 轻翻（转电子书）」！"
                : "创建快捷方式失败",
            });
          },
        },
        { type: "separator" },
        {
          label: "退出 FlipDoc 轻翻",
          accelerator: "Alt+F4",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "后退", accelerator: "Alt+Left", click: () => mainWindow?.webContents.goBack() },
        { label: "前进", accelerator: "Alt+Right", click: () => mainWindow?.webContents.goForward() },
        { label: "刷新页面", accelerator: "CmdOrCtrl+R", role: "reload" },
        { type: "separator" },
        { label: "全屏阅读", accelerator: "F11", role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  if (!fs.existsSync(iconPath)) return;
  const img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip("FlipDoc 轻翻 · 桌面端");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开 FlipDoc 轻翻",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "导入本地文件…",
        click: () => void pickAndImportLocalFiles(),
      },
      {
        label: "注册桌面与右键「发送到」菜单",
        click: () => createShortcuts(),
      },
      { type: "separator" },
      {
        label: "彻底退出",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, "assets", "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 600,
    title: "FlipDoc 轻翻",
    backgroundColor: "#F7F5F0",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(getServerUrl())) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  const startupFiles = extractSupportedFilesFromArgv(process.argv);
  if (startupFiles.length > 0) {
    void importAndOpenFiles(startupFiles);
  } else {
    void mainWindow.loadURL(getServerUrl());
  }
}

// Single-instance lock so right-clicking "Send To -> FlipDoc" reuses the open window!
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      const incoming = extractSupportedFilesFromArgv(argv);
      if (incoming.length > 0) {
        void importAndOpenFiles(incoming);
      }
    }
  });

  app.whenReady().then(() => {
    buildAppMenu();
    createTray();
    createWindow();
  });
}

// IPC Handlers for Studio Web UI
ipcMain.handle("flipdoc:scan-chat-files", async () => {
  const settings = loadSettings();
  const res = scanAllChatFiles(settings.customChatDirs || []);
  latestPathLookup = res.pathLookup;
  return {
    files: res.files,
    scannedDirs: res.scannedDirs,
  };
});

ipcMain.handle("flipdoc:pick-custom-folder", async () => {
  if (!mainWindow) return null;
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: "选择微信 WeChat Files 或 QQ FileRecv 文件夹",
    properties: ["openDirectory"],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;

  const settings = loadSettings();
  const nextDirs = Array.from(
    new Set([...(settings.customChatDirs || []), ...picked.filePaths])
  );
  saveSettings({ ...settings, customChatDirs: nextDirs });

  const res = scanAllChatFiles(nextDirs);
  latestPathLookup = res.pathLookup;
  return {
    files: res.files,
    scannedDirs: res.scannedDirs,
  };
});

ipcMain.handle("flipdoc:import-scanned-file", async (_ev, fileId) => {
  const fullPath = latestPathLookup.get(fileId);
  if (!fullPath || !fs.existsSync(fullPath)) {
    return { ok: false, error: "本地文件不存在或已被移动，请刷新列表" };
  }
  try {
    const slug = await uploadLocalFilesToServer([fullPath]);
    return { ok: true, slug };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "上传转换失败",
    };
  }
});

ipcMain.handle("flipdoc:install-shortcuts", async () => {
  return createShortcuts();
});

ipcMain.on("flipdoc:open-server-settings", async () => {
  if (!mainWindow) return;
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["永久云端 (Railway)", "本机服务 (localhost:3000)", "取消"],
    defaultId: 0,
    cancelId: 2,
    title: "切换连接服务器",
    message: `当前服务器：${getServerUrl()}`,
  });
  if (choice.response === 0) {
    const s = loadSettings();
    saveSettings({ ...s, serverUrl: DEFAULT_SERVER_URL });
    void mainWindow.loadURL(DEFAULT_SERVER_URL);
  } else if (choice.response === 1) {
    const s = loadSettings();
    saveSettings({ ...s, serverUrl: "http://localhost:3000" });
    void mainWindow.loadURL("http://localhost:3000");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
