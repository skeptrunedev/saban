import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TagManagerProps {
  tags: string[] | null;
  onUpdate: (tags: string[]) => Promise<void>;
}

export function TagManager({ tags, onUpdate }: TagManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const currentTags = tags || [];

  const handleAdd = async () => {
    if (!newTag.trim()) return;
    if (currentTags.includes(newTag.trim())) {
      setNewTag('');
      setIsAdding(false);
      return;
    }

    setIsUpdating(true);
    try {
      await onUpdate([...currentTags, newTag.trim()]);
      setNewTag('');
      setIsAdding(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async (tagToRemove: string) => {
    setIsUpdating(true);
    try {
      await onUpdate(currentTags.filter((t) => t !== tagToRemove));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Tags</h4>
      <div className="flex flex-wrap gap-2">
        {currentTags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              onClick={() => handleRemove(tag)}
              disabled={isUpdating}
              className="ml-1 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        {isAdding ? (
          <div className="flex items-center gap-1">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="New tag"
              className="h-7 w-24 text-xs"
              autoFocus
            />
            <Button size="sm" variant="ghost" onClick={handleAdd} disabled={isUpdating}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAdding(true)}
            className="h-6 text-xs"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Tag
          </Button>
        )}
      </div>
    </div>
  );
}
