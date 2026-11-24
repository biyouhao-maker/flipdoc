import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { convertMarkdownBuffer } from "./converters/markdown";
import { convertPdfBuffer } from "./converters/pdf";
import {
  generateDocId,
  getMeta,
  insertDocument,
  listDocuments,
  setMeta,
} from "./db";
import { hashPasscode } from "./security";

const DEMO_MARKDOWN = `# FlipDoc 轻翻 · 微信翻页体验指南

把日常写完的方案、周报、作品集与产品手册，一键转成适合微信直接翻页浏览的轻画册。无需对方安装任何 App，点开链接或长按二维码即可沉浸阅读。

## 为什么传统文档在微信里不好看？

直接把 PDF、Word 或 PPT 文件发进微信群，阅读者通常会遇到四个常见困扰：

- **字体过小**：A4 版面塞进手机竖屏，必须反复双指放大、左右拖拽才能看清正文。
- **缺少翻页节奏**：只能上下无尽滚动，汇报重点、章节结构与展示质感全部流失。
- **容易跳转中断**：部分格式会唤起外部软件，对方嫌麻烦干脆不点开。
- **分享卡片单调**：裸文件在群聊里缺少封面视觉与摘要引导，打开率低。

> 好的呈现方式本身就是说服力。当一份方案像精装杂志一样在指尖翻开，阅读意愿会立刻不同。

## 核心能力一览

| 能力模块 | 支持格式 / 交互 | 微信场景优势 |
| --- | --- | --- |
| 多格式导入 | PDF / Word / PPT / Markdown / 图集 | 拖入即转，自动生成封面与目录 |
| 双模式翻页 | 3D 仿真翻书 ↔ 丝滑滑动 | 电脑像画册，手机跟手滑动不卡顿 |
| 细节阅读 | 双指缩放、双击放大、目录与缩略图 | 复杂图表小字也能轻松看清 |
| 转发与风控 | 分享海报二维码、访问密码、过期时间 | 零公众号门槛发群/朋友圈，私密可控 |

## 三步完成分享

### 第一步：拖入原文件

直接把做好的文件拖进首页工作台即可。针对 Word 文档，可以在「自动高保真（保留原版式）」与「手机精排分页（自动重排适配手机阅读）」之间自由选择。

### 第二步：微调封面与权限

转换完成后，右侧抽屉会自动生成封面、标题与摘要。你可以按需开启：

1. **访问密码**：发给客户或内部评审时输入口令才可查看。
2. **链接有效期**：支持 24 小时、7 天、30 天或永久有效，过期自动关闭。
3. **默认翻页方式**：推荐保持「自适应」，电脑自动双页翻书，微信手机端丝滑滑动。

### 第三步：微信分享与海报卡片

点击文档卡片上的「分享」，除了直接复制阅读链接外，还能一键生成带封面与二维码的高颜值**微信分享海报**。发到微信群或朋友圈，别人长按识别即可直接翻页阅读。

\`\`\`bash
# 如需在公网服务器开启管理页口令与微信 JS-SDK，只需配置环境变量：
STUDIO_PASSCODE=your-admin-passcode
NEXT_PUBLIC_SITE_URL=https://docs.yourdomain.com
WECHAT_APP_ID=wx_optional_appid
WECHAT_APP_SECRET=optional_secret
\`\`\`

## 写在最后

现在试试点击右上角的「仿真翻书 / 滑动阅读」切换体验，或者打开底部的「目录」和「缩略图」快速跳页，也可以点「导出卡片图」直接保存高清图片发微信！
`;

