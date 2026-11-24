declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module "page-flip" {
  export enum SizeType {
    FIXED = "fixed",
    STRETCH = "stretch",
  }

  export interface FlipSetting {
    startPage?: number;
    size?: SizeType | "fixed" | "stretch";
    width: number;
    height: number;
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
  }

  export interface FlipEvent {
    data: number | string;
    object: PageFlip;
  }

  export class PageFlip {
    constructor(htmlParentElement: HTMLElement, setting: FlipSetting);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    loadFromImages(images: string[]): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    flip(page: number, corner?: "top" | "bottom"): void;
    turnToPage(page: number): void;
    turnToNextPage(): void;
    turnToPrevPage(): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    on(eventName: string, callback: (e: FlipEvent) => void): void;
    destroy(): void;
  }
}

interface FlipDocAndroidBridge {
  saveImageBase64: (dataUrlOrBase64: string, filename: string) => boolean;
  shareImageBase64: (dataUrlOrBase64: string, filename: string, title: string) => boolean;
  shareLink: (url: string, title: string, text: string) => boolean;
  openServerSettings: () => void;
  getAppVersion: () => string;
}

interface Window {
  FlipDocAndroid?: FlipDocAndroidBridge;
}
