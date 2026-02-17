// Database Profile type matching similar_profiles table
export interface Profile {
  id: number;
  source_profile_url: string | null;
  source_section: string | null;
  profile_url: string;
  vanity_name: string | null;
  first_name: string | null;
  last_name: string | null;
  member_urn: string | null;
  headline: string | null;
  profile_picture_url: string | null;
  location: string | null;
  connection_degree: string | null;
  profile_picture_payload: string | null;
  raw_data: Record<string, unknown> | null;
  captured_at: Date;
  notes: string | null;
  tags: string[] | null;
  status: 'new' | 'contacted' | 'replied' | 'qualified' | 'disqualified';
  organization_id: string | null;
  created_by_user_id: string | null;
}

// WorkOS User type
export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  currentOrganizationId?: string | null;
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  createdAt: Date;
}

export interface OrganizationMember {
  userId: string;
  organizationId: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  user?: User;
}

export interface OrganizationWithRole extends Organization {
  role: 'admin' | 'member';
}

// Extension auth response
export interface ExtensionAuthResponse {
  token: string;
  user: User;
  organization: Organization | null;
  expiresAt: number;
}

// API Request types
export interface CreateProfilesRequest {
  profiles: Array<{
    profileUrl: string;
    vanityName?: string;
    firstName?: string;
    lastName?: string;
    memberUrn?: string;
    headline?: string;
    profilePictureUrl?: string;
    location?: string;
    connectionDegree?: string;
    profilePicturePayload?: string;
    raw?: Record<string, unknown>;
  }>;
  sourceProfileUrl: string;
  sourceSection: string;
}

export interface UpdateProfileRequest {
  notes?: string;
  tags?: string[];
  status?: Profile['status'];
  reviewedAt?: boolean;
  contactedAt?: boolean;
}

export interface ProfilesQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: Profile['status'];
  tags?: string[];
  sortBy?: 'captured_at' | 'first_name' | 'last_name' | 'best_score';
  sortOrder?: 'asc' | 'desc';
  qualificationId?: number; // Filter by profiles with scores for this qualification
}

// Profile with enrichment and qualification status (for list views)
export interface ProfileWithScore extends Profile {
  best_score: number | null;
  best_score_passed: boolean | null;
  best_qualification_id: number | null;
  best_qualification_name: string | null;
  is_enriched: boolean;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type ProfilesResponse = PaginatedResponse<Profile>;

export interface StatsResponse {
  total: number;
}

export interface AuthResponse {
  user: User;
  organizations?: OrganizationWithRole[];
}

export interface SelectOrganizationRequest {
  organizationId: string;
}

export interface CreateOrganizationRequest {
  name: string;
}

export interface InviteMemberRequest {
  email: string;
  role?: 'admin' | 'member';
}

// ==================== QUALIFICATION TYPES ====================

export interface JobQualification {
  id: number;
  organization_id: string;
  name: string;
  description: string | null;
  criteria: QualificationCriteria;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
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
  customPrompt?: string; // Additional AI prompt for nuanced evaluation
}

export interface CreateQualificationRequest {
  name: string;
  description?: string;
  criteria: QualificationCriteria;
}

export interface UpdateQualificationRequest {
  name?: string;
  description?: string;
  criteria?: QualificationCriteria;
}

// ==================== ENRICHMENT TYPES ====================

export interface ProfileEnrichment {
  id: number;
  profile_id: number;
  connection_count: number | null;
  follower_count: number | null;
  experience: EnrichmentExperience[] | null;
  education: EnrichmentEducation[] | null;
  skills: string[] | null;
  certifications: EnrichmentCertification[] | null;
  languages: EnrichmentLanguage[] | null;
  about: string | null;
  raw_response: Record<string, unknown> | null;
  enriched_at: Date;
}

export interface EnrichmentExperience {
  title: string;
  company: string;
  company_url?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  duration?: string;
  description?: string;
}

export interface EnrichmentEducation {
  school: string;
  school_url?: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface EnrichmentCertification {
  name: string;
  issuing_organization?: string;
  issue_date?: string;
  credential_id?: string;
  credential_url?: string;
}

export interface EnrichmentLanguage {
  language: string;
  proficiency?: string;
}

// ==================== QUALIFICATION RESULT TYPES ====================

export interface QualificationResult {
  id: number;
  profile_id: number;
  qualification_id: number;
  score: number;
  reasoning: string | null;
  passed: boolean;
  evaluated_at: Date;
  qualification?: JobQualification;
}

// ==================== ENRICHMENT JOB TYPES ====================

export type EnrichmentJobStatus =
  | 'pending'
  | 'scraping'
  | 'enriching'
  | 'qualifying'
  | 'completed'
  | 'failed';

export interface EnrichmentJob {
  id: string;
  snapshot_id: string | null;
  profile_ids: number[];
  qualification_id: number | null;
  organization_id: string;
  status: EnrichmentJobStatus;
  error: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface CreateEnrichmentJobRequest {
  profileIds: number[];
  qualificationId?: number;
}

export interface EnrichmentJobResponse {
  job: EnrichmentJob;
}

// ==================== PROFILE WITH ENRICHMENT ====================

export interface ProfileWithEnrichment extends Profile {
  enrichment?: ProfileEnrichment | null;
  qualifications?: QualificationResult[];
}
