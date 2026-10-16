/** Files 面板「文件树 / 预览」上下分栏的尺寸偏好：像素高度 + localStorage 持久化。 */

export type FilesSplitStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const FILES_SPLIT_STORAGE_KEY = "pi-studio.workspace.files.splitSize";
export const FILES_SPLIT_MIN_TREE_PX = 160;
export const FILES_SPLIT_MIN_VIEWER_PX = 120;
export const FILES_SPLIT_STEP_PX = 24;
export const FILES_SPLIT_LARGE_STEP_PX = 72;

export function readStoredFilesSplitSize(storage: FilesSplitStorage | undefined = browserFilesSplitStorage()): number | undefined {
  try {
    const raw = storage?.getItem(FILES_SPLIT_STORAGE_KEY);
    if (raw === undefined || raw === null || raw === "") return undefined;
    const size = Number(raw);
    return Number.isFinite(size) && size > 0 ? Math.round(size) : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredFilesSplitSize(size: number | undefined, storage: FilesSplitStorage | undefined = browserFilesSplitStorage()): void {
  if (storage === undefined) return;
  try {
    if (size === undefined) {
      storage.removeItem(FILES_SPLIT_STORAGE_KEY);
      return;
    }
    // 调用方已按当前容器夹取；这里只做取整，避免写入与运行时夹取规则不一致。
    storage.setItem(FILES_SPLIT_STORAGE_KEY, String(Math.round(size)));
  } catch {
    // 忽略 localStorage 配额/隐私错误；本次会话内的布局调整仍然生效。
  }
}

export function filesSplitSizeFromDrag(startSize: number, containerSize: number, deltaY: number): number {
  return clampFilesSplitSize(startSize + deltaY, containerSize);
}

export function filesSplitSizeFromKeyboard(currentSize: number, containerSize: number, key: string, options: { largeStep?: boolean } = {}): number | undefined {
  if (key === "Home") return clampFilesSplitSize(0, containerSize);
  if (key === "End") return clampFilesSplitSize(containerSize, containerSize);
  const step = options.largeStep === true ? FILES_SPLIT_LARGE_STEP_PX : FILES_SPLIT_STEP_PX;
  const delta = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : undefined;
  if (delta === undefined) return undefined;
  return clampFilesSplitSize(currentSize + delta, containerSize);
}

export function clampFilesSplitSize(size: number, containerSize: number): number {
  if (!Number.isFinite(size) || !Number.isFinite(containerSize) || containerSize <= 0) return Math.round(Math.max(size, 0));
  const min = Math.min(FILES_SPLIT_MIN_TREE_PX, containerSize / 2);
  const max = Math.max(min, containerSize - Math.min(FILES_SPLIT_MIN_VIEWER_PX, containerSize / 2));
  return Math.round(Math.min(Math.max(size, min), max));
}

function browserFilesSplitStorage(): FilesSplitStorage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}
