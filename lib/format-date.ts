export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
}
