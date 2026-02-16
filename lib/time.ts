export function unix(): number {
  return Math.trunc(Date.now() / 1000);
}
