import { useState } from 'react';
export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max === 0 ? 0 : d / max * 100, max * 100];
}
export function hsvToHex(h: number, s: number, v: number): string {
  s /= 100; v /= 100;
  const f = (n: number) => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(5)}${f(3)}${f(1)}`.toUpperCase();
}
export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const change = (index: number, number: number) => { const next = [...hsv] as [number, number, number]; next[index] = number; setHsv(next); onChange(hsvToHex(...next)); };
  return <fieldset className="color-picker"><legend>Kolor</legend>
    <div className="color-heading"><span className="color-preview" style={{ background: value }} /><label>HEX<input value={value} maxLength={7} onChange={e => { onChange(e.target.value); if (/^#[\da-f]{6}$/i.test(e.target.value)) setHsv(hexToHsv(e.target.value)); }} autoCapitalize="characters" spellCheck={false} /></label></div>
    <div className="hue-wheel" style={{ '--hue': `${hsv[0]}deg` } as React.CSSProperties} role="slider" tabIndex={0} aria-label="Koło odcienia" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv[0])} onKeyDown={e => { if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); change(0, e.key === 'Home' ? 0 : e.key === 'End' ? 360 : (hsv[0] + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : 359)) % 360); } }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const rect = e.currentTarget.getBoundingClientRect(); change(0, (Math.atan2(e.clientY - rect.top - rect.height / 2, e.clientX - rect.left - rect.width / 2) * 180 / Math.PI + 450) % 360); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { const rect = e.currentTarget.getBoundingClientRect(); change(0, (Math.atan2(e.clientY - rect.top - rect.height / 2, e.clientX - rect.left - rect.width / 2) * 180 / Math.PI + 450) % 360); } }}><span /></div>
    {['Odcień', 'Nasycenie', 'Jasność'].map((name, i) => <label key={name}>{name}<input type="range" min={0} max={i === 0 ? 360 : 100} value={hsv[i]} onChange={e => change(i, Number(e.target.value))} /></label>)}
    <div className="swatches">{['#FFFFFF', '#000000', '#808080', '#8AAE92', '#DDAE83', '#8BA7CC', '#D5A1B8'].map(color => <button type="button" key={color} style={{ background: color }} aria-label={`Wybierz kolor ${color}`} onClick={() => { setHsv(hexToHsv(color)); onChange(color); }} />)}</div>
  </fieldset>;
}
