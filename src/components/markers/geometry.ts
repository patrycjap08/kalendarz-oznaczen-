export function dotLayout(count: number, width: number, height: number, emoji: boolean, size: 'small' | 'medium' | 'auto') {
  const target = emoji ? { small: 16, medium: 20, auto: 26 }[size] : { small: 7, medium: 11, auto: 14 }[size];
  const minimum = emoji ? 12 : 5;
  for (let visible = Math.min(6, count); visible > 0; visible--) {
    const cols = visible === 1 ? 1 : 2, rows = Math.ceil(visible / cols);
    const fit = Math.floor(Math.min((width - (cols - 1) * 2) / cols, (height - (rows - 1) * 2) / rows));
    if (fit >= minimum) return { visible, cols, rows, diameter: Math.min(target, fit) };
  }
  return { visible: 0, cols: 1, rows: 0, diameter: 0 };
}
type Rect = { x: number; y: number; width: number; height: number };
export function stripeEmoji(index: number, count: number, width: number, height: number, mode: 'horizontal' | 'vertical', position: 'top' | 'left', overflow: boolean) {
  const stripe: Rect = mode === 'horizontal' ? { x: 0, y: height * index / count, width, height: height / count } : { x: width * index / count, y: 0, width: width / count, height };
  const font = Math.min(16, (mode === 'horizontal' ? stripe.height : stripe.width) - 2);
  if (font < 10) return undefined;
  const half = font / 2 + 1;
  const blocked: Rect[] = [{ x: 2, y: 2, width: 26, height: 24 }, ...(overflow ? [{ x: width - 27, y: height - 22, width: 27, height: 22 }] : [])];
  const candidates = position === 'top'
    ? [0.5, 0.75, 0.25].flatMap(f => [half, Math.max(half, stripe.height - half)].map(y => [stripe.x + stripe.width * f, stripe.y + y]))
    : [0.5, 0.75, 0.25].flatMap(f => [half, Math.max(half, stripe.width - half)].map(x => [stripe.x + x, stripe.y + stripe.height * f]));
  for (const [x, y] of candidates) {
    if (x - half < stripe.x || x + half > stripe.x + stripe.width || y - half < stripe.y || y + half > stripe.y + stripe.height) continue;
    if (blocked.some(r => x + half > r.x && x - half < r.x + r.width && y + half > r.y && y - half < r.y + r.height)) continue;
    return { x, y, font };
  }
  return undefined;
}
