// BrightData LinkedIn API client
// Server triggers scrapes with R2 delivery config, Worker processes results

function getBrightDataApiKey() {
  return process.env.BRIGHTDATA_API_KEY;
}
function getBrightDataDatasetId() {
  return process.env.BRIGHTDATA_DATASET_ID || 'gd_l1viktl72bvl7bjuj0';
}
function getR2AccessKey() {
  return process.env.R2_ACCESS_KEY_ID;
}
function getR2SecretKey() {
  return process.env.R2_SECRET_ACCESS_KEY;
}

const BRIGHTDATA_BASE_URL = 'https://api.brightdata.com';
const R2_ENDPOINT = 'https://2f016a113dca4bbf3eda769b3f7d12fd.r2.cloudflarestorage.com';
const R2_BUCKET = 'saban-brightdata-results';

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

export interface ScrapeError {
  url: string;
  error: string;
}

interface R2DeliveryConfig {
  type: 's3';
  filename: {
    template: string;
    extension: string;
  };
  bucket: string;
  endpoint_url: string;
  credentials: {
    'aws-access-key': string;
    'aws-secret-key': string;
  };
  directory: string;
  compress: boolean;
}

/**
 * Trigger a LinkedIn profile scrape via BrightData with R2 delivery
 * @param profileUrls Array of LinkedIn profile URLs to scrape
 * @returns snapshot_id from BrightData
 */
export async function triggerScrape(profileUrls: string[]): Promise<string> {
  const apiKey = getBrightDataApiKey();
  const r2AccessKey = getR2AccessKey();
  const r2SecretKey = getR2SecretKey();

  if (!apiKey) {
    throw new Error('BRIGHTDATA_API_KEY not configured');
  }
  if (!r2AccessKey || !r2SecretKey) {
    throw new Error('R2 credentials not configured');
  }

  const deliveryConfig: R2DeliveryConfig = {
    type: 's3',
    filename: {
      template: '{[job]}',
      extension: 'json',
    },
    bucket: R2_BUCKET,
    endpoint_url: R2_ENDPOINT,
    credentials: {
      'aws-access-key': r2AccessKey,
      'aws-secret-key': r2SecretKey,
    },
    directory: '',
    compress: true,
  };

  const response = await fetch(
    `${BRIGHTDATA_BASE_URL}/datasets/v3/trigger?dataset_id=${getBrightDataDatasetId()}&include_errors=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: profileUrls.map((url) => ({ url })),
        deliver: deliveryConfig,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BrightData trigger failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { snapshot_id: string };
  console.log(`BrightData scrape triggered: snapshot=${data.snapshot_id}`);
  return data.snapshot_id;
}

/**
 * Check if BrightData is configured
 */
export function isBrightDataConfigured(): boolean {
  return !!(getBrightDataApiKey() && getR2AccessKey() && getR2SecretKey());
}

/**
 * Check if a result is an error
 */
export function isError(result: BrightDataProfile | ScrapeError): result is ScrapeError {
  return 'error' in result;
}
