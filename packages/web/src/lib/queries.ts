import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Profile, ProfilesQuery, UpdateProfileRequest } from '@saban/shared';
import { getProfiles, getProfile, updateProfile, getTags, getCurrentUser } from './api';

export const queryKeys = {
  user: ['user'] as const,
  profiles: (query: ProfilesQuery) => ['profiles', query] as const,
  profile: (id: number) => ['profile', id] as const,
  tags: ['tags'] as const,
};

export function useUser() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
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
