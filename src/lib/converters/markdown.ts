import fs from "node:fs";
import path from "node:path";
import hljs from "highlight.js";
import { Marked } from "marked";
import { generateEditorialCover } from "@/lib/cover-generator";
import { getDocDir, writeDocJson } from "@/lib/storage";
import type { PageTheme } from "@/types/document";
import { paginateEditorialHtml } from "./paginator";
import type { ConvertedDocResult } from "./types";

function createMarkedInstance(): Marked {
  const marked = new Marked({
    gfm: true,
    breaks: true,
  });

  marked.use({
    renderer: {
      code({ text, lang }) {
        const language = lang && hljs.getLanguage(lang) ? lang : undefined;
        const highlighted = language
          ? hljs.highlight(text, { language }).value
          : hljs.highlightAuto(text).value;
        return `<pre class="hljs"><code class="language-${language || "text"}">${highlighted}</code></pre>`;
      },
    },
  });

  return marked;
}

export async function convertMarkdownBuffer(params: {
  docId: string;
  buffer: Buffer;
  originalFilename: string;
  title?: string;
  description?: string;
  theme?: PageTheme;
}): Promise<ConvertedDocResult> {
  const rawText = params.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const docDir = getDocDir(params.docId);
  fs.writeFileSync(path.join(docDir, "source.md"), rawText, "utf8");

  const h1Match = /^#\s+(.+)$/m.exec(rawText);
  const fallbackName = path.parse(params.originalFilename).name;
  const resolvedTitle = params.title?.trim() || h1Match?.[1]?.trim() || fallbackName || "未命名文档";

  // Support explicit page break marker ---pagebreak---
  const preparedText = rawText.replace(/^\s*---\s*pagebreak\s*---\s*$/gim, '\n<hr class="page-break" />\n');

  const marked = createMarkedInstance();
  const rawHtml = await marked.parse(preparedText);

  const { pages, toc, autoDescription } = paginateEditorialHtml({
    html: rawHtml,
    title: resolvedTitle,
    description: params.description || "",
    sourceType: "markdown",
    includeCoverPage: true,
  });

  writeDocJson(params.docId, "pages.json", pages);

  const coverFile = await generateEditorialCover({
    docId: params.docId,
    title: resolvedTitle,
    description: autoDescription,
    sourceType: "markdown",
    pageCount: pages.length,
    theme: params.theme || "warm-paper",
    isLandscape: false,
  });

  return {
    title: resolvedTitle,
    description: autoDescription,
    sourceType: "markdown",
    renderMode: "html-pages",
    converterNote: "Markdown 杂志精排自动分页",
    pageCount: pages.length,
    pageWidth: 840,
    pageHeight: 1188,
    coverFile,
    pdfFile: null,
    toc,
  };
}
