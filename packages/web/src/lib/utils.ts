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

/**
 * Proxy an image URL through our server to avoid CORS issues.
 * Only proxies LinkedIn CDN URLs, returns original URL for others.
 */
export function getProxiedImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  // Check if this is a LinkedIn CDN URL that needs proxying
  const linkedinDomains = [
    'media.licdn.com',
    'media-exp1.licdn.com',
    'media-exp2.licdn.com',
    'static.licdn.com',
  ];
  try {
    const urlObj = new URL(url);
    if (linkedinDomains.some((domain) => urlObj.hostname.endsWith(domain))) {
      // Base64 encode the URL and proxy it
      const encoded = btoa(url);
      return `/api/image-proxy?url=${encodeURIComponent(encoded)}`;
    }
  } catch {
    // Invalid URL, return as-is
  }

  // Return original URL for data URLs, non-LinkedIn URLs, etc.
  return url;
}
