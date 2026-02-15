import type {
  Profile,
  ProfilesQuery,
  ProfilesResponse,
  UpdateProfileRequest,
  User,
  Organization,
  OrganizationWithRole,
  OrganizationMember,
  ExtensionAuthResponse,
  CreateOrganizationRequest,
  InviteMemberRequest,
} from '@saban/shared';

const API_BASE = '/api';

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
