// People Data Labs API client for person enrichment

const PDL_API_BASE = 'https://api.peopledatalabs.com/v5';

function getApiKey(): string {
  const key = process.env.PDL_API_KEY;
  if (!key) {
    throw new Error('PDL_API_KEY not configured');
  }
  return key;
}

export interface PDLExperience {
  company?: {
    name?: string;
    size?: string;
    industry?: string;
    website?: string;
    linkedin_url?: string;
    founded?: number;
    location?: {
      name?: string;
      country?: string;
      region?: string;
      locality?: string;
    };
  };
  title?: {
    name?: string;
    role?: string;
    sub_role?: string;
    levels?: string[];
  };
  start_date?: string;
  end_date?: string;
  is_primary?: boolean;
  summary?: string;
  location_names?: string[];
}

export interface PDLEducation {
  school?: {
    name?: string;
    type?: string;
    website?: string;
    linkedin_url?: string;
    location?: {
      name?: string;
      country?: string;
    };
  };
  degrees?: string[];
  majors?: string[];
  minors?: string[];
  start_date?: string;
  end_date?: string;
  gpa?: number;
}

export interface PDLPerson {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;
  linkedin_url?: string;
  linkedin_username?: string;
  location_name?: string;
  location_country?: string;
  location_region?: string;
  location_locality?: string;
  job_title?: string;
  job_company_name?: string;
  job_company_website?: string;
  job_company_industry?: string;
  job_company_size?: string;
  job_start_date?: string;
  inferred_salary?: string;
  experience?: PDLExperience[];
  education?: PDLEducation[];
  skills?: string[];
  interests?: string[];
  certifications?: string[];
  languages?: string[];
  linkedin_connections?: number;
}

export interface PDLEnrichResponse {
  status: number;
  likelihood: number;
  data?: PDLPerson;
}

/**
 * Enrich a person by name and company using PDL API
 */
export async function enrichPerson(params: {
  firstName?: string;
  lastName?: string;
  name?: string;
  company?: string;
  linkedinUrl?: string;
}): Promise<PDLEnrichResponse> {
  const apiKey = getApiKey();

  const queryParams = new URLSearchParams();

  if (params.linkedinUrl) {
    queryParams.set('profile', params.linkedinUrl);
  } else {
    if (params.name) {
      queryParams.set('name', params.name);
    } else if (params.firstName && params.lastName) {
      queryParams.set('first_name', params.firstName);
      queryParams.set('last_name', params.lastName);
    }

    if (params.company) {
      queryParams.set('company', params.company);
    }
  }

  const url = `${PDL_API_BASE}/person/enrich?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`PDL enrichment failed: ${response.status}`, data);
    return {
      status: response.status,
      likelihood: 0,
    };
  }

  return data as PDLEnrichResponse;
}

/**
 * Check if PDL is configured
 */
export function isPDLConfigured(): boolean {
  return !!process.env.PDL_API_KEY;
}

/**
 * Convert PDL response to format compatible with our existing enrichment storage
 */
export function convertPDLToEnrichment(pdlPerson: PDLPerson): {
  connectionCount?: number;
  followerCount?: number;
  experience?: unknown;
  education?: unknown;
  skills?: string[];
  certifications?: unknown;
  languages?: unknown;
  about?: string;
  rawResponse: unknown;
} {
  return {
    connectionCount: pdlPerson.linkedin_connections,
    experience: pdlPerson.experience?.map((exp) => ({
      title: exp.title?.name,
      company: exp.company?.name,
      company_url: exp.company?.website,
      location: exp.location_names?.[0],
      start_date: exp.start_date,
      end_date: exp.end_date,
      description: exp.summary,
      is_primary: exp.is_primary,
    })),
    education: pdlPerson.education?.map((edu) => ({
      school: edu.school?.name,
      degree: edu.degrees?.[0],
      field_of_study: edu.majors?.[0],
      start_date: edu.start_date,
      end_date: edu.end_date,
    })),
    skills: pdlPerson.skills,
    certifications: pdlPerson.certifications?.map((cert) => ({ name: cert })),
    languages: pdlPerson.languages?.map((lang) => ({ language: lang })),
    about: pdlPerson.summary,
    rawResponse: {
      source: 'pdl',
      ...pdlPerson,
      // Include fields in BrightData-compatible format for AI scoring
      name: pdlPerson.full_name,
      headline: pdlPerson.headline || pdlPerson.job_title,
      location: pdlPerson.location_name,
      current_company_name: pdlPerson.job_company_name,
      current_company: {
        name: pdlPerson.job_company_name,
        link: pdlPerson.job_company_website,
      },
      connections: pdlPerson.linkedin_connections,
      url: pdlPerson.linkedin_url,
    },
  };
}
