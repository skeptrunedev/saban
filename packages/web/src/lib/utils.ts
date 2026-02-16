import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a timestamp from the database as UTC.
 * Database stores timestamps without timezone info but in UTC.
 * This ensures JavaScript correctly interprets them as UTC.
 */
export function parseUTCTimestamp(timestamp: string | Date | unknown): Date {
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp !== 'string') return new Date(timestamp as string);
  // If no timezone indicator, treat as UTC
  if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
    return new Date(timestamp + 'Z');
  }
  return new Date(timestamp);
}
