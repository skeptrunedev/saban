import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import type { Profile, ProfilesQuery } from '@saban/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpDown, ExternalLink, User } from 'lucide-react';

interface LeadsTableProps {
  profiles: Profile[];
  onProfileClick: (profile: Profile) => void;
  onSortChange: (sortBy: ProfilesQuery['sortBy'], sortOrder: ProfilesQuery['sortOrder']) => void;
}

const statusColors: Record<Profile['status'], string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  replied: 'bg-green-100 text-green-800',
  qualified: 'bg-emerald-100 text-emerald-800',
  disqualified: 'bg-gray-100 text-gray-800',
};

export function LeadsTable({ profiles, onProfileClick, onSortChange }: LeadsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<Profile>[] = [
    {
      id: 'avatar',
      header: '',
      cell: ({ row }) => {
        const profileImage = row.original.profile_picture_url || row.original.profile_picture_payload;
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {profileImage ? (
              <img
                src={profileImage}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
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
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => {
            const isAsc = column.getIsSorted() === 'asc';
            column.toggleSorting(!isAsc);
            onSortChange('first_name', isAsc ? 'desc' : 'asc');
          }}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
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
      accessorKey: 'captured_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => {
            const isAsc = column.getIsSorted() === 'asc';
            column.toggleSorting(!isAsc);
            onSortChange('captured_at', isAsc ? 'desc' : 'asc');
          }}
        >
          Captured
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => new Date(row.original.captured_at).toLocaleDateString(),
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
    onSortingChange: setSorting,
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
