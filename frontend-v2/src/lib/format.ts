export function formatEnum(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatElapsedTime(createdAt?: string | null): string {
  if (!createdAt) return '—';
  const diffMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return '< 1m elapsed';
  if (diffMins < 60) return `${diffMins}m elapsed`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m elapsed`;
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}
