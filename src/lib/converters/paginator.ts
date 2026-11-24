import sanitizeHtml from "sanitize-html";
import type { HtmlPageItem, SourceType, TocItem } from "@/types/document";

export function sanitizeEditorialHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "hr",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "del",
      "mark",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
      "img",
      "figure",
      "figcaption",
      "span",
      "div",
      "sup",
      "sub",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "class"],
      code: ["class"],
      pre: ["class"],
      span: ["class"],
      div: ["class"],
      hr: ["class"],
      th: ["align", "colspan", "rowspan"],
      td: ["align", "colspan", "rowspan"],
      h1: ["id"],
      h2: ["id"],
      h3: ["id"],
      h4: ["id"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface BlockItem {
  tag: string;
  html: string;
  text: string;
  weight: number;
  headingLevel?: number;
  isPageBreak?: boolean;
}

function measureTextLines(text: string, charsPerLine: number): number {
  let units = 0;
  for (const ch of text) {
    units += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1.0 : 0.55;
  }
  return Math.max(1, Math.ceil(units / charsPerLine));
}

function estimateBlockWeight(tag: string, html: string, text: string): number {
  // Page capacity = 100 units (~26 readable lines per magazine page)
  switch (tag) {
    case "h1":
      return 11 + measureTextLines(text, 16) * 5.2;
    case "h2":
      return 9 + measureTextLines(text, 20) * 4.5;
    case "h3":
      return 7 + measureTextLines(text, 24) * 4.0;
    case "h4":
    case "h5":
    case "h6":
      return 6 + measureTextLines(text, 26) * 3.6;
    case "pre": {
      const codeLines = Math.max(2, html.split("\n").length);
      return 8 + codeLines * 3.4;
    }
    case "blockquote":
      return 8 + measureTextLines(text, 28) * 3.8;
    case "table": {
      const rows = (html.match(/<tr\b/gi) || []).length || 2;
      return 10 + rows * 6.2;
    }
    case "ul":
    case "ol": {
      const items = html.match(/<li\b[\s\S]*?<\/li>/gi) || [];
      if (items.length === 0) return 8 + measureTextLines(text, 28) * 3.6;
      let total = 5;
      for (const li of items) {
        total += 1.6 + measureTextLines(stripTags(li), 27) * 3.5;
      }
      return total;
    }
    case "figure":
      return 42;
    case "hr":
      return 5;
    default: {
      if (/<img\b/i.test(html)) {
        return 42 + measureTextLines(text, 30) * 3.5;
      }
      return 4.2 + measureTextLines(text, 30) * 3.65;
    }
  }
}

function extractTopLevelBlocks(html: string): BlockItem[] {
  const blocks: BlockItem[] = [];
  const blockRegex =
    /<(h[1-6]|p|ul|ol|pre|blockquote|table|figure|div|hr)\b[^>]*>[\s\S]*?<\/\1>|<hr\b[^>]*\/?>/gi;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = blockRegex.exec(html)) !== null) {
    const gap = html.slice(lastIndex, match.index).trim();
    if (gap) {
      const plain = stripTags(gap);
      if (plain) {
        const wrapped = `<p>${gap}</p>`;
        blocks.push({
          tag: "p",
          html: wrapped,
          text: plain,
          weight: estimateBlockWeight("p", wrapped, plain),
        });
      }
    }
    lastIndex = blockRegex.lastIndex;

    const fullHtml = match[0].trim();
    const tagMatch = /^<([a-z0-9]+)/i.exec(fullHtml);
    const tag = (tagMatch ? tagMatch[1] : "p").toLowerCase();
    const text = stripTags(fullHtml);

    const isExplicitBreak =
      (tag === "hr" && /page-break/i.test(fullHtml)) ||
      (tag === "p" && /^---pagebreak---$/i.test(text));

    if (isExplicitBreak) {
      blocks.push({ tag: "hr", html: "", text: "", weight: 0, isPageBreak: true });
      continue;
    }

    if (tag === "p" && !text && !/<img\b/i.test(fullHtml)) {
      continue;
    }

    const headingMatch = /^h([1-6])$/.exec(tag);
    const headingLevel = headingMatch ? Number(headingMatch[1]) : undefined;

    // Split oversized lists across multiple blocks so a 40-item list never overflows a single page
    if ((tag === "ul" || tag === "ol") && estimateBlockWeight(tag, fullHtml, text) > 85) {
      const liMatches = fullHtml.match(/<li\b[\s\S]*?<\/li>/gi) || [];
      if (liMatches.length > 3) {
        let chunk: string[] = [];
        let chunkWeight = 5;
        for (const li of liMatches) {
          const liW = 1.6 + measureTextLines(stripTags(li), 27) * 3.5;
          if (chunk.length > 0 && chunkWeight + liW > 75) {
            const chunkHtml = `<${tag}>${chunk.join("")}</${tag}>`;
            const chunkText = stripTags(chunkHtml);
            blocks.push({
              tag,
              html: chunkHtml,
              text: chunkText,
              weight: chunkWeight,
            });
            chunk = [];
            chunkWeight = 5;
          }
          chunk.push(li);
          chunkWeight += liW;
        }
        if (chunk.length > 0) {
          const chunkHtml = `<${tag}>${chunk.join("")}</${tag}>`;
          const chunkText = stripTags(chunkHtml);
          blocks.push({
            tag,
            html: chunkHtml,
            text: chunkText,
            weight: chunkWeight,
          });
        }
        continue;
      }
    }

    blocks.push({
      tag,
      html: fullHtml,
      text,
      weight: estimateBlockWeight(tag, fullHtml, text),
      headingLevel,
    });
  }

  const tail = html.slice(lastIndex).trim();
  if (tail) {
    const plain = stripTags(tail);
    if (plain) {
      const wrapped = `<p>${tail}</p>`;
      blocks.push({
        tag: "p",
        html: wrapped,
        text: plain,
        weight: estimateBlockWeight("p", wrapped, plain),
      });
    }
  }

  return blocks;
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function paginateEditorialHtml(params: {
  html: string;
  title: string;
  description: string;
  sourceType: SourceType;
  includeCoverPage?: boolean;
}): { pages: HtmlPageItem[]; toc: TocItem[]; autoDescription: string } {
  const cleanHtml = sanitizeEditorialHtml(params.html);
  const blocks = extractTopLevelBlocks(cleanHtml);

  const firstParagraph = blocks.find((b) => b.tag === "p" && b.text.length >= 10)?.text || "";
  const autoDescription =
    params.description.trim() || firstParagraph.slice(0, 120) || "FlipDoc 轻翻精排电子画册";

  const PAGE_CAPACITY = 94;
  const pages: HtmlPageItem[] = [];
  const toc: TocItem[] = [];

  const includeCover = params.includeCoverPage !== false;
  if (includeCover) {
    const badgeLabel =
      params.sourceType === "docx"
        ? "WORD · 精排版"
        : params.sourceType === "markdown"
          ? "EDITORIAL · 精读本"
          : "FLIPDOC · 画册";

    const coverHtml = `
      <div class="fd-cover-page">
        <div class="fd-cover-top">
          <span class="fd-cover-badge">${escapeHtmlText(badgeLabel)}</span>
          <span class="fd-cover-mark">FLIPDOC</span>
        </div>
        <div class="fd-cover-center">
          <div class="fd-cover-rule"></div>
          <h1 class="fd-cover-title">${escapeHtmlText(params.title)}</h1>
          <p class="fd-cover-desc">${escapeHtmlText(autoDescription)}</p>
        </div>
        <div class="fd-cover-bottom">
          <span>向右翻页或滑动开始阅读</span>
          <span class="fd-cover-date">${new Date().toLocaleDateString("zh-CN")}</span>
        </div>
      </div>
    `;
    pages.push({
      index: 1,
      html: coverHtml,
      sectionTitle: params.title,
      isCover: true,
      slideStyle: "editorial",
    });
  }

  let currentBlocks: BlockItem[] = [];
  let currentWeight = 0;
  let currentSection = params.title;

  const flushPage = () => {
    if (currentBlocks.length === 0) return;
    const pageIndex = pages.length + 1;
    const pageHtml = currentBlocks.map((b) => b.html).join("\n");

    for (const b of currentBlocks) {
      if (b.headingLevel && b.headingLevel <= 3 && b.text) {
        toc.push({
          id: `toc-${toc.length + 1}`,
          title: b.text.slice(0, 60),
          page: pageIndex,
          level: b.headingLevel,
        });
      }
    }

    pages.push({
      index: pageIndex,
      html: pageHtml,
      sectionTitle: currentSection,
      slideStyle: "editorial",
    });

    currentBlocks = [];
    currentWeight = 0;
  };

  // Skip duplicating the exact document title if block[0] is an H1 identical to title and cover is included
  let startIndex = 0;
  if (
    includeCover &&
    blocks.length > 1 &&
    blocks[0].headingLevel === 1 &&
    blocks[0].text.trim() === params.title.trim()
  ) {
    startIndex = 1;
  }

  for (let i = startIndex; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.isPageBreak) {
      flushPage();
      continue;
    }

    // Start new page on major H1 chapter if current page already has substantial content
    if (block.headingLevel === 1 && currentWeight >= 36 && currentBlocks.length > 0) {
      flushPage();
    }

    // Anti-orphan protection: if this block is a heading, check combined height with the next block
    const nextBlock = blocks[i + 1];
    const effectiveWeight =
      block.headingLevel && block.headingLevel <= 3 && nextBlock && !nextBlock.isPageBreak
        ? block.weight + Math.min(nextBlock.weight, 26)
        : block.weight;

    if (currentBlocks.length > 0 && currentWeight + effectiveWeight > PAGE_CAPACITY) {
      flushPage();
    }

    if (block.headingLevel && block.headingLevel <= 2 && block.text) {
      currentSection = block.text.slice(0, 36);
    }

    currentBlocks.push(block);
    currentWeight += block.weight;
  }

  flushPage();

  if (pages.length === 0) {
    pages.push({
      index: 1,
      html: `<p>文档内容为空。</p>`,
      sectionTitle: params.title,
      slideStyle: "editorial",
    });
  }

  return { pages, toc, autoDescription };
}
