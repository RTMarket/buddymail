/**
 * 原生 select：选项数超过 maxVisible 时用 size=maxVisible 展示列表+滚动；
 * 否则用默认下拉（size=1），或选项较少时展开全部行。
 */
export function nativeSelectSizeForOptionCount(optionCount: number, maxVisible = 5): number {
  const n = Math.max(1, Math.floor(optionCount));
  if (n <= 1) return 1;
  if (n <= maxVisible) return n;
  return maxVisible;
}
