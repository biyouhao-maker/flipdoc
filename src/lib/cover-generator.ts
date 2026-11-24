import path from "node:path";
import sharp from "sharp";
import type { PageTheme, SourceType } from "@/types/document";
import { getDocDir } from "./storage";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return [];
  const lines: string[] = [];
  let current = "";
  let weight = 0;

  for (const ch of cleaned) {
    const charWeight = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1.0 : 0.56;
    if (weight + charWeight > maxCharsPerLine && current) {
      lines.push(current.trim());
      if (lines.length >= maxLines) break;
      current = ch;
      weight = charWeight;
    } else {
      current += ch;
      weight += charWeight;
    }
  }
  if (lines.length < maxLines && current.trim()) {
    lines.push(current.trim());
  }
  if (lines.length === maxLines && cleaned.length > lines.join("").length + 2) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.slice(0, Math.max(1, last.length - 1)) + "…";
  }
  return lines;
}

const PALETTES: Record<
  SourceType,
  { bg: string; bg2: string; accent: string; ink: string; muted: string; badge: string }
> = {
  pdf: {
    bg: "#F8F4EC",
    bg2: "#EFE8DA",
    accent: "#C85A32",
    ink: "#1E1A16",
    muted: "#6E655A",
    badge: "PDF · 电子画册",
  },
  docx: {
    bg: "#F4F6F8",
    bg2: "#E7EDF3",
    accent: "#28537A",
    ink: "#17212B",
    muted: "#5A6B7C",
    badge: "WORD · 精排版",
  },
  pptx: {
    bg: "#181C20",
    bg2: "#242A30",
    accent: "#E07A52",
    ink: "#F7F5F0",
    muted: "#A7A299",
    badge: "PPT · 演示画册",
  },
  markdown: {
    bg: "#F9F6EE",
    bg2: "#EFE9DC",
    accent: "#2D5A47",
    ink: "#1B1A17",
    muted: "#6C665B",
    badge: "EDITORIAL · 精读本",
  },
  images: {
    bg: "#1E1B18",
    bg2: "#2C2723",
    accent: "#D4A359",
    ink: "#FAF7F2",
    muted: "#B5ACA0",
    badge: "LOOKBOOK · 图集",
  },
};

export async function generateEditorialCover(params: {
  docId: string;
  title: string;
  description: string;
  sourceType: SourceType;
  pageCount: number;
  theme?: PageTheme;
  isLandscape?: boolean;
}): Promise<string> {
  const width = params.isLandscape ? 1200 : 840;
  const height = params.isLandscape ? 750 : 1120;

  let palette = PALETTES[params.sourceType] || PALETTES.markdown;
  if (params.theme === "dark-ink") {
    palette = {
      bg: "#17181A",
      bg2: "#232529",
      accent: "#D98A54",
      ink: "#F6F3EC",
      muted: "#9E9990",
      badge: palette.badge,
    };
  }

  const titleLines = wrapText(params.title || "未命名画册", params.isLandscape ? 18 : 11, 3);
  const descLines = wrapText(
    params.description || "FlipDoc 轻翻 · 微信翻页阅读优化版本",
    params.isLandscape ? 32 : 20,
    3
  );

  const titleSize = params.isLandscape ? 54 : 58;
  const titleStartY = params.isLandscape ? 270 : 340;
  const lineGap = params.isLandscape ? 74 : 80;

  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="84" y="${titleStartY + i * lineGap}" fill="${palette.ink}" font-size="${titleSize}" font-weight="700" font-family="'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif">${escapeXml(line)}</text>`
    )
    .join("\n");

  const descStartY = titleStartY + Math.max(1, titleLines.length) * lineGap + 34;
  const descSvg = descLines
    .map(
      (line, i) =>
        `<text x="84" y="${descStartY + i * 38}" fill="${palette.muted}" font-size="24" font-weight="400" font-family="'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif">${escapeXml(line)}</text>`
    )
    .join("\n");

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg}" />
        <stop offset="100%" stop-color="${palette.bg2}" />
      </linearGradient>
      <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.16" />
        <stop offset="55%" stop-color="#000000" stop-opacity="0.03" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)" />
    <!-- Book spine crease -->
    <rect x="0" y="0" width="38" height="${height}" fill="url(#spine)" />
    <line x1="38" y1="0" x2="38" y2="${height}" stroke="${palette.ink}" stroke-opacity="0.08" stroke-width="1" />

    <!-- Subtle editorial frame -->
    <rect x="64" y="64" width="${width - 128}" height="${height - 128}" fill="none" stroke="${palette.ink}" stroke-opacity="0.1" stroke-width="1.5" rx="4" />

    <!-- Geometric editorial motif -->
    <circle cx="${width - 130}" cy="170" r="140" fill="${palette.accent}" fill-opacity="0.09" />
    <circle cx="${width - 70}" cy="240" r="78" fill="${palette.accent}" fill-opacity="0.14" />

    <!-- Format badge -->
    <rect x="84" y="108" width="236" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.14" />
    <circle cx="108" cy="130" r="5" fill="${palette.accent}" />
    <text x="124" y="138" fill="${palette.accent}" font-size="18" font-weight="600" letter-spacing="1.5" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">${escapeXml(palette.badge)}</text>

    <!-- Accent rule -->
    <rect x="84" y="${titleStartY - 82}" width="64" height="5" rx="2.5" fill="${palette.accent}" />

    <!-- Title & description -->
    ${titleSvg}
    ${descSvg}

    <!-- Footer metadata -->
    <line x1="84" y1="${height - 146}" x2="${width - 84}" y2="${height - 146}" stroke="${palette.ink}" stroke-opacity="0.12" stroke-width="1" />
    <text x="84" y="${height - 102}" fill="${palette.muted}" font-size="20" font-weight="500" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">共 ${params.pageCount} 页 · 微信翻页阅读</text>
    <text x="${width - 84}" y="${height - 102}" text-anchor="end" fill="${palette.accent}" font-size="20" font-weight="700" letter-spacing="2" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif">FLIPDOC 轻翻</text>
  </svg>`;

  const coverFile = "cover.png";
  const outPath = path.join(getDocDir(params.docId), coverFile);
  await sharp(Buffer.from(svg)).png({ quality: 92 }).toFile(outPath);
  return coverFile;
}
