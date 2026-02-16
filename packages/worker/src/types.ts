// Environment bindings for the worker
export interface Env {
  // Queue binding
  ENRICHMENT_QUEUE: Queue<EnrichmentJobMessage>;

  // R2 bucket for BrightData results
  BRIGHTDATA_RESULTS: R2Bucket;

  // Secrets (set via wrangler secret)
  BRIGHTDATA_API_KEY: string;
  BRIGHTDATA_DATASET_ID: string;
  ANTHROPIC_API_KEY: string;
  SERVER_URL: string; // URL to call back to the server
  SERVER_INTERNAL_KEY: string; // Secret key for internal API calls

  // R2 credentials for BrightData delivery (set via wrangler secret)
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

// Message format for the queue
export interface EnrichmentJobMessage {
  jobId: string;
  profileIds: number[];
  profileUrls: string[];
  qualificationId?: number;
  organizationId: string;
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

// Qualification criteria
export interface QualificationCriteria {
  minConnections?: number;
  minFollowers?: number;
  requiredSkills?: string[];
  preferredSkills?: string[];
  minExperienceYears?: number;
  requiredTitles?: string[];
  preferredTitles?: string[];
  requiredCompanies?: string[];
  preferredCompanies?: string[];
  requiredEducation?: string[];
  customPrompt?: string;
}

export interface JobQualification {
  id: number;
  name: string;
  criteria: QualificationCriteria;
}
