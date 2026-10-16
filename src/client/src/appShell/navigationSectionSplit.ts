import { NAVIGATION_SECTION_ORDER, type NavigationSection } from "./navigationState";

/**
 * 导航面板各区块的高度权重：区块高度与权重成正比（flex-grow）。
 * 未记录的区块使用默认权重 1；拖动分隔条只调整相邻两区的权重，权重总和不变，
 * 因此其他区块高度不受影响。
 */
export type NavigationSectionWeights = Partial<Record<NavigationSection, number>>;

export type SectionSplitStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const NAVIGATION_SECTION_SPLIT_STORAGE_KEY = "pi-studio:section-splits:v1";
export const NAVIGATION_SECTION_SPLIT_MIN_PX = 120;
export const NAVIGATION_SECTION_SPLIT_STEP_PX = 24;
export const NAVIGATION_SECTION_SPLIT_LARGE_STEP_PX = 72;

export function navigationSectionWeight(weights: NavigationSectionWeights, section: NavigationSection): number {
  const weight = weights[section];
  return weight === undefined || !Number.isFinite(weight) || weight <= 0 ? 1 : weight;
}

export function navigationSectionSplitHeightFromDrag(startHeight: number, pairHeight: number, deltaY: number): number {
  return clampSplitHeight(startHeight + deltaY, pairHeight);
}

export function navigationSectionSplitHeightFromKeyboard(currentHeight: number, pairHeight: number, key: string, options: { largeStep?: boolean } = {}): number | undefined {
  if (key === "Home") return clampSplitHeight(0, pairHeight);
  if (key === "End") return clampSplitHeight(pairHeight, pairHeight);
  const step = options.largeStep === true ? NAVIGATION_SECTION_SPLIT_LARGE_STEP_PX : NAVIGATION_SECTION_SPLIT_STEP_PX;
  const delta = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : undefined;
  if (delta === undefined) return undefined;
  return clampSplitHeight(currentHeight + delta, pairHeight);
}

/** 把上区目标高度换算成新的相邻两区权重；权重总和保持不变。 */
export function navigationSectionWeightsAfterResize(weights: NavigationSectionWeights, upper: NavigationSection, lower: NavigationSection, upperHeight: number, pairHeight: number): NavigationSectionWeights {
  const upperWeight = navigationSectionWeight(weights, upper);
  const lowerWeight = navigationSectionWeight(weights, lower);
  const pairWeight = upperWeight + lowerWeight;
  if (!Number.isFinite(pairHeight) || pairHeight <= 0) return weights;
  const nextUpperWeight = clampSplitHeight(upperHeight, pairHeight) / pairHeight * pairWeight;
  return { ...weights, [upper]: nextUpperWeight, [lower]: pairWeight - nextUpperWeight };
}

/** 双击复位：相邻两区恢复等分，其余区块份额不变。 */
export function navigationSectionWeightsAfterReset(weights: NavigationSectionWeights, upper: NavigationSection, lower: NavigationSection): NavigationSectionWeights {
  const half = (navigationSectionWeight(weights, upper) + navigationSectionWeight(weights, lower)) / 2;
  return { ...weights, [upper]: half, [lower]: half };
}

export function readStoredNavigationSectionWeights(storage: SectionSplitStorage | undefined = browserSectionSplitStorage()): NavigationSectionWeights {
  try {
    const raw = storage?.getItem(NAVIGATION_SECTION_SPLIT_STORAGE_KEY);
    if (raw === undefined || raw === null || raw === "") return {};
    const value: unknown = JSON.parse(raw);
    return parseStoredWeights(value);
  } catch {
    return {};
  }
}

export function writeStoredNavigationSectionWeights(weights: NavigationSectionWeights, storage: SectionSplitStorage | undefined = browserSectionSplitStorage()): void {
  if (storage === undefined) return;
  const stored = parseStoredWeights(weights);
  try {
    if (Object.keys(stored).length === 0) {
      storage.removeItem(NAVIGATION_SECTION_SPLIT_STORAGE_KEY);
      return;
    }
    storage.setItem(NAVIGATION_SECTION_SPLIT_STORAGE_KEY, JSON.stringify({ version: 1, weights: stored }));
  } catch {
    // 忽略 localStorage 配额/隐私错误；本次会话内的布局调整仍然生效。
  }
}

function clampSplitHeight(height: number, pairHeight: number): number {
  if (!Number.isFinite(height) || !Number.isFinite(pairHeight) || pairHeight <= 0) return 0;
  const min = Math.min(NAVIGATION_SECTION_SPLIT_MIN_PX, pairHeight / 2);
  return Math.round(Math.min(Math.max(height, min), pairHeight - min));
}

function parseStoredWeights(value: unknown): NavigationSectionWeights {
  const record = isRecord(value) && isRecord(value["weights"]) ? value["weights"] : isRecord(value) ? value : undefined;
  if (record === undefined) return {};
  const weights: NavigationSectionWeights = {};
  for (const section of NAVIGATION_SECTION_ORDER) {
    const weight = record[section];
    // 默认权重 1 不落盘：全部恢复默认时存储自然清空。
    if (typeof weight === "number" && Number.isFinite(weight) && weight > 0 && weight !== 1) weights[section] = weight;
  }
  return weights;
}

function browserSectionSplitStorage(): SectionSplitStorage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
