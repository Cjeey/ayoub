import { t } from '../i18n/strings';

/** "YYYY-MM-DD" in the device's local timezone — used as a grouping key. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Human label for a date key: اليوم / غدا / full Arabic date. */
export function dateLabel(dateKey: string): string {
  const today = localDateKey(new Date().toISOString());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow.toISOString());

  if (dateKey === today) return t.today;
  if (dateKey === tomorrowKey) return t.tomorrow;

  const d = new Date(`${dateKey}T12:00:00`);
  try {
    return d.toLocaleDateString('ar-MA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return dateKey;
  }
}

/** Kickoff time as HH:MM in the device's local timezone. */
export function kickoffTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Short countdown text like "من بعد 2 أيام و 3 سوايع". */
export function countdownText(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return '';
  const totalHours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `من بعد ${days} ${days === 1 ? 'يوم' : 'أيام'} و ${hours} ${hours === 1 ? 'ساعة' : 'سوايع'}`;
  if (hours > 0) return `من بعد ${hours} ${hours === 1 ? 'ساعة' : 'سوايع'}`;
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  return `من بعد ${minutes} دقيقة`;
}
