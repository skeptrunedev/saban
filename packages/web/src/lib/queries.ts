import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ProfilesQuery,
  UpdateProfileRequest,
  CreateQualificationRequest,
  UpdateQualificationRequest,
} from '@saban/shared';
import {
  getProfiles,
  getProfile,
  updateProfile,
  getTags,
  getCurrentUser,
  getOrganizations,
  getOrganizationMembers,
  createOrganization,
  selectOrganization,
  inviteOrganizationMember,
  removeOrganizationMember,
  getQualifications,
  getQualification,
  createQualification,
  updateQualification,
  deleteQualification,
  startEnrichment,
  getEnrichmentJobs,
  getEnrichmentJob,
  getProfileEnrichment,
  getProfileQualifications,
  type AuthMeResponse,
} from './api';

export const queryKeys = {
  user: ['user'] as const,
  profiles: (query: ProfilesQuery) => ['profiles', query] as const,
  profile: (id: number) => ['profile', id] as const,
  tags: ['tags'] as const,
  organizations: ['organizations'] as const,
  organizationMembers: (orgId: string) => ['organizationMembers', orgId] as const,
  qualifications: ['qualifications'] as const,
  qualification: (id: number) => ['qualification', id] as const,
  enrichmentJobs: ['enrichmentJobs'] as const,
  enrichmentJob: (id: string) => ['enrichmentJob', id] as const,
  profileEnrichment: (profileId: number) => ['profileEnrichment', profileId] as const,
  profileQualifications: (profileId: number) => ['profileQualifications', profileId] as const,
};

export function useUser() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    select: (data) => data?.user ?? null,
  });
}

export function useAuthData() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: getOrganizations,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrganizationMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.organizationMembers(orgId || ''),
    queryFn: () => getOrganizationMembers(orgId!),
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
    },
  });
}

export function useSelectOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (organizationId: string) => selectOrganization(organizationId),
    onSuccess: (data) => {
      // Optimistically update the current organization in the cache
      queryClient.setQueryData(queryKeys.user, (old: AuthMeResponse | null) => {
        if (!old) return old;
        return {
          ...old,
          currentOrganization: data.organization,
        };
      });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      email,
      role,
    }: {
      orgId: string;
      email: string;
      role?: 'admin' | 'member';
    }) => inviteOrganizationMember(orgId, { email, role }),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembers(orgId) });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      removeOrganizationMember(orgId, userId),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembers(orgId) });
    },
  });
}

export function useProfiles(query: ProfilesQuery) {
  return useQuery({
    queryKey: queryKeys.profiles(query),
    queryFn: () => getProfiles(query),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  });
}

export function useProfile(id: number) {
  return useQuery({
    queryKey: queryKeys.profile(id),
    queryFn: () => getProfile(id),
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: getTags,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: UpdateProfileRequest }) =>
      updateProfile(id, updates),
    onSuccess: (updatedProfile) => {
      // Update the individual profile cache
      queryClient.setQueryData(queryKeys.profile(updatedProfile.id), updatedProfile);

      // Invalidate profiles list to reflect changes
      queryClient.invalidateQueries({ queryKey: ['profiles'] });

      // Invalidate tags if tags were updated
      queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
}

// ==================== QUALIFICATIONS ====================

export function useQualifications() {
  return useQuery({
    queryKey: queryKeys.qualifications,
    queryFn: getQualifications,
    staleTime: 5 * 60 * 1000,
  });
}

export function useQualification(id: number) {
  return useQuery({
    queryKey: queryKeys.qualification(id),
    queryFn: () => getQualification(id),
    staleTime: 5 * 60 * 1000,
    enabled: id > 0,
  });
}

export function useCreateQualification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQualificationRequest) => createQualification(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.qualifications });
    },
  });
}

export function useUpdateQualification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateQualificationRequest }) =>
      updateQualification(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.qualification(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.qualifications });
    },
  });
}

export function useDeleteQualification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteQualification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.qualifications });
    },
  });
}

// ==================== ENRICHMENT ====================

export function useEnrichmentJobs() {
  return useQuery({
    queryKey: queryKeys.enrichmentJobs,
    queryFn: getEnrichmentJobs,
    staleTime: 10 * 1000, // 10 seconds - jobs update frequently
    refetchInterval: 5000, // Poll every 5 seconds for active jobs
  });
}

export function useEnrichmentJob(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.enrichmentJob(id || ''),
    queryFn: () => getEnrichmentJob(id!),
    enabled: !!id,
    staleTime: 5 * 1000,
    refetchInterval: (query) => {
      // Stop polling once job is complete or failed
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 3000; // Poll every 3 seconds while active
    },
  });
}

export function useStartEnrichment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      profileIds,
      qualificationId,
    }: {
      profileIds: number[];
      qualificationId?: number;
    }) => startEnrichment(profileIds, qualificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.enrichmentJobs });
    },
  });
}

export function useProfileEnrichment(profileId: number) {
  return useQuery({
    queryKey: queryKeys.profileEnrichment(profileId),
    queryFn: () => getProfileEnrichment(profileId),
    staleTime: 60 * 1000,
    enabled: profileId > 0,
  });
}

export function useProfileQualifications(profileId: number) {
  return useQuery({
    queryKey: queryKeys.profileQualifications(profileId),
    queryFn: () => getProfileQualifications(profileId),
    staleTime: 60 * 1000,
    enabled: profileId > 0,
  });
}
