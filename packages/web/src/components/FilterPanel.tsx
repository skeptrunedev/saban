import type { Profile } from '@saban/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FilterPanelProps {
  status: Profile['status'] | '';
  onStatusChange: (status: Profile['status'] | '') => void;
  availableTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function FilterPanel({
  status,
  onStatusChange,
  availableTags,
  selectedTags,
  onTagsChange,
}: FilterPanelProps) {
  return (
    <div className="flex gap-4">
      <Select value={status || 'all'} onValueChange={(v) => onStatusChange(v === 'all' ? '' : v as Profile['status'])}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="contacted">Contacted</SelectItem>
          <SelectItem value="replied">Replied</SelectItem>
          <SelectItem value="qualified">Qualified</SelectItem>
          <SelectItem value="disqualified">Disqualified</SelectItem>
        </SelectContent>
      </Select>

      {availableTags.length > 0 && (
        <Select
          value={selectedTags[0] || 'all'}
          onValueChange={(v) => {
            if (v === 'all') {
              onTagsChange([]);
            } else {
              onTagsChange([v]);
            }
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {availableTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
