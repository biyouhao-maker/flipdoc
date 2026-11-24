"use client";

import type { HtmlPageItem, PageTheme, TocItem } from "@/types/document";

export type EbookFontFamily = "serif" | "sans";

export interface RepaginateOptions {
  sourcePages: HtmlPageItem[];
  docTitle: string;
  containerWidth: number;
  containerHeight: number;
  fontSize: number; // px, e.g. 15, 17, 19, 21
  fontFamily: EbookFontFamily;
  theme: PageTheme;
  isMobileFullBleed: boolean;
}

export interface RepaginatedResult {
  pages: HtmlPageItem[];
  toc: TocItem[];
}

function measureContentHeight(el: HTMLElement): number {
  return Math.ceil(el.getBoundingClientRect().height);
}

function splitOversizedBlock(
  el: HTMLElement,
  maxContentHeight: number,
  measureInner: HTMLElement
): HTMLElement[] {
  const tag = el.tagName.toLowerCase();
  if (tag === "ul" || tag === "ol") {
    const items = Array.from(el.children) as HTMLElement[];
    if (items.length <= 1) return [el];
    const chunks: HTMLElement[] = [];
    let currentList = document.createElement(tag);
    currentList.className = el.className;

    for (const li of items) {
      const cloneLi = li.cloneNode(true) as HTMLElement;
      currentList.appendChild(cloneLi);
      measureInner.innerHTML = "";
      measureInner.appendChild(currentList.cloneNode(true));
      if (measureContentHeight(measureInner) > maxContentHeight && currentList.children.length > 1) {
        currentList.removeChild(cloneLi);
        chunks.push(currentList);
        currentList = document.createElement(tag);
        currentList.className = el.className;
        currentList.appendChild(cloneLi);
      }
    }
    if (currentList.children.length > 0) {
      chunks.push(currentList);
    }
    return chunks;
  }

  return [el];
}

/**
 * Dynamically repaginates reflowable HTML content to fit the exact pixel dimensions
 * of the current viewport + user font size/family, filling each page cleanly with
 * ZERO inner scrollbars — just like Apple Books!
 */
