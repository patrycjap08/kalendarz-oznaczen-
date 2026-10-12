import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../../app/context';
import { DayCell } from '../../components/markers/DayCell';
import { dateString, monthDays } from '../../domain/dates';
import { indexDays } from '../../domain/operations';
import { DayPanel } from './DayPanel';
export function Calendar({ month, setMonth }: { month: [number, number]; setMonth: (month: [number, number]) => void }) {
  const { view } = useApp(); const [year, m] = month;
  const [selected, setSelected] = useState<string>(), [today, setToday] = useState(() => dateString(new Date()));
  const gridRef = useRef<HTMLDivElement>(null), [availableHeight, setAvailableHeight] = useState<number>();
  const hasSnapshot = Boolean(view.snapshot);
  const days = useMemo(() => view.snapshot ? indexDays(view.snapshot) : new Map(), [view.snapshot]);
  useEffect(() => { const update = () => setToday(dateString(new Date())); const timer = setInterval(update, 30_000); document.addEventListener('visibilitychange', update); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); }; }, []);
  useEffect(() => {
    const grid = gridRef.current, nav = document.querySelector<HTMLElement>('.bottom-nav');
    if (!grid || !nav) return;
    const measure = () => setAvailableHeight(Math.max(0, Math.floor((window.visualViewport?.height ?? window.innerHeight) - grid.getBoundingClientRect().top - window.scrollY - nav.getBoundingClientRect().height - 12)));
    const observer = new ResizeObserver(measure);
    observer.observe(nav); observer.observe(grid.parentElement!);
    const status = document.querySelector('.sync-status'); if (status) observer.observe(status);
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure); measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [hasSnapshot]);
  const move = (direction: number) => { const date = new Date(year, m + direction, 1, 12); setMonth([date.getFullYear(), date.getMonth()]); };
  const title = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(year, m, 1));
  const fields = monthDays(year, m);
  return <section className="calendar-screen">
    <header className="month-header"><h1>{title}</h1><button className="today-button" onClick={() => { const now = new Date(); setMonth([now.getFullYear(), now.getMonth()]); }}>Dzisiaj</button></header>
    <div className="month-controls" style={{ justifyContent: 'flex-end' }}><div><button className="icon-button" aria-label="Poprzedni miesiąc" disabled={year === 1900 && m === 0} onClick={() => move(-1)}>‹</button><button className="icon-button" aria-label="Następny miesiąc" disabled={year === 2100 && m === 11} onClick={() => move(1)}>›</button></div></div>
    {!view.snapshot ? <div className="empty-state"><span className="empty-icon">▦</span><h2>{view.online ? 'Pobieranie kalendarza' : 'Historia nie jest jeszcze dostępna offline'}</h2><p>{view.error || 'Pierwsze pobranie historii wymaga internetu.'}</p><button onClick={() => void view}>Status połączenia jest widoczny u góry</button></div> : <>
      <div className="weekday-row" aria-hidden="true">{['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'].map(d => <span key={d}>{d}</span>)}</div>
      <div ref={gridRef} className={`calendar-grid style-${view.snapshot.preferences.calendar_style}`} style={{ '--week-count': fields.length / 7, '--calendar-available-height': availableHeight !== undefined ? `${availableHeight}px` : undefined } as CSSProperties}>{fields.map(day => <DayCell key={day} day={day} preferences={view.snapshot!.preferences} labels={(days.get(day) || []).map((item: { label: import('../../domain/types').Label }) => item.label)} today={day === today} outside={Number(day.slice(5, 7)) !== m + 1} onClick={() => setSelected(day)} />)}</div>
      {!view.snapshot.labels.length && <p className="calendar-hint">Dotknij dnia, aby dodać pierwsze oznaczenie.</p>}
    </>}
    {selected && view.snapshot && <DayPanel day={selected} onClose={() => setSelected(undefined)} />}
  </section>;
}
