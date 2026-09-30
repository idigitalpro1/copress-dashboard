const timestampFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' });

export function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? timestampFormatter.format(date) : 'Timestamp unavailable';
}
