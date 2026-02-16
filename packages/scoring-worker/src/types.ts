export interface Env {
  ANTHROPIC_API_KEY: string;
  SERVER_URL: string;
  SERVER_INTERNAL_KEY: string;
}

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

export interface ProfileToScore {
  profileId: number;
  qualificationId: number;
  qualificationName: string;
  criteria: QualificationCriteria;
  rawResponse: BrightDataProfile;
}

export interface BrightDataProfile {
  url?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  about?: string;
  connections?: number;
  followers?: number;
  experience?: Array<{
    title?: string;
    company?: string;
    start_date?: string;
    end_date?: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    field_of_study?: string;
  }>;
  skills?: string[];
  certifications?: Array<{
    name?: string;
    issuing_organization?: string;
  }>;
  languages?: Array<{
    language?: string;
    proficiency?: string;
  }>;
}

export interface ScoringResult {
  score: number;
  reasoning: string;
  passed: boolean;
}
