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
}

export interface ProfilesQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: Profile['status'];
  tags?: string[];
  sortBy?: 'captured_at' | 'first_name' | 'last_name';
  sortOrder?: 'asc' | 'desc';
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

export interface ProfilesResponse extends PaginatedResponse<Profile> {}

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
