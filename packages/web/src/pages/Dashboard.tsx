import { useMemo, useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Profile, ProfileWithScore, ProfilesQuery } from '@saban/shared';
import { useProfiles, useTags, useStartEnrichment, useQualifications, useReviewQueue } from '@/lib/queries';
import { SearchBar } from '@/components/SearchBar';
import { FilterPanel } from '@/components/FilterPanel';
import { LeadsTable } from '@/components/LeadsTable';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkles, ChevronDown, Loader2, PlayCircle } from 'lucide-react';

export function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Read state from URL params with defaults
  const page = parseInt(searchParams.get('page') || '1', 10);
  const search = searchParams.get('search') || '';
  const status = (searchParams.get('status') as Profile['status'] | '') || '';
  const selectedTags = searchParams.get('tags')?.split(',').filter(Boolean) || [];
  const sortBy = (searchParams.get('sortBy') as ProfilesQuery['sortBy']) || 'captured_at';
  const sortOrder = (searchParams.get('sortOrder') as ProfilesQuery['sortOrder']) || 'desc';

  const enrichMutation = useStartEnrichment();
  const { data: qualifications } = useQualifications();
  const { data: reviewQueue } = useReviewQueue();

  // Helper to update URL params
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === '' || (value === '1' && key === 'page')) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const query = useMemo<ProfilesQuery>(
    () => ({
      page,
      limit: 50,
      search: search || undefined,
      status: status || undefined,
      tags: selectedTags.length ? selectedTags : undefined,
      sortBy,
      sortOrder,
    }),
    [page, search, status, selectedTags, sortBy, sortOrder]
  );

  const { data, isLoading, isFetching } = useProfiles(query);
  const { data: availableTags = [] } = useTags();

  const handleSearchChange = (value: string) => {
    updateParams({ search: value || undefined, page: '1' });
  };

  const handleStatusChange = (value: Profile['status'] | '') => {
    updateParams({ status: value || undefined, page: '1' });
  };

  const handleTagsChange = (tags: string[]) => {
    updateParams({ tags: tags.length ? tags.join(',') : undefined, page: '1' });
  };

  const handleProfileClick = (profile: ProfileWithScore) => {
    navigate(`/leads/${profile.id}`);
  };

  const handleSortChange = (
    newSortBy: ProfilesQuery['sortBy'],
    newSortOrder: ProfilesQuery['sortOrder']
  ) => {
    updateParams({ sortBy: newSortBy, sortOrder: newSortOrder });
  };

  const handlePageChange = (newPage: number) => {
    updateParams({ page: String(newPage) });
  };

  const handleSelectionChange = (ids: number[]) => {
    setSelectedIds(ids);
  };

  const handleBulkEnrich = async (qualificationId?: number) => {
    if (selectedIds.length === 0) return;
    await enrichMutation.mutateAsync({ profileIds: selectedIds, qualificationId });
    setSelectedIds([]);
  };

  const profiles = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground">
            {total} total leads
            {selectedIds.length > 0 && (
              <span className="ml-2 text-primary font-medium">({selectedIds.length} selected)</span>
            )}
            {isFetching && !isLoading && <span className="ml-2 text-xs">(updating...)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={enrichMutation.isPending}>
                  {enrichMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enriching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Enrich ({selectedIds.length})
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleBulkEnrich()}>
                  Enrich only (no scoring)
                </DropdownMenuItem>
                {qualifications && qualifications.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {qualifications.map((qual) => (
                      <DropdownMenuItem key={qual.id} onClick={() => handleBulkEnrich(qual.id)}>
                        Enrich + Score: {qual.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant={reviewQueue && reviewQueue.length > 0 ? 'default' : 'outline'}
            onClick={() => navigate('/review')}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            Review {reviewQueue && reviewQueue.length > 0 ? `(${reviewQueue.length})` : ''}
          </Button>
          <ExportButton
            query={{
              search: search || undefined,
              status: status || undefined,
              tags: selectedTags.length ? selectedTags : undefined,
              sortBy,
              sortOrder,
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-72">
          <SearchBar value={search} onChange={handleSearchChange} />
        </div>
        <FilterPanel
          status={status}
          onStatusChange={handleStatusChange}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onTagsChange={handleTagsChange}
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : (
        <>
          <LeadsTable
            profiles={profiles}
            onProfileClick={handleProfileClick}
            onSortChange={handleSortChange}
            sortBy={sortBy}
            sortOrder={sortOrder}
            selectedIds={selectedIds}
            onSelectionChange={handleSelectionChange}
          />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
          )}
        </>
      )}
    </div>
  );
}
