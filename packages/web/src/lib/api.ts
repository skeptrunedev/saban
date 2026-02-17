import type {
  Profile,
  ProfileWithScore,
  ProfilesQuery,
  PaginatedResponse,
  UpdateProfileRequest,
  User,
  Organization,
  OrganizationWithRole,
  OrganizationMember,
  ExtensionAuthResponse,
  CreateOrganizationRequest,
  InviteMemberRequest,
  JobQualification,
  CreateQualificationRequest,
  UpdateQualificationRequest,
  ProfileEnrichment,
  QualificationResult,
  EnrichmentJob,
} from '@saban/shared';

export type ProfilesResponse = PaginatedResponse<ProfileWithScore>;

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return res.json();
}

// ==================== AUTH ====================

export interface AuthMeResponse {
  user: User;
  organizations: OrganizationWithRole[];
  currentOrganization: Organization | null;
}

export async function getCurrentUser(): Promise<AuthMeResponse | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetchApi('/auth/logout', { method: 'POST' });
}

export async function selectOrganization(
  organizationId: string
): Promise<{ organization: Organization }> {
  const res = await fetchApi<{ success: boolean; data: { organization: Organization } }>(
    '/auth/select-organization',
    {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    }
  );
  return res.data;
}

export async function getExtensionToken(): Promise<ExtensionAuthResponse> {
  const res = await fetchApi<{ success: boolean; data: ExtensionAuthResponse }>(
    '/auth/extension-token'
  );
  return res.data;
}

// ==================== ORGANIZATIONS ====================

export async function createOrganization(data: CreateOrganizationRequest): Promise<Organization> {
  const res = await fetchApi<{ success: boolean; data: Organization }>('/organizations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function getOrganizations(): Promise<OrganizationWithRole[]> {
  const res = await fetchApi<{ success: boolean; data: OrganizationWithRole[] }>('/organizations');
  return res.data;
}

export async function getOrganization(id: string): Promise<Organization> {
  const res = await fetchApi<{ success: boolean; data: Organization }>(`/organizations/${id}`);
  return res.data;
}

export async function getOrganizationMembers(id: string): Promise<OrganizationMember[]> {
  const res = await fetchApi<{ success: boolean; data: OrganizationMember[] }>(
    `/organizations/${id}/members`
  );
  return res.data;
}

export async function inviteOrganizationMember(
  orgId: string,
  data: InviteMemberRequest
): Promise<{ id: string; email: string; state: string; expiresAt: string }> {
  const res = await fetchApi<{
    success: boolean;
    data: { id: string; email: string; state: string; expiresAt: string };
  }>(`/organizations/${orgId}/invitations`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function removeOrganizationMember(orgId: string, userId: string): Promise<void> {
  await fetchApi(`/organizations/${orgId}/members/${userId}`, {
    method: 'DELETE',
  });
}

// ==================== PROFILES ====================

export async function getProfiles(query: ProfilesQuery): Promise<ProfilesResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.tags?.length) params.set('tags', query.tags.join(','));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  if (query.qualificationId) params.set('qualificationId', String(query.qualificationId));

  const res = await fetchApi<{ success: boolean; data: ProfilesResponse }>(
    `/profiles?${params.toString()}`
  );
  return res.data;
}

export async function getProfile(id: number): Promise<Profile> {
  const res = await fetchApi<{ success: boolean; data: Profile }>(`/profiles/${id}`);
  return res.data;
}

export async function updateProfile(id: number, updates: UpdateProfileRequest): Promise<Profile> {
  const res = await fetchApi<{ success: boolean; data: Profile }>(`/profiles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.data;
}

export async function getTags(): Promise<string[]> {
  const res = await fetchApi<{ success: boolean; data: string[] }>('/profiles/tags');
  return res.data;
}

export function getExportUrl(query: Omit<ProfilesQuery, 'page' | 'limit'>): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.tags?.length) params.set('tags', query.tags.join(','));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);

  return `${API_BASE}/profiles/export?${params.toString()}`;
}

// ==================== QUALIFICATIONS ====================

export async function getQualifications(): Promise<JobQualification[]> {
  const res = await fetchApi<{ success: boolean; data: JobQualification[] }>('/qualifications');
  return res.data;
}

export async function getQualification(id: number): Promise<JobQualification> {
  const res = await fetchApi<{ success: boolean; data: JobQualification }>(`/qualifications/${id}`);
  return res.data;
}

export async function createQualification(
  data: CreateQualificationRequest
): Promise<JobQualification> {
  const res = await fetchApi<{ success: boolean; data: JobQualification }>('/qualifications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function updateQualification(
  id: number,
  data: UpdateQualificationRequest
): Promise<JobQualification> {
  const res = await fetchApi<{ success: boolean; data: JobQualification }>(
    `/qualifications/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
  return res.data;
}

export async function deleteQualification(id: number): Promise<void> {
  await fetchApi(`/qualifications/${id}`, { method: 'DELETE' });
}

// ==================== ENRICHMENT ====================

export async function startEnrichment(
  profileIds: number[],
  qualificationId?: number
): Promise<{ job: EnrichmentJob }> {
  const res = await fetchApi<{ success: boolean; data: { job: EnrichmentJob } }>(
    '/enrichment/enrich',
    {
      method: 'POST',
      body: JSON.stringify({ profileIds, qualificationId }),
    }
  );
  return res.data;
}

export async function getEnrichmentJobs(): Promise<EnrichmentJob[]> {
  const res = await fetchApi<{ success: boolean; data: EnrichmentJob[] }>('/enrichment/jobs');
  return res.data;
}

export async function getEnrichmentJob(id: string): Promise<EnrichmentJob> {
  const res = await fetchApi<{ success: boolean; data: EnrichmentJob }>(`/enrichment/jobs/${id}`);
  return res.data;
}

export async function getProfileEnrichment(profileId: number): Promise<ProfileEnrichment | null> {
  const res = await fetchApi<{ success: boolean; data: ProfileEnrichment | null }>(
    `/enrichment/profiles/${profileId}`
  );
  return res.data;
}

export async function getProfileQualifications(profileId: number): Promise<QualificationResult[]> {
  const res = await fetchApi<{ success: boolean; data: QualificationResult[] }>(
    `/enrichment/profiles/${profileId}/qualifications`
  );
  return res.data;
}

// ==================== REVIEW QUEUE ====================

export async function getReviewQueue(limit?: number): Promise<ProfileWithScore[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));

  const res = await fetchApi<{
    success: boolean;
    data: { items: ProfileWithScore[]; total: number };
  }>(`/profiles/review-queue?${params.toString()}`);
  return res.data.items;
}

export async function getNextReviewProfile(currentId: number): Promise<ProfileWithScore | null> {
  const res = await fetchApi<{
    success: boolean;
    data: ProfileWithScore | null;
    message?: string;
  }>(`/profiles/next-review/${currentId}`);
  return res.data;
}
