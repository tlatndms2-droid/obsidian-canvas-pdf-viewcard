export type Layout = "single" | "continuous" | "spread" | "spread-continuous";
export type Fit = "page" | "width";
export interface ViewState { page: number; layout: Layout; fit: Fit; zoom: number | null }
export interface CardState extends ViewState { file: string; subpath: string }
export interface Settings { cards: Record<string, CardState>; popup: Omit<ViewState, "page"> }
export const layouts: Record<Layout, string> = {
  single: "한 페이지", continuous: "연속 보기", spread: "두 페이지", "spread-continuous": "두 페이지 연속",
};
export const defaultPopup = { layout: "continuous" as Layout, fit: "width" as Fit, zoom: null };
export function pageFromSubpath(value = ""): number {
  const n = Number(value.match(/(?:#|&)page=(\d+)/i)?.[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}
export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(1, count), Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1));
}
export function normalizeState(raw: Partial<ViewState> = {}, page = 1): ViewState {
  return {
    page: clampPage(raw.page ?? page, Number.MAX_SAFE_INTEGER),
    layout: raw.layout && Object.hasOwn(layouts, raw.layout) ? raw.layout : "single",
    fit: raw.fit === "width" ? "width" : "page",
    zoom: typeof raw.zoom === "number" && Number.isFinite(raw.zoom) ? Math.min(4, Math.max(.1, raw.zoom)) : null,
  };
}
export function cardKey(canvasPath: string, id: string): string { return JSON.stringify([canvasPath, id]); }
export function cardInitial(saved: CardState | undefined, file: string, subpath: string): ViewState {
  return saved?.file === file && saved.subpath === subpath
    ? normalizeState(saved)
    : normalizeState({}, pageFromSubpath(subpath));
}
export function isSpread(layout: Layout): boolean { return layout.startsWith("spread"); }
export function isContinuous(layout: Layout): boolean { return layout.endsWith("continuous"); }
export function pageRows(count: number, state: ViewState): number[][] {
  const step = isSpread(state.layout) ? 2 : 1;
  if (!isContinuous(state.layout)) {
    const start = step === 2 ? Math.floor((state.page - 1) / 2) * 2 + 1 : state.page;
    return [Array.from({length: Math.min(step, count - start + 1)}, (_, i) => start + i)];
  }
  return Array.from({length: Math.ceil(count / step)}, (_, i) =>
    Array.from({length: Math.min(step, count - i * step)}, (_, j) => i * step + j + 1));
}
export function fitScale(width: number, height: number, pages: {width: number; height: number}[], fit: Fit): number {
  const w = pages.reduce((a, p) => a + p.width, 0) || 1;
  const h = Math.max(1, ...pages.map(p => p.height));
  const usableW = Math.max(20, width - 24 - (pages.length - 1) * 12);
  return Math.max(.02, fit === "width" ? usableW / w : Math.min(usableW / w, Math.max(20, height - 24) / h));
}
