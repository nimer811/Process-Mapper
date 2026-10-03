const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(iso: string | null | undefined) {
  return iso ? dateFmt.format(new Date(iso)) : '—';
}

export function humanize(value: string) {
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
