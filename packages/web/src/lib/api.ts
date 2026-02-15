import type {
  Profile,
  ProfilesQuery,
  ProfilesResponse,
  UpdateProfileRequest,
  User,
} from '@saban/shared';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
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

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.user || null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetchApi('/auth/logout', { method: 'POST' });
}

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

export async function updateProfile(
  id: number,
  updates: UpdateProfileRequest
): Promise<Profile> {
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
