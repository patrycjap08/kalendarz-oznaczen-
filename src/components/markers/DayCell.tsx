import { useEffect, useRef, useState } from 'react';
import { fullDate, validDay } from '../../domain/dates';
import type { Label, Preferences } from '../../domain/types';
import { dotLayout, stripeEmoji } from './geometry';
export function DayCell({ day, labels, preferences: p, today, outside = false, onClick, preview = false }: { day: string; labels: Label[]; preferences: Preferences; today?: boolean; outside?: boolean; onClick?: () => void; preview?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), [bounds, setBounds] = useState({ width: 40, height: 64 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(ref.current!); return () => observer.disconnect();
  }, []);
  const dots = dotLayout(labels.length, bounds.width - 8, bounds.height - 30, p.show_emoji, p.dot_size);
  const visible = p.marker_mode === 'dots' ? dots.visible : Math.min(6, labels.length), extra = labels.length - visible;
  const contents = <div ref={ref} className={`cell-inner marker-${p.marker_mode}`} aria-hidden="true">
    {p.marker_mode !== 'dots' && visible > 0 && <div className="stripes" style={p.marker_mode === 'horizontal' ? { gridTemplateRows: `repeat(${visible},minmax(0,1fr))` } : { gridTemplateColumns: `repeat(${visible},minmax(0,1fr))` }}>{labels.slice(0, visible).map(l => <span key={l.id} style={{ background: l.color_hex }} />)}</div>}
    <span className={`day-number ${today ? 'today' : ''}`}>{Number(day.slice(-2))}</span>
    {p.marker_mode === 'dots' && <div className="dot-area"><div className="dot-rows">{Array.from({ length: dots.rows }, (_, row) => <div className="dot-row" key={row}>{labels.slice(row * dots.cols, Math.min((row + 1) * dots.cols, visible)).map(l => <span className="marker-dot" key={l.id} style={{ background: l.color_hex, width: dots.diameter, height: dots.diameter, fontSize: Math.min(p.dot_size === 'small' ? 11 : p.dot_size === 'medium' ? 14 : 17, dots.diameter - 3) }}>{p.show_emoji && l.emoji}</span>)}</div>)}</div></div>}
    {p.marker_mode !== 'dots' && p.show_emoji && labels.slice(0, visible).map((l, i) => {
      const position = stripeEmoji(i, visible, bounds.width, bounds.height, p.marker_mode as 'horizontal' | 'vertical', p.marker_mode === 'horizontal' ? p.horizontal_emoji_position : p.vertical_emoji_position, extra > 0);
      return position ? <span className="stripe-emoji" key={l.id} style={{ left: position.x, top: position.y, fontSize: position.font }}>{l.emoji}</span> : null;
    })}
    {extra > 0 && <span className="overflow-count">+{extra}</span>}
  </div>;
  const className = `day-cell ${outside ? 'outside' : ''} ${[0, 6].includes(new Date(`${day}T12:00:00`).getDay()) ? 'weekend' : ''}`;
  const accessible = `${fullDate(day)}, ${labels.length} oznaczeń${labels.length ? ': ' + labels.slice(0, 6).map(l => l.name).join(', ') : ''}${labels.length > 6 ? `, i ${labels.length - 6} pozostałych` : ''}`;
  return preview ? <div className={className}>{contents}</div> : <button disabled={!validDay(day)} className={className} aria-label={accessible} aria-current={today ? 'date' : undefined} onClick={onClick}>{contents}</button>;
}
