const LONDON = 'Europe/London';

/**
 * Calendar date (YYYY-MM-DD) in London. Visits are logged by the day people ate
 * there, and a late dinner in BST is still "today" even when UTC has rolled over.
 */
export function londonDateString(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