const DEMO_PROTECTED_MD = `# Q4 客户保密合作方案（加密演示）

这是一份开启了 **访问密码（口令：8888）** 与 **30 天有效期** 的演示文档，用来体验私密文件的权限保护流程。

## 权限保护如何工作？

- 未解锁前，服务端会拦截正文内容与 PDF/图片源文件接口，不会把敏感数据提前下发到浏览器。
- 输入正确口令后，服务端签发加密 HttpOnly 会话凭证，刷新页面无需重复输入。
- 超过设定的过期时间后，链接自动显示失效提示，无法继续浏览。

## 典型使用场景

1. **商务报价与定制方案**：发给指定客户查看，设置 7 天有效，避免长期外传。
2. **内部复盘与财务简报**：设置团队统一口令，在微信群里安心翻阅。
3. **作品集定向投递**：为不同面试官或合作方生成专属链接与封面标题。

> 提示：在工作台点击任意画册卡片的「编辑设置」，随时可以修改、更换或关闭访问密码与过期时间。
`;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderSlidePng(slide: {
  num: string;
  kicker: string;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: string;
  dark?: boolean;
  metrics?: Array<{ label: string; value: string }>;
}): Promise<Buffer> {
  const bg = slide.dark ? "#16191D" : "#F8F5EE";
  const cardBg = slide.dark ? "#22272E" : "#FFFFFF";
  const ink = slide.dark ? "#F6F3EC" : "#1A1816";
  const muted = slide.dark ? "#A6A095" : "#6B645A";
  const border = slide.dark ? "#2E353F" : "#E5DFD3";

  const bulletsSvg = slide.bullets
    .map(
      (b, idx) => `
      <circle cx="110" cy="${375 + idx * 72}" r="6" fill="${slide.accent}" />
      <text x="134" y="${384 + idx * 72}" fill="${ink}" font-size="28" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(b)}</text>
    `
    )
    .join("");

  const metricsSvg = (slide.metrics || [])
    .map(
      (m, idx) => `
      <rect x="${96 + idx * 365}" y="470" width="335" height="156" rx="18" fill="${cardBg}" stroke="${border}" stroke-width="2" />
      <text x="${128 + idx * 365}" y="534" fill="${slide.accent}" font-size="46" font-weight="700" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(m.value)}</text>
      <text x="${128 + idx * 365}" y="586" fill="${muted}" font-size="19" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(m.label)}</text>
    `
    )
    .join("");

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="${bg}" />
    <circle cx="1180" cy="110" r="220" fill="${slide.accent}" fill-opacity="0.11" />
    <circle cx="1120" cy="640" r="140" fill="${slide.accent}" fill-opacity="0.08" />

    <rect x="96" y="76" width="8" height="36" rx="4" fill="${slide.accent}" />
    <text x="122" y="103" fill="${slide.accent}" font-size="22" font-weight="700" letter-spacing="2" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(slide.kicker)}</text>
    <text x="1184" y="103" text-anchor="end" fill="${muted}" font-size="22" font-weight="600" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(slide.num)}</text>

    <text x="96" y="212" fill="${ink}" font-size="54" font-weight="700" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(slide.title)}</text>
    <text x="96" y="272" fill="${muted}" font-size="26" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(slide.subtitle)}</text>
    <line x1="96" y1="312" x2="1184" y2="312" stroke="${border}" stroke-width="2" />

    ${bulletsSvg}
    ${metricsSvg}

    <text x="96" y="672" fill="${muted}" font-size="18" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">FLIPDOC 轻翻 · 16:9 高清演示画册示例</text>
    <text x="1184" y="672" text-anchor="end" fill="${muted}" font-size="18" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">支持双指缩放与 3D 翻页</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
}

