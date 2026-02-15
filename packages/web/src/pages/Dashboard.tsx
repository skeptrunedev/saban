import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile, ProfilesQuery } from '@saban/shared';
import { useProfiles, useTags } from '@/lib/queries';
import { SearchBar } from '@/components/SearchBar';
import { FilterPanel } from '@/components/FilterPanel';
import { LeadsTable } from '@/components/LeadsTable';
import { ExportButton } from '@/components/ExportButton';
import { Pagination } from '@/components/Pagination';

export function Dashboard() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Profile['status'] | ''>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<ProfilesQuery['sortBy']>('captured_at');
  const [sortOrder, setSortOrder] = useState<ProfilesQuery['sortOrder']>('desc');

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
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: Profile['status'] | '') => {
    setStatus(value);
    setPage(1);
  };

  const handleTagsChange = (tags: string[]) => {
    setSelectedTags(tags);
    setPage(1);
  };

  const handleProfileClick = (profile: Profile) => {
    navigate(`/leads/${profile.id}`);
  };

  const handleSortChange = (
    newSortBy: ProfilesQuery['sortBy'],
    newSortOrder: ProfilesQuery['sortOrder']
  ) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
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
            {isFetching && !isLoading && <span className="ml-2 text-xs">(updating...)</span>}
          </p>
        </div>
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
          />
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
