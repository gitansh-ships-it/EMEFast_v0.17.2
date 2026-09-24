export function formatEnum(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseUtcDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  // If the ISO string doesn't specify timezone offset (e.g. naive UTC from Python), append 'Z'
  let iso = s.replace(' ', 'T');
  if (!iso.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(iso)) {
    iso = `${iso}Z`;
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function formatElapsedTime(createdAt?: string | null): string {
  if (!createdAt) return '—';
  const parsed = parseUtcDate(createdAt);
  if (!parsed) return '—';
  const diffMs = Math.max(0, Date.now() - parsed.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return '< 1m elapsed';
  if (diffMins < 60) return `${diffMins}m elapsed`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m elapsed`;
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const parsed = parseUtcDate(dateStr);
  if (!parsed) return '—';
  try {
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}
