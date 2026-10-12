import emojiData from './emoji.json' with { type: 'json' };
import { DEFAULT_PREFERENCES, DomainError, LEGACY_CALENDAR_ID, SCHEMA_VERSION, type Backup, type Label, type Preferences } from './types';
import { legacyCalendar } from './calendars';
import { validDay } from './dates';
const emojis = new Set<string>(emojiData);
export const EMOJI_CHOICES = ['🌿', '🏋️', '📚', '💼', '❤️', '☀️', '🌙', '🎉', '🏃‍♀️', '🧘', '🍀', '✈️', '🏠', '💧', '🩺', '🫶', '👩🏽‍💻', '🐾', '🎨', '🎵', '🍵', '🚲', '🌸', '⭐'];
export function fail(message: string): never { throw new DomainError('VALIDATION_ERROR', message); }
export function nameKey(name: string): string { return name.normalize('NFC').trim().toLowerCase(); }
export function validateName(value: unknown): string {
  if (typeof value !== 'string') fail('Podaj nazwę oznaczenia.');
  const name = value.normalize('NFC').trim();
  if ([...name].length < 1 || [...name].length > 60 || /\p{Cc}/u.test(name)) fail('Nazwa musi mieć 1–60 znaków i nie może zawierać znaków kontrolnych.');
  return name;
}
export function validateLabel(value: Pick<Label, 'name' | 'emoji' | 'color_hex'>): void {
  validateName(value.name);
  if (!emojis.has(value.emoji)) fail('Wybierz lub wklej jedną wspieraną emotkę (Unicode 17).');
  if (!/^#[\da-fA-F]{6}$/.test(value.color_hex)) fail('Podaj kolor jako #RRGGBB.');
}
export function validateUsername(value: string): string {
  const username = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$/.test(username)) fail('Nazwa użytkownika: 3–30 znaków, litery bez polskich znaków, cyfry, _, - lub kropka.');
  return username;
}
export function validatePassword(value: string): void {
  if ([...value].length < 12 || [...value].length > 128) fail('Hasło musi mieć 12–128 znaków.');
}
const options: Record<string, readonly string[]> = {
  background: ['plain', 'warm', 'mist', 'sage', 'dots'], calendar_style: ['simple', 'soft', 'editorial', 'mono'],
  theme_mode: ['light', 'dark', 'system'], marker_mode: ['dots', 'horizontal', 'vertical'], dot_size: ['small', 'medium', 'auto'],
  horizontal_emoji_position: ['top', 'left'], vertical_emoji_position: ['top', 'left'],
};
export function validatePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Niepoprawne ustawienia.');
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(key => !(key in DEFAULT_PREFERENCES)) || Object.keys(p).length !== 8) fail('Niepoprawne pola ustawień.');
  for (const [key, values] of Object.entries(options)) if (!values.includes(p[key] as string)) fail('Niepoprawne ustawienia wyglądu.');
  if (typeof p.show_emoji !== 'boolean') fail('Niepoprawne ustawienie emotek.');
  return value as Preferences;
}
export const isUUID = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);
export function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== 'object') fail('Plik nie jest kopią kalendarza.');
  let b = value as Backup;
  if (![1, SCHEMA_VERSION].includes(b.schema_version) || !Array.isArray(b.labels) || !Array.isArray(b.day_labels)) fail('Nieobsługiwana wersja lub uszkodzona kopia.');
  if (b.schema_version === 1) b = { ...b, schema_version: SCHEMA_VERSION, calendars: [legacyCalendar()], labels: b.labels.map(l => ({ ...l, calendar_id: LEGACY_CALENDAR_ID })), day_labels: b.day_labels.map(d => ({ ...d, calendar_id: LEGACY_CALENDAR_ID })) };
  if (!Array.isArray(b.calendars) || !b.calendars.length || b.calendars.filter(c => c?.is_default === true).length !== 1) fail('Kopia musi zawierać kalendarze i dokładnie jeden kalendarz domyślny.');
  const calendarIds = new Set<string>(), calendarNames = new Set<string>();
  for (const calendar of b.calendars) {
    if (!calendar || !isUUID(calendar.id) || calendarIds.has(calendar.id) || typeof calendar.is_default !== 'boolean') fail('Niepoprawny lub powtórzony kalendarz.');
    const key = nameKey(validateName(calendar.name)); if (calendarNames.has(key)) fail('Powtórzone nazwy kalendarzy.');
    calendarIds.add(calendar.id); calendarNames.add(key);
  }
  validatePreferences(b.preferences);
  const ids = new Set<string>(), names = new Set<string>(), pairs = new Set<string>(), entryIds = new Set<string>(), usages = new Map<string, number>();
  for (const label of b.labels) {
    if (!label || !isUUID(label.id) || ids.has(label.id) || !calendarIds.has(label.calendar_id)) fail('Niepoprawny identyfikator lub kalendarz oznaczenia.');
    validateLabel(label);
    if (!['reusable', 'one_off'].includes(label.kind) || !['active', 'archived'].includes(label.status) || (label.kind === 'one_off' && label.status !== 'active')) fail('Niepoprawny rodzaj oznaczenia.');
    if (label.kind === 'reusable') {
      const key = `${label.calendar_id}/${nameKey(label.name)}`; if (names.has(key)) fail('Powtórzone nazwy oznaczeń w kalendarzu.'); names.add(key);
    }
    ids.add(label.id);
  }
  for (const d of b.day_labels) {
    if (!d || !isUUID(d.id) || entryIds.has(d.id) || !ids.has(d.label_id) || !calendarIds.has(d.calendar_id) || b.labels.find(l => l.id === d.label_id)?.calendar_id !== d.calendar_id || typeof d.day !== 'string' || !validDay(d.day) || !Number.isFinite(Date.parse(d.created_at))) fail('Niepoprawne przypisanie do dnia lub kalendarza.');
    const pair = `${d.calendar_id}/${d.day}/${d.label_id}`; if (pairs.has(pair)) fail('Powtórzone oznaczenie w dniu.');
    pairs.add(pair); entryIds.add(d.id); usages.set(d.label_id, (usages.get(d.label_id) || 0) + 1);
  }
  for (const l of b.labels) if (l.kind === 'one_off' && usages.get(l.id) !== 1) fail('Jednorazowe oznaczenie musi występować w dokładnie jednym dniu.');
  return b;
}
export function remapBackup(backup: Backup): Backup {
  const calendars = new Map(backup.calendars.map(calendar => [calendar.id, crypto.randomUUID()]));
  const mapping = new Map(backup.labels.map(label => [label.id, crypto.randomUUID()]));
  return { ...backup, calendars: backup.calendars.map(c => ({ ...c, id: calendars.get(c.id)! })), labels: backup.labels.map(l => ({ ...l, id: mapping.get(l.id)!, calendar_id: calendars.get(l.calendar_id)! })), day_labels: backup.day_labels.map(d => ({ ...d, id: crypto.randomUUID(), calendar_id: calendars.get(d.calendar_id)!, label_id: mapping.get(d.label_id)! })) };
}
