import type { Env } from './types';

// BrightData actual response structure (different from their docs)
interface BrightDataResponse {
  url: string;
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  headline?: string;
  location: string;
  about: string;
  avatar: string;
  followers: number;
  connections: number;
  experience: unknown[];
  education: unknown[];
  skills?: string[];
  certifications: unknown[];
  languages: unknown[];
  recommendations_count: number;
}

/**
 * Client for calling back to the Elysia server's internal API
 */
export class ServerClient {
  private serverUrl: string;
  private internalKey: string;

  constructor(env: Env) {
    this.serverUrl = env.SERVER_URL;
    this.internalKey = env.SERVER_INTERNAL_KEY;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': this.internalKey,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return (data as { data: T }).data;
  }

  /**
   * Store enrichment data for a profile by vanity name
   * Server will look up the profile by vanity name and store the enrichment
   */
  async storeEnrichmentByVanity(vanityName: string, data: BrightDataResponse): Promise<void> {
    await this.fetch('/api/internal/enrichments/by-vanity', {
      method: 'POST',
      body: JSON.stringify({
        vanityName,
        // Map BrightData field names to our schema
        connectionCount: data.connections,
        followerCount: data.followers,
        experience: data.experience,
        education: data.education,
        skills: data.skills,
        certifications: data.certifications,
        languages: data.languages,
        about: data.about,
        rawResponse: data,
      }),
    });
  }

  /**
   * Get URLs of profiles that haven't been enriched yet
   */
  async getUnenrichedProfileUrls(limit: number = 50): Promise<string[]> {
    const result = await this.fetch<{ urls: string[]; count: number }>(
      `/api/internal/enrichment/pending?limit=${limit}`
    );
    return result.urls;
  }

  /**
   * Trigger BrightData scrapes for unenriched profiles
   * Server will get pending URLs and trigger the scrape
   */
  async triggerUnenrichedScrapes(limit: number = 50): Promise<{ triggered: number; snapshotId?: string }> {
    return this.fetch<{ triggered: number; snapshotId?: string; message: string }>(
      '/api/internal/enrichment/trigger-scrape',
      {
        method: 'POST',
        body: JSON.stringify({ limit }),
      }
    );
  }

  /**
   * Run scoring for all pending profile-qualification pairs
   * This handles new qualifications being scored against existing enriched profiles
   */
  async runPendingScoring(limit: number = 50): Promise<{ scored: number; failed: number; remaining: number }> {
    return this.fetch<{ scored: number; failed: number; remaining: number; message: string }>(
      '/api/internal/scoring/run',
      {
        method: 'POST',
        body: JSON.stringify({ limit }),
      }
    );
  }

  /**
   * Enrich profiles using People Data Labs API
   * PDL provides better work history data than BrightData scraping
   */
  async enrichWithPDL(limit: number = 50): Promise<{ enriched: number; failed: number; total: number }> {
    return this.fetch<{ enriched: number; failed: number; total: number; message: string }>(
      '/api/internal/enrichment/pdl-all',
      {
        method: 'POST',
        body: JSON.stringify({ limit }),
      }
    );
  }
}
