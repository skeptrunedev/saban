// BrightData LinkedIn API client
// Docs: https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/linkedin/profiles

// Read env vars at runtime to avoid ESM hoisting issues
function getBrightDataApiKey() {
  return process.env.BRIGHTDATA_API_KEY;
}
function getBrightDataDatasetId() {
  return process.env.BRIGHTDATA_DATASET_ID || 'gd_l1viktl72bvl7bjuj0';
}
const BRIGHTDATA_BASE_URL = 'https://api.brightdata.com';

export interface BrightDataProfile {
  url: string;
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  headline: string;
  location: string;
  about: string;
  avatar: string;
  banner: string;
  follower_count: number;
  connection_count: number;
  experience: BrightDataExperience[];
  education: BrightDataEducation[];
  skills: string[];
  certifications: BrightDataCertification[];
  languages: BrightDataLanguage[];
  recommendations_count: number;
  posts: unknown[];
  people_also_viewed: unknown[];
}

export interface BrightDataExperience {
  title: string;
  company: string;
  company_url?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  duration?: string;
  description?: string;
}

export interface BrightDataEducation {
  school: string;
  school_url?: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface BrightDataCertification {
  name: string;
  issuing_organization?: string;
  issue_date?: string;
  credential_id?: string;
  credential_url?: string;
}

export interface BrightDataLanguage {
  language: string;
  proficiency?: string;
}

export interface ScrapeResponse {
  snapshot_id: string;
}

export interface ScrapeError {
  url: string;
  error: string;
}

export type SnapshotStatus = 'running' | 'ready' | 'failed';

export interface SnapshotProgress {
  status: SnapshotStatus;
  progress?: number;
}

/**
 * Trigger a LinkedIn profile scrape via BrightData
 * @param profileUrls Array of LinkedIn profile URLs to scrape
 * @returns snapshot_id for polling results
 */
export async function triggerScrape(profileUrls: string[]): Promise<string> {
  if (!getBrightDataApiKey()) {
    throw new Error('getBrightDataApiKey() not configured');
  }

  const response = await fetch(
    `${BRIGHTDATA_BASE_URL}/datasets/v3/scrape?dataset_id=${getBrightDataDatasetId()}&notify=false&include_errors=true`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getBrightDataApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: profileUrls.map(url => ({ url })),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BrightData scrape failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as ScrapeResponse;
  return data.snapshot_id;
}

/**
 * Check the progress of a scrape job
 */
export async function getSnapshotProgress(snapshotId: string): Promise<SnapshotProgress> {
  if (!getBrightDataApiKey()) {
    throw new Error('getBrightDataApiKey() not configured');
  }

  const response = await fetch(
    `${BRIGHTDATA_BASE_URL}/datasets/v3/progress/${snapshotId}`,
    {
      headers: {
        'Authorization': `Bearer ${getBrightDataApiKey()}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BrightData progress check failed: ${response.status} - ${error}`);
  }

  return response.json() as Promise<SnapshotProgress>;
}

/**
 * Get the results of a completed scrape
 * Returns 202 if still processing, 200 when complete
 */
export async function getSnapshotResults(snapshotId: string): Promise<{
  status: 'processing' | 'complete';
  data?: (BrightDataProfile | ScrapeError)[];
}> {
  if (!getBrightDataApiKey()) {
    throw new Error('getBrightDataApiKey() not configured');
  }

  const response = await fetch(
    `${BRIGHTDATA_BASE_URL}/datasets/v3/snapshot/${snapshotId}?format=json`,
    {
      headers: {
        'Authorization': `Bearer ${getBrightDataApiKey()}`,
      },
    }
  );

  if (response.status === 202) {
    return { status: 'processing' };
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BrightData snapshot fetch failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as (BrightDataProfile | ScrapeError)[];
  return { status: 'complete', data };
}

/**
 * Poll for scrape results with exponential backoff
 * @param snapshotId The snapshot ID to poll
 * @param maxAttempts Maximum polling attempts (default 30)
 * @param initialDelayMs Initial delay between polls in ms (default 2000)
 */
export async function pollForResults(
  snapshotId: string,
  maxAttempts = 30,
  initialDelayMs = 2000
): Promise<(BrightDataProfile | ScrapeError)[]> {
  let attempts = 0;
  let delayMs = initialDelayMs;

  while (attempts < maxAttempts) {
    const result = await getSnapshotResults(snapshotId);

    if (result.status === 'complete' && result.data) {
      return result.data;
    }

    attempts++;
    await sleep(delayMs);
    // Exponential backoff, max 30 seconds
    delayMs = Math.min(delayMs * 1.5, 30000);
  }

  throw new Error(`Scrape timed out after ${maxAttempts} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a result is an error
 */
export function isError(result: BrightDataProfile | ScrapeError): result is ScrapeError {
  return 'error' in result;
}
