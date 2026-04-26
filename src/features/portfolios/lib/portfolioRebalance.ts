import type { PortfolioRebalanceCadence } from '@/types/portfolio';

export interface NextRebalanceWindow {
  nextDate: string | null;
  windowLabel: string;
  anchorText: string;
  inferred: boolean;
  basis: 'anchor' | 'cadence' | 'unknown';
  reason: string;
}

export function buildNextRebalanceWindow(input: {
  nextDate?: string | null;
  anchorText: string;
  inferred: boolean;
  basis: 'anchor' | 'cadence' | 'unknown';
  reason: string;
}): NextRebalanceWindow {
  return {
    nextDate: input.nextDate || null,
    windowLabel: formatDisplayDate(input.nextDate || null),
    anchorText: input.anchorText,
    inferred: input.inferred,
    basis: input.basis,
    reason: input.reason
  };
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string | null): string {
  if (!value) {
    return 'Not scheduled';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(`${value}T12:00:00Z`));
}

function parseWeekday(anchorText: string): number | null {
  const normalized = anchorText.trim().toLowerCase();
  const index = WEEKDAY_NAMES.findIndex((name) => normalized.includes(name));
  return index >= 0 ? index : null;
}

function parseMonthDay(anchorText: string): number | null {
  const isoMatch = anchorText.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return Number(isoMatch[3]);
  }

  const ordinalMatch = anchorText.match(/\b([12]?\d|3[01])(st|nd|rd|th)?\b/i);
  if (!ordinalMatch) {
    return null;
  }

  const parsed = Number(ordinalMatch[1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }

  return parsed;
}

function nextWeekday(baseDate: Date, weekday: number): Date {
  const candidate = new Date(baseDate);
  const offset = (weekday + 7 - candidate.getUTCDay()) % 7 || 7;
  candidate.setUTCDate(candidate.getUTCDate() + offset);
  return candidate;
}

function nextMonthDay(baseDate: Date, monthDay: number): Date {
  const candidate = addMonths(baseDate, 1);
  const safeDay = Math.min(monthDay, 28);
  candidate.setUTCDate(safeDay);
  return candidate;
}

export function deriveNextRebalanceWindow(input: {
  cadence: PortfolioRebalanceCadence;
  rebalanceAnchor: string;
  lastBuiltAt?: string | null;
  effectiveFrom?: string | null;
  asOfDate?: string | null;
}): NextRebalanceWindow {
  const baseValue = input.lastBuiltAt || input.asOfDate || input.effectiveFrom || null;
  if (!baseValue) {
    return {
      nextDate: null,
      windowLabel: 'Not scheduled',
      anchorText: input.rebalanceAnchor,
      inferred: true,
      basis: 'unknown',
      reason: 'No last build date or effective assignment date is available.'
    };
  }

  const baseDate = new Date(baseValue);
  if (Number.isNaN(baseDate.getTime())) {
    return {
      nextDate: null,
      windowLabel: 'Not scheduled',
      anchorText: input.rebalanceAnchor,
      inferred: true,
      basis: 'unknown',
      reason: 'The base rebalance date could not be parsed.'
    };
  }

  if (input.cadence === 'daily') {
    const nextDate = formatDate(addDays(baseDate, 1));
    return {
      nextDate,
      windowLabel: formatDisplayDate(nextDate),
      anchorText: input.rebalanceAnchor,
      inferred: false,
      basis: 'cadence',
      reason: 'Daily cadence advances one trading window from the last build.'
    };
  }

  if (input.cadence === 'weekly') {
    const parsedWeekday = parseWeekday(input.rebalanceAnchor);
    if (parsedWeekday !== null) {
      const nextDate = formatDate(nextWeekday(baseDate, parsedWeekday));
      return {
        nextDate,
        windowLabel: formatDisplayDate(nextDate),
        anchorText: input.rebalanceAnchor,
        inferred: false,
        basis: 'anchor',
        reason: 'Weekly cadence is anchored to the parsed weekday in the rebalance anchor.'
      };
    }

    const nextDate = formatDate(addDays(baseDate, 7));
    return {
      nextDate,
      windowLabel: formatDisplayDate(nextDate),
      anchorText: input.rebalanceAnchor,
      inferred: true,
      basis: 'cadence',
      reason: 'Anchor text could not be parsed cleanly; using last build plus one weekly cadence.'
    };
  }

  const parsedMonthDay = parseMonthDay(input.rebalanceAnchor);
  if (parsedMonthDay !== null) {
    const nextDate = formatDate(nextMonthDay(baseDate, parsedMonthDay));
    return {
      nextDate,
      windowLabel: formatDisplayDate(nextDate),
      anchorText: input.rebalanceAnchor,
      inferred: false,
      basis: 'anchor',
      reason: 'Monthly cadence is anchored to the parsed day in the rebalance anchor.'
    };
  }

  const nextDate = formatDate(addMonths(baseDate, 1));
  return {
    nextDate,
    windowLabel: formatDisplayDate(nextDate),
    anchorText: input.rebalanceAnchor,
    inferred: true,
    basis: 'cadence',
    reason: 'Anchor text could not be parsed cleanly; using last build plus one monthly cadence.'
  };
}
