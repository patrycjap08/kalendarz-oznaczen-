import { describe, expect, it } from 'vitest';
import { monthDays, searchKey, validDay } from '../src/domain/dates';
import { applyOperation, indexDays, project } from '../src/domain/operations';
import { nameKey, validateBackup, validateLabel, validatePassword, validateUsername } from '../src/domain/validation';
import { DEFAULT_PREFERENCES, type Operation, type Payload, type Snapshot } from '../src/domain/types';
import { dotLayout, stripeEmoji } from '../src/components/markers/geometry';
const initial = (): Snapshot => ({ schema_version: 1, revision: '0', profile: { username: 'test' }, labels: [], day_labels: [], preferences: DEFAULT_PREFERENCES });
const op = (type: Operation['type'], payload: Payload): Operation => ({ id: crypto.randomUUID(), user_id: crypto.randomUUID(), type, payload, state: 'pending', created_at: '2026-10-12T12:00:00Z' });
const labelId = crypto.randomUUID(), assignment = crypto.randomUUID();
const definition = { label_id: labelId, name: 'Trening', emoji: '🏋️', color: '#8AAE92' };
describe('daty i normalizacja', () => {
  it('rysuje tylko tygodnie zajmowane przez miesiąc i uwzględnia luty przestępny', () => {
    const days = monthDays(2028, 1); expect(days).toHaveLength(35); expect(days[0]).toBe('2028-01-31'); expect(days).toContain('2028-02-29'); expect(days.at(-1)).toBe('2028-03-05');
  });
  it('obsługuje miesiące z czterema, pięcioma i sześcioma tygodniami', () => { expect(monthDays(2021, 1)).toHaveLength(28); expect(monthDays(2021, 2)).toHaveLength(35); expect(monthDays(2020, 7)).toHaveLength(42); expect(monthDays(2021, 1)[0]).toBe('2021-02-01'); expect(monthDays(2021, 1).at(-1)).toBe('2021-02-28'); });
  it('odrzuca nieistniejące daty i granice', () => { expect(validDay('2026-02-29')).toBe(false); expect(validDay('1899-12-31')).toBe(false); expect(validDay('2101-01-01')).toBe(false); expect(validDay('2026-10-12')).toBe(true); });
  it('wyszukiwanie usuwa diakrytykę, unikalność zachowuje ją', () => { expect(searchKey(' ŁÓDŹ ')).toBe('lodz'); expect(nameKey(' Trening ')).toBe('trening'); expect(nameKey('Łódź')).not.toBe(nameKey('Lodz')); });
  it('hasła i nazwy mają osobne zasady, a emoji obsługuje ZWJ i karnację', () => {
    expect(() => validatePassword('hasło ze spacjami')).not.toThrow(); expect(() => validateUsername('Test_1')).not.toThrow(); expect(() => validateUsername('ąbc')).toThrow();
    expect(() => validateLabel({ name: 'Praca', emoji: '👩🏽‍💻', color_hex: '#FFFFFF' })).not.toThrow();
    expect(() => validateLabel({ name: 'Praca', emoji: '🌿🌿', color_hex: '#FFFFFF' })).toThrow();
  });
});
describe('operacje domenowe', () => {
  it('dodanie tej samej definicji do dnia jest no-op i edycja obejmuje historię', () => {
    const created = applyOperation(initial(), op('create_label', definition));
    const payload = { label_id: labelId, day_label_id: assignment, day: '2026-10-12' };
    const assigned = applyOperation(created, op('assign_label', payload));
    const duplicate = applyOperation(assigned, op('assign_label', { ...payload, day_label_id: crypto.randomUUID() })); expect(duplicate.day_labels).toHaveLength(1);
    const updated = applyOperation(duplicate, op('update_label', { ...definition, name: 'Ruch' })); expect(indexDays(updated).get('2026-10-12')?.[0].label.name).toBe('Ruch');
  });
  it('archiwizacja pozostawia historię i blokuje nowe przypisania', () => {
    const created = applyOperation(initial(), op('create_and_assign', { ...definition, kind: 'reusable', day: '2026-10-12', day_label_id: assignment }));
    const archived = applyOperation(created, op('set_label_status', { label_id: labelId, status: 'archived' })); expect(archived.day_labels).toHaveLength(1);
    expect(() => applyOperation(archived, op('assign_label', { label_id: labelId, day: '2026-10-13', day_label_id: crypto.randomUUID() }))).toThrow();
    expect(() => applyOperation(archived, op('create_label', { ...definition, label_id: crypto.randomUUID(), name: ' trening ' }))).toThrow();
  });
  it('nie pozostawia pustej jednorazowej definicji po usunięciu ani po błędzie', () => {
    const created = applyOperation(initial(), op('create_and_assign', { ...definition, kind: 'one_off', day: '2026-10-12', day_label_id: assignment }));
    const removed = applyOperation(created, op('unassign_label', { label_id: labelId, day: '2026-10-12' })); expect(removed.labels).toHaveLength(0);
    const base = initial(); expect(() => applyOperation(base, op('create_and_assign', { ...definition, kind: 'one_off', day: '2026-99-01', day_label_id: assignment }))).toThrow(); expect(base.labels).toHaveLength(0);
  });
  it('promocja zachowuje ID, globalne usunięcie usuwa wszystkie powiązania', () => {
    const created = applyOperation(initial(), op('create_and_assign', { ...definition, kind: 'one_off', day: '2026-10-12', day_label_id: assignment }));
    const promoted = applyOperation(created, op('promote_label', { label_id: labelId })); expect(promoted.labels[0].id).toBe(labelId); expect(promoted.labels[0].kind).toBe('reusable');
    const removed = applyOperation(promoted, op('delete_label', { label_id: labelId })); expect(removed.labels).toHaveLength(0); expect(removed.day_labels).toHaveLength(0);
  });
  it('projekcja zachowuje kolejkę i jawnie wskazuje nieaktualne definicje', () => {
    const queued = op('assign_label', { label_id: labelId, day: '2026-10-12', day_label_id: assignment });
    const result = project(initial(), [queued]); expect(result.failures.has(queued.id)).toBe(true); expect(queued.state).toBe('pending'); expect(result.snapshot.labels).toHaveLength(0);
  });
  it('uszkodzony backup jest odrzucany, w tym jednorazowe bez przypisania', () => {
    const created = applyOperation(initial(), op('create_and_assign', { ...definition, kind: 'one_off', day: '2026-10-12', day_label_id: assignment }));
    expect(() => validateBackup({ ...created, exported_at: new Date().toISOString() })).not.toThrow();
    expect(() => validateBackup({ ...created, day_labels: [] })).toThrow();
  });
});
describe('geometria oznaczeń', () => {
  it('sześć emoji mieści się w całej komórce iPhone’a, razem z numerem i overflow', () => { for (const [width, height] of [[40, 72], [50, 110]]) { const layout = dotLayout(9, width, height, true, 'auto'); expect(layout.visible).toBe(6); expect(layout.diameter).toBeGreaterThanOrEqual(12); expect(layout.points[0].y).toBeLessThan(26); } });
  it('wykorzystuje miejsce obok daty i nie wychodzi poza komórkę', () => {
    const layout = dotLayout(6, 50, 110, true, 'auto'); expect(layout.points[0].y).toBe(14.5); expect(layout.points[0].x - layout.diameter / 2).toBeGreaterThanOrEqual(26);
    for (const point of layout.points) { const radius = layout.diameter / 2; expect(point.x - radius).toBeGreaterThanOrEqual(0); expect(point.x + radius).toBeLessThanOrEqual(50); expect(point.y - radius).toBeGreaterThanOrEqual(0); expect(point.y + radius).toBeLessThanOrEqual(110); }
  });
  it('zmniejsza widoczną liczbę, gdy miejsca jest za mało', () => { expect(dotLayout(6, 24, 20, true, 'auto').visible).toBeLessThan(6); });
  it('sześć wąskich pasów zachowuje kolory bez nieczytelnych emoji', () => { expect(stripeEmoji(0, 6, 44, 85, 'vertical', 'top', false)).toBeUndefined(); });
  it('emoji nie zachodzi na numer dnia ani licznik', () => { const result = stripeEmoji(0, 2, 50, 85, 'horizontal', 'left', true); expect(result).toBeDefined(); const { x, y, font } = result!; const half = font / 2 + 1; expect(x - half >= 28 || y - half >= 26).toBe(true); });
});
