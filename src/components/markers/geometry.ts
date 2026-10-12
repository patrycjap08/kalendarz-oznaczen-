export type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
export function circleOverlapsRect(point: Point, radius: number, rect: Rect): boolean {
  const x = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const y = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
  return Math.hypot(point.x - x, point.y - y) < radius;
}
export function dotLayout(count: number, width: number, height: number, emoji: boolean, size: 'small' | 'medium' | 'auto', number: Rect = { x: 3, y: 3, width: 23, height: 23 }) {
  const target = emoji ? { small: 16, medium: 20, auto: 26 }[size] : { small: 7, medium: 11, auto: 14 }[size];
  const minimum = emoji ? 12 : 5;
  const padding = 1, gap = 2;
  for (let visible = Math.min(6, count); visible > 0; visible--) {
    const extra = count - visible;
    const obstacles = [number, ...(extra > 0 ? [{ x: width - Math.max(19, String(extra).length * 6 + 7) - 2, y: height - 18, width: Math.max(19, String(extra).length * 6 + 7), height: 16 }] : [])];
    for (const useBeside of [true, false]) {
      for (let diameter = Math.floor(Math.min(target, width - padding * 2)); diameter >= minimum; diameter--) {
        const radius = diameter / 2;
        const fits = (point: Point, previous: Point[]) => point.x - radius >= padding && point.x + radius <= width - padding && point.y - radius >= padding && point.y + radius <= height - padding && !obstacles.some(rect => circleOverlapsRect(point, radius + 1, rect)) && previous.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= diameter + gap);
        // Only the actual number is reserved. The first marker can sit beside it.
        const beside = { x: width - padding - radius, y: Math.max(padding + radius, number.y + number.height / 2) };
        const besideFits = useBeside && fits(beside, []);
        if (useBeside && !besideFits) continue;
        const remaining = visible - (besideFits ? 1 : 0);
        const cols = Math.min(2, remaining), rows = cols ? Math.ceil(remaining / cols) : 0;
        if (remaining && cols * diameter + (cols - 1) * gap > width - padding * 2) continue;
        const points: Point[] = besideFits ? [beside] : [];
        const top = Math.ceil(Math.max(number.y + number.height + gap, besideFits ? beside.y + radius + gap + 1 : 0));
        const left = (width - (cols * diameter + (cols - 1) * gap)) / 2 + radius;
        for (let i = 0; i < remaining; i++) {
          const row = Math.floor(i / cols), col = i % cols, lastSingle = cols === 2 && i === remaining - 1 && remaining % 2 === 1;
          const y = top + radius + row * (diameter + gap) - (col === 1 ? 1 : 0);
          const candidates = [lastSingle ? width / 2 : left + col * (diameter + gap), ...(lastSingle ? [left, padding + radius] : [])];
          const point = candidates.map(x => ({ x, y })).find(point => fits(point, points));
          if (!point) break;
          points.push(point);
        }
        if (points.length === visible) return { visible, cols, rows, diameter, points };
      }
    }
  }
  return { visible: 0, cols: 0, rows: 0, diameter: 0, points: [] as Point[] };
}
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
