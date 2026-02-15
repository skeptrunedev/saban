import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface NotesEditorProps {
  notes: string | null;
  onSave: (notes: string) => Promise<void>;
}

export function NotesEditor({ notes, onSave }: NotesEditorProps) {
  const [value, setValue] = useState(notes || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(value);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Notes</h4>
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {notes || 'No notes yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Notes</h4>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add notes about this lead..."
        rows={4}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setValue(notes || '');
            setIsEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
