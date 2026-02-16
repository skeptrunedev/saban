// Environment bindings for the worker
export interface Env {
  // R2 bucket for BrightData results
  BRIGHTDATA_RESULTS: R2Bucket;

  // Secrets (set via wrangler secret)
  ANTHROPIC_API_KEY: string;
  SERVER_URL: string; // URL to call back to the server
  SERVER_INTERNAL_KEY: string; // Secret key for internal API calls
}

// BrightData types
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
