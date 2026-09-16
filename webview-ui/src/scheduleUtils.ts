import type { ScheduleEntry } from '../../shared/protocol.js';

const DAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeCadence(s: ScheduleEntry): string {
  if (s.kind === 'interval') return `Every ${s.everyMinutes}m`;
  if (s.kind === 'weekly') {
    const days = (s.days ?? []).map((d) => DAY_ABBREV[d] ?? '?').join('/');
    return `${days} ${s.time ?? ''}`.trim();
  }
  return `Daily ${s.time ?? ''}`.trim();
}

export function workspaceBasename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
