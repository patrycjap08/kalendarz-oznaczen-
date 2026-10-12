export const SCHEMA_VERSION = 2;
export const LEGACY_CALENDAR_ID = '00000000-0000-4000-8000-000000000000';
export type CalendarDefinition = { id: string; name: string; is_default: boolean; created_at: string; updated_at: string };
export type Label = { id: string; calendar_id: string; name: string; emoji: string; color_hex: string; kind: 'reusable' | 'one_off'; status: 'active' | 'archived'; created_at: string; updated_at: string };
export type DayLabel = { id: string; calendar_id: string; day: string; label_id: string; created_at: string };
export type Preferences = {
  background: 'plain' | 'warm' | 'mist' | 'sage' | 'dots';
  calendar_style: 'simple' | 'soft' | 'editorial' | 'mono';
  theme_mode: 'light' | 'dark' | 'system'; marker_mode: 'dots' | 'horizontal' | 'vertical';
  show_emoji: boolean; dot_size: 'small' | 'medium' | 'auto';
  horizontal_emoji_position: 'top' | 'left'; vertical_emoji_position: 'top' | 'left';
};
export const DEFAULT_PREFERENCES: Preferences = {
  background: 'plain', calendar_style: 'simple', theme_mode: 'system', marker_mode: 'dots',
  show_emoji: true, dot_size: 'auto', horizontal_emoji_position: 'left', vertical_emoji_position: 'top',
};
export type Snapshot = { schema_version: number; revision: string; profile: { username: string }; calendars: CalendarDefinition[]; labels: Label[]; day_labels: DayLabel[]; preferences: Preferences };
export type OperationType = 'create_calendar' | 'rename_calendar' | 'create_label' | 'update_label' | 'set_label_status' | 'delete_label' | 'assign_label' | 'unassign_label' | 'create_and_assign' | 'promote_label' | 'update_preferences' | 'replace_from_backup';
export type Payload = Record<string, unknown>;
export type Operation = { id: string; user_id: string; type: OperationType; payload: Payload; created_at: string; sequence?: number; expected_revision?: string; state: 'pending' | 'conflict'; error?: string };
export type Backup = { schema_version: number; exported_at: string; calendars: CalendarDefinition[]; labels: Label[]; day_labels: DayLabel[]; preferences: Preferences };
export type DomainCode = 'VALIDATION_ERROR' | 'NAME_CONFLICT' | 'CALENDAR_NAME_CONFLICT' | 'CALENDAR_NOT_FOUND' | 'LABEL_NOT_FOUND' | 'LABEL_ARCHIVED' | 'REVISION_CONFLICT' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'TEMPORARY_FAILURE';
export class DomainError extends Error {
  constructor(public code: DomainCode, message: string, public retryAfterMs?: number) { super(message); }
}
