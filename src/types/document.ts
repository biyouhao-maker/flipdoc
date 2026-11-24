export type SourceType = "pdf" | "docx" | "pptx" | "markdown" | "images";

export type RenderMode = "pdf" | "html-pages" | "images";

export type ViewMode = "auto" | "flip" | "swipe";

export type PageTheme = "editorial" | "warm-paper" | "minimal" | "dark-ink";

export interface TocItem {
  id: string;
  title: string;
  page: number; // 1-based page number
  level: number; // 1, 2, 3
}

export interface HtmlPageItem {
  index: number; // 1-based
  html: string;
  sectionTitle?: string;
  isCover?: boolean;
  slideStyle?: "editorial" | "slide";
}

export interface ImagePageItem {
  index: number; // 1-based
  file: string; // relative filename inside uploads/<docId>/
  width: number;
  height: number;
  caption?: string;
}

export interface FlipDocument {
  id: string;
  slug: string;
  title: string;
  description: string;
  originalFilename: string;
  sourceType: SourceType;
  renderMode: RenderMode;
  converterNote: string;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  defaultViewMode: ViewMode;
  theme: PageTheme;
  coverFile: string | null;
  pdfFile: string | null;
  toc: TocItem[];
  hasPasscode: boolean;
  passcodeHint: string;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlipDocumentPublic extends FlipDocument {
  coverUrl: string | null;
  isExpired: boolean;
  isUnlocked: boolean;
}

export interface FlipDocumentContent {
  doc: FlipDocumentPublic;
  pdfUrl: string | null;
  htmlPages: HtmlPageItem[];
  imagePages: Array<{
    index: number;
    url: string;
    width: number;
    height: number;
    caption?: string;
  }>;
}

export interface SystemInfo {
  libreOfficeAvailable: boolean;
  libreOfficePath: string | null;
  lanOrigins: string[];
  publicSiteUrl: string | null;
  studioLocked: boolean;
  studioAuthorized: boolean;
  wechatJssdkConfigured: boolean;
}

export interface ScannedChatFile {
  id: string;
  name: string;
  ext: string;
  source: "微信" | "QQ" | "自定义目录";
  size: number;
  mtime: number;
  folderHint: string;
}
