export function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= '1900-01-01' && day <= '2100-12-31' && dateString(parseDay(day)) === day;
}
export function monthDays(year: number, month: number): string[] {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const fieldCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: fieldCount }, (_, i) => dateString(new Date(year, month, 1 - offset + i, 12)));
}
export function fullDate(day: string): string {
  const text = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseDay(day));
  return text[0].toUpperCase() + text.slice(1);
}
export function searchKey(value: string): string { return value.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').trim(); }
