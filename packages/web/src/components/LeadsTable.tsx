import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import type { ProfileWithScore, ProfilesQuery } from '@saban/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  User,
  CheckCircle,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { parseUTCTimestamp, getProxiedImageUrl } from '@/lib/utils';

interface LeadsTableProps {
  profiles: ProfileWithScore[];
  onProfileClick: (profile: ProfileWithScore) => void;
  onSortChange: (sortBy: ProfilesQuery['sortBy'], sortOrder: ProfilesQuery['sortOrder']) => void;
  sortBy?: ProfilesQuery['sortBy'];
  sortOrder?: ProfilesQuery['sortOrder'];
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
}

const statusColors: Record<ProfileWithScore['status'], string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  replied: 'bg-green-100 text-green-800',
  qualified: 'bg-emerald-100 text-emerald-800',
  disqualified: 'bg-gray-100 text-gray-800',
};

export function LeadsTable({
  profiles,
  onProfileClick,
  onSortChange,
  sortBy = 'captured_at',
  sortOrder = 'desc',
  selectedIds = [],
  onSelectionChange,
}: LeadsTableProps) {
  // Derive sorting state from props
  const sorting: SortingState = useMemo(
    () => (sortBy ? [{ id: sortBy, desc: sortOrder === 'desc' }] : []),
    [sortBy, sortOrder]
  );

  const handleSortToggle = (columnId: string) => {
    const currentSort = sorting.find((s) => s.id === columnId);
    if (!currentSort) {
      // Not sorted by this column, sort desc (most recent/Z first)
      onSortChange(columnId as ProfilesQuery['sortBy'], 'desc');
    } else if (currentSort.desc) {
      // Currently desc, switch to asc
      onSortChange(columnId as ProfilesQuery['sortBy'], 'asc');
    } else {
      // Currently asc, switch to desc
      onSortChange(columnId as ProfilesQuery['sortBy'], 'desc');
    }
  };

  const getSortIcon = (columnId: string) => {
    const currentSort = sorting.find((s) => s.id === columnId);
    if (!currentSort) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    if (currentSort.desc) return <ArrowDown className="ml-2 h-4 w-4" />;
    return <ArrowUp className="ml-2 h-4 w-4" />;
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(profiles.map((p) => p.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    }
  };

  const allSelected = profiles.length > 0 && selectedIds.length === profiles.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < profiles.length;

  const columns: ColumnDef<ProfileWithScore>[] = [
    ...(onSelectionChange
      ? [
          {
            id: 'select',
            header: () => (
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
                onClick={(e) => e.stopPropagation()}
              />
            ),
            cell: ({ row }: { row: { original: ProfileWithScore } }) => (
              <Checkbox
                checked={selectedIds.includes(row.original.id)}
                onCheckedChange={(checked) => handleSelectOne(row.original.id, checked as boolean)}
                aria-label="Select row"
                onClick={(e) => e.stopPropagation()}
              />
            ),
            size: 40,
          } as ColumnDef<ProfileWithScore>,
        ]
      : []),
    {
      id: 'avatar',
      header: '',
      cell: ({ row }) => {
        const rawImage = row.original.profile_picture_url || row.original.profile_picture_payload;
        const profileImage = getProxiedImageUrl(rawImage);
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {profileImage ? (
              <img src={profileImage} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        );
      },
      size: 60,
    },
    {
      accessorKey: 'first_name',
      header: () => (
        <Button variant="ghost" onClick={() => handleSortToggle('first_name')}>
          Name
          {getSortIcon('first_name')}
        </Button>
      ),
      cell: ({ row }) => {
        const fullName =
          [row.original.first_name, row.original.last_name].filter(Boolean).join(' ') || 'Unknown';
        return (
          <div>
            <div className="font-medium flex items-center gap-2">
              {fullName}
              {row.original.connection_degree && (
                <span className="text-xs text-muted-foreground font-normal">
                  {row.original.connection_degree}
                </span>
              )}
            </div>
            {row.original.headline && (
              <div className="text-sm text-muted-foreground truncate max-w-[250px]">
                {row.original.headline}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'location',
      header: 'Location',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
          {row.original.location || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge className={statusColors[row.original.status || 'new']} variant="secondary">
          {row.original.status || 'new'}
        </Badge>
      ),
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {(row.original.tags?.length || 0) > 2 && (
            <Badge variant="outline" className="text-xs">
              +{(row.original.tags?.length || 0) - 2}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'pipeline_status',
      header: 'Pipeline',
      cell: ({ row }) => {
        const isEnriched = row.original.is_enriched;
        const hasScore = row.original.best_score !== null && row.original.best_score !== undefined;

        return (
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1 text-xs ${isEnriched ? 'text-green-600' : 'text-muted-foreground'}`}
              title={isEnriched ? 'Enriched' : 'Not enriched'}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div
              className={`flex items-center gap-1 text-xs ${hasScore ? 'text-green-600' : 'text-muted-foreground'}`}
              title={hasScore ? 'Scored' : 'Not scored'}
            >
              <CheckCircle className="h-3.5 w-3.5" />
            </div>
          </div>
        );
      },
      size: 80,
    },
    {
      accessorKey: 'best_score',
      header: () => (
        <Button variant="ghost" onClick={() => handleSortToggle('best_score')}>
          Score
          {getSortIcon('best_score')}
        </Button>
      ),
      cell: ({ row }) => {
        const score = row.original.best_score;
        const passed = row.original.best_score_passed;

        if (score === null || score === undefined) {
          return <span className="text-muted-foreground text-sm">-</span>;
        }

        return (
          <div className="flex items-center gap-1.5">
            {passed ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className={`font-medium ${passed ? 'text-green-600' : 'text-red-500'}`}>
              {score}
            </span>
          </div>
        );
      },
      size: 80,
    },
    {
      accessorKey: 'captured_at',
      header: () => (
        <Button variant="ghost" onClick={() => handleSortToggle('captured_at')}>
          Captured
          {getSortIcon('captured_at')}
        </Button>
      ),
      cell: ({ row }) => {
        const date = parseUTCTimestamp(row.original.captured_at);
        return (
          <div className="text-sm">
            <div>{date.toLocaleDateString()}</div>
            <div className="text-muted-foreground text-xs">
              {date.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              })}
            </div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <a
          href={row.original.profile_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      ),
      size: 40,
    },
  ];

  const table = useReactTable({
    data: profiles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { sorting },
    manualSorting: true,
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onProfileClick(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No leads found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