async function buildDemoPresentationPdf(): Promise<Buffer> {
  const slides = [
    {
      num: "01 / 04",
      kicker: "DEMO DECK · 演示画册",
      title: "产品季度汇报 · 轻翻版",
      subtitle: "将 16:9 汇报 PPT / PDF 变成微信里顺手翻阅的高清画册",
      bullets: [],
      metrics: [
        { value: "4 格式", label: "PDF / Word / PPT / MD 全支持" },
        { value: "双模式", label: "3D 翻书与手机滑动自由切换" },
        { value: "零安装", label: "微信内点开链接即可沉浸翻页" },
      ],
      accent: "#D4653B",
      dark: true,
    },
    {
      num: "02 / 04",
      kicker: "USER EXPERIENCE",
      title: "专为微信移动端打磨的交互",
      subtitle: "拒绝传统文档小字难看与误触返回",
      bullets: [
        "左右跟手滑动切换页面，带弹性阻尼与页码进度条",
        "支持双指捏合缩放与双击放大，轻松查看图表数据细节",
        "轻点画面中央自动隐显顶栏底栏，全屏沉浸不遮挡内容",
        "内置目录抽屉与缩略图导航，长报告秒速定位重点页",
      ],
      accent: "#2D5A47",
      dark: false,
    },
    {
      num: "03 / 04",
      kicker: "CONVERSION PIPELINE",
      title: "本地高保真与云端零依赖兼顾",
      subtitle: "自动识别环境能力，输出清晰稳定的浏览体验",
      bullets: [
        "PDF 原生高精度渲染，完整支持中文字体 CMap 与缩放清晰度",
        "检测到本机 LibreOffice 时自动将 Word/PPT 无损还原为高清页面",
        "无 Office 环境自动切换内置精排引擎，开箱即用不报错",
        "一键导出高清分页卡片图，未部署公网也能直接发微信查看",
      ],
      accent: "#28537A",
      dark: false,
    },
    {
      num: "04 / 04",
      kicker: "SHARE & CONTROL",
      title: "分享可控，随时随地局域网扫码预览",
      subtitle: "内置微信分享海报生成、访问口令与过期机制",
      bullets: [],
      metrics: [
        { value: "扫码直达", label: "自动识别本机局域网 IP 供手机扫码" },
        { value: "密码保护", label: "服务端校验口令，私密方案不泄露" },
        { value: "PWA 应用", label: "手机添加到主屏幕即享全屏 App 体验" },
      ],
      accent: "#C85A32",
      dark: true,
    },
  ];

  const pdfDoc = await PDFDocument.create();
  for (const s of slides) {
    const pngBytes = await renderSlidePng(s);
    const pngImg = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([960, 540]);
    page.drawImage(pngImg, { x: 0, y: 0, width: 960, height: 540 });
  }
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

let seedPromise: Promise<void> | null = null;

export async function ensureDemoSeeded(force = false): Promise<void> {
  if (!force && getMeta("demo_seeded_v1") === "1") return;
  if (!force && listDocuments().length > 0) {
    setMeta("demo_seeded_v1", "1");
    return;
  }

  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      // 1. Editorial Markdown Guide
      const mdDocId = generateDocId();
      const mdResult = await convertMarkdownBuffer({
        docId: mdDocId,
        buffer: Buffer.from(DEMO_MARKDOWN, "utf8"),
        originalFilename: "FlipDoc-轻翻体验指南.md",
        title: "FlipDoc 轻翻 · 微信翻页体验指南",
        description: "一份可直接翻阅的杂志精排示例：体验 3D 翻书、手机滑动、目录跳页与微信分享海报。",
        theme: "warm-paper",
      });
      insertDocument({
        id: mdDocId,
        slug: force ? `flipdoc-guide-${mdDocId.slice(0, 4)}` : "flipdoc-guide",
        title: mdResult.title,
        description: mdResult.description,
        originalFilename: "FlipDoc-轻翻体验指南.md",
        sourceType: mdResult.sourceType,
        renderMode: mdResult.renderMode,
        converterNote: mdResult.converterNote,
        pageCount: mdResult.pageCount,
        pageWidth: mdResult.pageWidth,
        pageHeight: mdResult.pageHeight,
        defaultViewMode: "auto",
        theme: "warm-paper",
        coverFile: mdResult.coverFile,
        pdfFile: mdResult.pdfFile,
        toc: mdResult.toc,
        passcodeHash: null,
        passcodeHint: "",
        expiresAt: null,
      });

      // 2. Real 16:9 Landscape PDF Deck
      const pdfDocId = generateDocId();
      const pdfBuffer = await buildDemoPresentationPdf();
      const pdfResult = await convertPdfBuffer({
        docId: pdfDocId,
        buffer: pdfBuffer,
        originalFilename: "产品季度汇报-轻翻版.pdf",
        title: "产品季度汇报 · 16:9 演示画册",
        description: "横版 PPT/PDF 翻页示例：自动适配宽屏画幅，支持双指放大查看细节与缩略图速览。",
        theme: "dark-ink",
        tocOverride: [
          { id: "s1", title: "01 · 产品季度汇报封面", page: 1, level: 1 },
          { id: "s2", title: "02 · 专为微信移动端打磨的交互", page: 2, level: 2 },
          { id: "s3", title: "03 · 多格式转换流水线", page: 3, level: 2 },
          { id: "s4", title: "04 · 分享海报、权限与 PWA 体验", page: 4, level: 2 },
        ],
      });
      insertDocument({
        id: pdfDocId,
        slug: force ? `q4-deck-demo-${pdfDocId.slice(0, 4)}` : "q4-deck-demo",
        title: pdfResult.title,
        description: pdfResult.description,
        originalFilename: "产品季度汇报-轻翻版.pdf",
        sourceType: "pdf",
        renderMode: "pdf",
        converterNote: "PDF 16:9 高清演示画册",
        pageCount: pdfResult.pageCount,
        pageWidth: pdfResult.pageWidth,
        pageHeight: pdfResult.pageHeight,
        defaultViewMode: "auto",
        theme: "dark-ink",
        coverFile: pdfResult.coverFile,
        pdfFile: pdfResult.pdfFile,
        toc: pdfResult.toc,
        passcodeHash: null,
        passcodeHint: "",
        expiresAt: null,
      });

      // 3. Passcode-protected + 30-day expiry Demo
      const lockDocId = generateDocId();
      const lockResult = await convertMarkdownBuffer({
        docId: lockDocId,
        buffer: Buffer.from(DEMO_PROTECTED_MD, "utf8"),
        originalFilename: "Q4客户保密合作方案.md",
        title: "Q4 客户保密合作方案（加密演示）",
        description: "演示访问密码与过期时间保护机制，测试口令：8888。",
        theme: "editorial",
      });
      const expires30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      insertDocument({
        id: lockDocId,
        slug: force ? `confidential-demo-${lockDocId.slice(0, 4)}` : "confidential-demo",
        title: lockResult.title,
        description: lockResult.description,
        originalFilename: "Q4客户保密合作方案.md",
        sourceType: "markdown",
        renderMode: "html-pages",
        converterNote: lockResult.converterNote,
        pageCount: lockResult.pageCount,
        pageWidth: lockResult.pageWidth,
        pageHeight: lockResult.pageHeight,
        defaultViewMode: "auto",
        theme: "editorial",
        coverFile: lockResult.coverFile,
        pdfFile: null,
        toc: lockResult.toc,
        passcodeHash: hashPasscode("8888"),
        passcodeHint: "演示口令：8888",
        expiresAt: expires30d,
      });

      setMeta("demo_seeded_v1", "1");
    } finally {
      seedPromise = null;
    }
  })();

  return seedPromise;
}
