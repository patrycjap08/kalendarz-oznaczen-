import { validDay } from './dates';
import { nameKey, validateLabel, validateName, validatePreferences, validateBackup, fail, isUUID } from './validation';
import { DomainError, type Snapshot, type Operation, type Label, type DayLabel } from './types';
export function applyOperation(snapshot: Snapshot, operation: Operation): Snapshot {
  const next = structuredClone(snapshot), p = operation.payload, now = operation.created_at;
  const id = p.label_id;
  const calendarId = p.calendar_id ?? next.calendars.find(c => c.is_default)?.id;
  const calendar = () => { const c = next.calendars.find(c => c.id === calendarId); if (!c) throw new DomainError('CALENDAR_NOT_FOUND', 'Kalendarz już nie istnieje.'); return c; };
  const find = (): Label => { calendar(); const l = next.labels.find(l => l.id === id && l.calendar_id === calendarId); if (!l) throw new DomainError('LABEL_NOT_FOUND', 'Oznaczenie nie istnieje w tym kalendarzu.'); return l; };
  const unique = (label: Label): void => { if (label.kind === 'reusable' && next.labels.some(l => l.id !== label.id && l.calendar_id === label.calendar_id && l.kind === 'reusable' && nameKey(l.name) === nameKey(label.name))) throw new DomainError('NAME_CONFLICT', 'Oznaczenie o tej nazwie już istnieje w tym kalendarzu, także w archiwum.'); };
  const definition = (kind: Label['kind']): Label => {
    if (!isUUID(id) || next.labels.some(l => l.id === id)) fail('Niepoprawny identyfikator oznaczenia.');
    const l: Label = { id, calendar_id: calendar().id, name: validateName(p.name), emoji: p.emoji as string, color_hex: p.color as string, kind, status: 'active', created_at: now, updated_at: now };
    validateLabel(l); unique(l); return l;
  };
  const assign = (label: Label): void => {
    if (typeof p.day !== 'string' || !validDay(p.day) || !isUUID(p.day_label_id)) fail('Niepoprawna data lub identyfikator.');
    if (next.day_labels.some(d => d.day === p.day && d.label_id === label.id)) return;
    if (label.kind === 'one_off' && next.day_labels.some(d => d.label_id === label.id)) fail('Jednorazowe oznaczenie może wystąpić tylko raz.');
    if (next.day_labels.some(d => d.id === p.day_label_id)) fail('Powtórzony identyfikator wpisu.');
    next.day_labels.push({ id: p.day_label_id, calendar_id: label.calendar_id, label_id: label.id, day: p.day, created_at: now });
  };
  switch (operation.type) {
    case 'create_calendar': {
      if (!isUUID(p.calendar_id) || next.calendars.some(c => c.id === p.calendar_id)) fail('Niepoprawny identyfikator kalendarza.');
      const name = validateName(p.name); if (next.calendars.some(c => nameKey(c.name) === nameKey(name))) throw new DomainError('CALENDAR_NAME_CONFLICT', 'Kalendarz o tej nazwie już istnieje.');
      next.calendars.push({ id: p.calendar_id, name, is_default: false, created_at: now, updated_at: now }); break;
    }
    case 'rename_calendar': {
      const c = calendar(), name = validateName(p.name);
      if (next.calendars.some(other => other.id !== c.id && nameKey(other.name) === nameKey(name))) throw new DomainError('CALENDAR_NAME_CONFLICT', 'Kalendarz o tej nazwie już istnieje.');
      c.name = name; c.updated_at = now; break;
    }
    case 'create_label': next.labels.push(definition('reusable')); break;
    case 'create_and_assign': {
      if (p.kind !== 'reusable' && p.kind !== 'one_off') fail('Niepoprawny rodzaj oznaczenia.');
      const l = definition(p.kind); next.labels.push(l); assign(l); break;
    }
    case 'update_label': {
      const l = find(); l.name = validateName(p.name); l.emoji = p.emoji as string; l.color_hex = p.color as string; l.updated_at = now; if (p.promote === true) l.kind = 'reusable'; validateLabel(l); unique(l); break;
    }
    case 'set_label_status': {
      const l = find(); if (l.kind !== 'reusable' || !['active', 'archived'].includes(p.status as string)) fail('Niepoprawna archiwizacja.');
      l.status = p.status as Label['status']; l.updated_at = now; break;
    }
    case 'promote_label': { const l = find(); l.kind = 'reusable'; l.updated_at = now; unique(l); break; }
    case 'delete_label': find(); next.labels = next.labels.filter(l => l.id !== id); next.day_labels = next.day_labels.filter(d => d.label_id !== id); break;
    case 'assign_label': {
      const l = find(); if (l.status !== 'active') throw new DomainError('LABEL_ARCHIVED', 'Najpierw przywróć oznaczenie z archiwum.');
      if (l.kind !== 'reusable') fail('To oznaczenie jest jednorazowe.'); assign(l); break;
    }
    case 'unassign_label': {
      calendar();
      if (typeof p.day !== 'string' || !validDay(p.day)) fail('Niepoprawna data.');
      next.day_labels = next.day_labels.filter(d => !(d.label_id === id && d.day === p.day && d.calendar_id === calendarId));
      const l = next.labels.find(l => l.id === id && l.calendar_id === calendarId);
      if (l?.kind === 'one_off' && !next.day_labels.some(d => d.label_id === id)) next.labels = next.labels.filter(l => l.id !== id);
      break;
    }
    case 'update_preferences': next.preferences = validatePreferences(p); break;
    case 'replace_from_backup': { const b = validateBackup(p); next.calendars = b.calendars; next.labels = b.labels; next.day_labels = b.day_labels; next.preferences = b.preferences; break; }
  }
  return next;
}
export function project(snapshot: Snapshot, operations: Operation[]): { snapshot: Snapshot; failures: Map<string, string> } {
  let state = snapshot; const failures = new Map<string, string>();
  for (const op of operations) { try { state = applyOperation(state, op); } catch (e) { failures.set(op.id, e instanceof Error ? e.message : 'Nie można zastosować zmiany.'); } }
  return { snapshot: state, failures };
}
export function indexDays(snapshot: Snapshot): Map<string, { assignment: DayLabel; label: Label }[]> {
  const labels = new Map(snapshot.labels.map(l => [l.id, l])), days = new Map<string, { assignment: DayLabel; label: Label }[]>();
  for (const assignment of snapshot.day_labels) {
    const label = labels.get(assignment.label_id); if (!label) continue;
    const day = days.get(assignment.day) || []; day.push({ assignment, label }); days.set(assignment.day, day);
  }
  for (const day of days.values()) day.sort((a, b) => a.assignment.created_at.localeCompare(b.assignment.created_at) || a.assignment.id.localeCompare(b.assignment.id));
  return days;
}
