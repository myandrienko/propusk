/**
 * Partial Fisher–Yates shuffle to pick n random elements from an array.
 * Caution: original array is mutated.
 */
export function pick<T>(arr: T[], n: number = arr.length): T[] {
  const start = arr.length - n;
  for (let i = arr.length - 1; i >= start; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return start > 0 ? arr.slice(start) : arr;
}
