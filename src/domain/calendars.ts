import { LEGACY_CALENDAR_ID, SCHEMA_VERSION, type CalendarDefinition, type Snapshot } from './types';
export function legacyCalendar(): CalendarDefinition {
  return { id: LEGACY_CALENDAR_ID, name: 'Mój kalendarz', is_default: true, created_at: '1970-01-01T00:00:00Z', updated_at: '1970-01-01T00:00:00Z' };
}
// In-memory compatibility only: preserve the original queue payloads and operation IDs.
export function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  if (snapshot.schema_version !== 1) return snapshot;
  return { ...snapshot, schema_version: SCHEMA_VERSION, calendars: [legacyCalendar()],
    labels: snapshot.labels.map(label => ({ ...label, calendar_id: LEGACY_CALENDAR_ID })),
    day_labels: snapshot.day_labels.map(day => ({ ...day, calendar_id: LEGACY_CALENDAR_ID })),
  };
}
export function calendarSnapshot(snapshot: Snapshot | undefined, calendarId: string | undefined): Snapshot | undefined {
  return snapshot && { ...snapshot, labels: snapshot.labels.filter(l => l.calendar_id === calendarId), day_labels: snapshot.day_labels.filter(d => d.calendar_id === calendarId) };
}