export function repaginateEbookToViewport(opts: RepaginateOptions): RepaginatedResult {
  const {
    sourcePages,
    docTitle,
    containerWidth,
    containerHeight,
    fontSize,
    fontFamily,
    theme,
    isMobileFullBleed,
  } = opts;

  if (
    typeof document === "undefined" ||
    sourcePages.length === 0 ||
    containerWidth < 180 ||
    containerHeight < 220
  ) {
    return { pages: sourcePages, toc: [] };
  }

  // Keep PPTX built-in fixed slides untouched
  if (sourcePages.some((p) => p.slideStyle === "slide")) {
    return {
      pages: sourcePages,
      toc: sourcePages.map((p) => ({
        id: `slide-${p.index}`,
        title: p.sectionTitle || `第 ${p.index} 页`,
        page: p.index,
        level: p.index === 1 ? 1 : 2,
      })),
    };
  }

  const coverPage = sourcePages.find((p) => p.isCover);
  const contentPages = sourcePages.filter((p) => !p.isCover);
  const combinedHtml = contentPages.map((p) => p.html).join("\n");

  const parserHost = document.createElement("div");
  parserHost.innerHTML = combinedHtml;
  const rawNodes = Array.from(parserHost.children) as HTMLElement[];

  if (rawNodes.length === 0) {
    return { pages: sourcePages, toc: [] };
  }

  // Build offscreen measurement page matching the exact sheet dimensions & styles
  const stage = document.createElement("div");
  stage.style.position = "fixed";
  stage.style.left = "-99999px";
  stage.style.top = "0";
  stage.style.width = `${containerWidth}px`;
  stage.style.height = `${containerHeight}px`;
  stage.style.visibility = "hidden";
  stage.style.pointerEvents = "none";
  stage.style.zIndex = "-1";

  const sheet = document.createElement("div");
  sheet.className = `fd-page-sheet ${isMobileFullBleed ? "is-ebook-mobile" : ""}`;
  sheet.setAttribute("data-theme", theme);
  sheet.setAttribute("data-font", fontFamily);

  const header = document.createElement("div");
  header.className = "fd-page-header";
  header.innerHTML = isMobileFullBleed
    ? `<span>${docTitle}</span>`
    : `<span>${docTitle}</span><span>FLIPDOC</span>`;

  const measureBody = document.createElement("div");
  measureBody.className = "fd-page-body fd-prose";
  measureBody.style.fontSize = `${fontSize}px`;
  measureBody.style.overflow = "hidden";

  // Flow-root inner wrapper measures TRUE natural block height (including margins) starting from 0px!
  const measureInner = document.createElement("div");
  measureInner.style.display = "flow-root";
  measureInner.style.width = "100%";
  measureBody.appendChild(measureInner);

  const footer = document.createElement("div");
  footer.className = "fd-page-footer";
  footer.innerHTML = isMobileFullBleed
    ? `<div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:6px;"><div style="height:2px;width:100%"></div><span>第 1 页 · 共 1 页</span></div>`
    : `<span>${docTitle}</span><span>01 / 01</span>`;

  sheet.appendChild(header);
  sheet.appendChild(measureBody);
  sheet.appendChild(footer);
  stage.appendChild(sheet);
  document.body.appendChild(stage);

  try {
    const computed = window.getComputedStyle(measureBody);
    const padTop = Number.parseFloat(computed.paddingTop) || 0;
    const padBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const maxContentHeight = Math.max(
      120,
      Math.floor(measureBody.clientHeight - padTop - padBottom) - 4
    );

    // Pre-split any oversized lists so they flow across pages gracefully
    const blocks: HTMLElement[] = [];
    for (const node of rawNodes) {
      measureInner.innerHTML = "";
      measureInner.appendChild(node.cloneNode(true));
      if (measureContentHeight(measureInner) > maxContentHeight) {
        const split = splitOversizedBlock(node, maxContentHeight, measureInner);
        blocks.push(...split);
      } else {
        blocks.push(node);
      }
    }

    const resultPages: HtmlPageItem[] = [];
    const toc: TocItem[] = [];

    if (coverPage) {
      resultPages.push({
        ...coverPage,
        index: 1,
      });
    }

    let currentNodes: HTMLElement[] = [];
    let currentSection = docTitle;

    const flush = () => {
      if (currentNodes.length === 0) return;
      const pageNum = resultPages.length + 1;
      for (const el of currentNodes) {
        const hm = /^H([1-3])$/.exec(el.tagName);
        if (hm) {
          const text = (el.textContent || "").trim();
          if (text) {
            toc.push({
              id: `ebook-toc-${toc.length + 1}`,
              title: text.slice(0, 60),
              page: pageNum,
              level: Number(hm[1]),
            });
          }
        }
      }

      resultPages.push({
        index: pageNum,
        html: currentNodes.map((n) => n.outerHTML).join("\n"),
        sectionTitle: currentSection,
        slideStyle: "editorial",
      });
      currentNodes = [];
      measureInner.innerHTML = "";
    };

    measureInner.innerHTML = "";

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const tag = block.tagName.toUpperCase();

      if (tag === "HR" && block.classList.contains("page-break")) {
        flush();
        continue;
      }

      // Start a fresh page on major H1 if current page already has substantial content
      if (
        tag === "H1" &&
        currentNodes.length > 0 &&
        measureContentHeight(measureInner) > maxContentHeight * 0.45
      ) {
        flush();
      }

      const clone = block.cloneNode(true) as HTMLElement;
      measureInner.appendChild(clone);

      const overflows = measureContentHeight(measureInner) > maxContentHeight;

      if (overflows && currentNodes.length > 0) {
        measureInner.removeChild(clone);
        flush();
        measureInner.appendChild(clone);
      }

      // Anti-orphan heading protection: never leave H1–H3 dangling alone at page bottom
      const isHeading = tag === "H1" || tag === "H2" || tag === "H3";
      const nextBlock = blocks[i + 1];
      if (isHeading && nextBlock && currentNodes.length > 0) {
        const peek = nextBlock.cloneNode(true) as HTMLElement;
        measureInner.appendChild(peek);
        const orphanOverflow = measureContentHeight(measureInner) > maxContentHeight;
        measureInner.removeChild(peek);
        if (orphanOverflow) {
          measureInner.removeChild(clone);
          flush();
          measureInner.appendChild(clone);
        }
      }

      if (tag === "H1" || tag === "H2") {
        const headingText = (block.textContent || "").trim();
        if (headingText) currentSection = headingText.slice(0, 36);
      }

      currentNodes.push(block);
    }

    flush();

    return { pages: resultPages, toc };
  } finally {
    document.body.removeChild(stage);
  }
}
