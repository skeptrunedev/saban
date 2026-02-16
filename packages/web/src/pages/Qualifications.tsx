import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQualifications, useCreateQualification, useDeleteQualification } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Target } from 'lucide-react';
import type { QualificationCriteria } from '@saban/shared';

export function Qualifications() {
  const navigate = useNavigate();
  const { data: qualifications, isLoading } = useQualifications();
  const createMutation = useCreateQualification();
  const deleteMutation = useDeleteQualification();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCriteria, setNewCriteria] = useState<QualificationCriteria>({});

  const handleCreate = async () => {
    if (!newName.trim()) return;

    await createMutation.mutateAsync({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      criteria: newCriteria,
    });

    setIsCreateOpen(false);
    setNewName('');
    setNewDescription('');
    setNewCriteria({});
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading qualifications...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Job Qualifications</h1>
          <p className="text-muted-foreground">
            Define criteria to automatically score and qualify leads
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Qualification
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Job Qualification</DialogTitle>
              <DialogDescription>
                Define the criteria for evaluating leads against this job
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Senior Engineer"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the ideal candidate..."
                  rows={2}
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Criteria</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minConnections">Min Connections</Label>
                    <Input
                      id="minConnections"
                      type="number"
                      value={newCriteria.minConnections || ''}
                      onChange={(e) =>
                        setNewCriteria({
                          ...newCriteria,
                          minConnections: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      placeholder="e.g., 500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="minFollowers">Min Followers</Label>
                    <Input
                      id="minFollowers"
                      type="number"
                      value={newCriteria.minFollowers || ''}
                      onChange={(e) =>
                        setNewCriteria({
                          ...newCriteria,
                          minFollowers: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      placeholder="e.g., 1000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="minExperience">Min Years Experience</Label>
                    <Input
                      id="minExperience"
                      type="number"
                      value={newCriteria.minExperienceYears || ''}
                      onChange={(e) =>
                        setNewCriteria({
                          ...newCriteria,
                          minExperienceYears: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      placeholder="e.g., 5"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requiredSkills">Required Skills (comma-separated)</Label>
                    <Input
                      id="requiredSkills"
                      value={newCriteria.requiredSkills?.join(', ') || ''}
                      onChange={(e) =>
                        setNewCriteria({
                          ...newCriteria,
                          requiredSkills: e.target.value
                            ? e.target.value.split(',').map((s) => s.trim())
                            : undefined,
                        })
                      }
                      placeholder="e.g., React, TypeScript"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Label htmlFor="customPrompt">Custom AI Instructions</Label>
                  <Textarea
                    id="customPrompt"
                    value={newCriteria.customPrompt || ''}
                    onChange={(e) =>
                      setNewCriteria({
                        ...newCriteria,
                        customPrompt: e.target.value || undefined,
                      })
                    }
                    placeholder="Additional instructions for AI scoring (e.g., 'Prioritize candidates with startup experience')"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !newName.trim()}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!qualifications || qualifications.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Target className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No qualifications yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first job qualification to start scoring leads automatically
          </p>
          <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Qualification
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {qualifications.map((qual) => (
            <div
              key={qual.id}
              className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{qual.name}</h3>
                  {qual.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {qual.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {qual.criteria.minConnections && (
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">
                    {qual.criteria.minConnections}+ connections
                  </span>
                )}
                {qual.criteria.minFollowers && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">
                    {qual.criteria.minFollowers}+ followers
                  </span>
                )}
                {qual.criteria.minExperienceYears && (
                  <span className="rounded-full bg-purple-100 px-2 py-1 text-purple-700">
                    {qual.criteria.minExperienceYears}+ years
                  </span>
                )}
                {qual.criteria.requiredSkills && qual.criteria.requiredSkills.length > 0 && (
                  <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-700">
                    {qual.criteria.requiredSkills.length} required skills
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/qualifications/${qual.id}`)}
                >
                  <Pencil className="mr-2 h-3 w-3" />
                  Edit
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Qualification</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{qual.name}"? This will also remove all
                        qualification results for leads scored against this criteria.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(qual.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
