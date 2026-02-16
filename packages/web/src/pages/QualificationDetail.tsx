import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQualification, useUpdateQualification, useDeleteQualification } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import type { QualificationCriteria } from '@saban/shared';

export function QualificationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qualificationId = parseInt(id || '0', 10);

  const { data: qualification, isLoading } = useQualification(qualificationId);
  const updateMutation = useUpdateQualification();
  const deleteMutation = useDeleteQualification();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<QualificationCriteria>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (qualification) {
      setName(qualification.name);
      setDescription(qualification.description || '');
      setCriteria(qualification.criteria);
      setHasChanges(false);
    }
  }, [qualification]);

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: qualificationId,
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        criteria,
      },
    });
    setHasChanges(false);
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(qualificationId);
    navigate('/qualifications');
  };

  const updateCriteria = (updates: Partial<QualificationCriteria>) => {
    setCriteria((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!qualification) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Qualification not found</p>
        <Button variant="link" onClick={() => navigate('/qualifications')}>
          Back to Qualifications
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/qualifications')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Edit Qualification</h1>
          <p className="text-muted-foreground">Modify the criteria for lead scoring</p>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Qualification</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this qualification? This will also remove all
                  associated scoring results.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={handleSave} disabled={updateMutation.isPending || !hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setHasChanges(true);
            }}
            placeholder="e.g., Senior Engineer"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setHasChanges(true);
            }}
            placeholder="Describe the ideal candidate..."
            rows={3}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <h3 className="text-lg font-semibold">Network Requirements</h3>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="minConnections">Minimum Connections</Label>
            <Input
              id="minConnections"
              type="number"
              value={criteria.minConnections || ''}
              onChange={(e) =>
                updateCriteria({
                  minConnections: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="e.g., 500"
            />
            <p className="text-xs text-muted-foreground">
              Minimum LinkedIn connections required
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minFollowers">Minimum Followers</Label>
            <Input
              id="minFollowers"
              type="number"
              value={criteria.minFollowers || ''}
              onChange={(e) =>
                updateCriteria({
                  minFollowers: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="e.g., 1000"
            />
            <p className="text-xs text-muted-foreground">
              Minimum LinkedIn followers required
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <h3 className="text-lg font-semibold">Experience Requirements</h3>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="minExperience">Minimum Years of Experience</Label>
            <Input
              id="minExperience"
              type="number"
              value={criteria.minExperienceYears || ''}
              onChange={(e) =>
                updateCriteria({
                  minExperienceYears: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="e.g., 5"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="requiredTitles">Required Job Titles (comma-separated)</Label>
          <Input
            id="requiredTitles"
            value={criteria.requiredTitles?.join(', ') || ''}
            onChange={(e) =>
              updateCriteria({
                requiredTitles: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
            placeholder="e.g., Engineering Manager, Tech Lead, CTO"
          />
          <p className="text-xs text-muted-foreground">
            Must have held at least one of these titles
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredTitles">Preferred Job Titles (comma-separated)</Label>
          <Input
            id="preferredTitles"
            value={criteria.preferredTitles?.join(', ') || ''}
            onChange={(e) =>
              updateCriteria({
                preferredTitles: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
            placeholder="e.g., VP Engineering, Director"
          />
          <p className="text-xs text-muted-foreground">
            Nice to have, will improve score
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="requiredCompanies">Required Companies (comma-separated)</Label>
          <Input
            id="requiredCompanies"
            value={criteria.requiredCompanies?.join(', ') || ''}
            onChange={(e) =>
              updateCriteria({
                requiredCompanies: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
            placeholder="e.g., Google, Meta, Apple"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredCompanies">Preferred Companies (comma-separated)</Label>
          <Input
            id="preferredCompanies"
            value={criteria.preferredCompanies?.join(', ') || ''}
            onChange={(e) =>
              updateCriteria({
                preferredCompanies: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
            placeholder="e.g., Stripe, Airbnb, Uber"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <h3 className="text-lg font-semibold">Skills & Education</h3>

        <div className="space-y-2">
          <Label htmlFor="requiredSkills">Required Skills (comma-separated)</Label>
          <Input
            id="requiredSkills"
            value={criteria.requiredSkills?.join(', ') || ''}
            onChange={(e) =>
              updateCriteria({
                requiredSkills: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
            placeholder="e.g., React, TypeScript, Node.js"
          />
          <p className="text-xs text-muted-foreground">
            Must have these skills listed on their profile
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredSkills">Preferred Skills (comma-separated)</Label>
          <Input
            id="preferredSkills"
            value={criteria.preferredSkills?.join(', ') || ''}
            onChange={(e) =>
              updateCriteria({
                preferredSkills: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
            placeholder="e.g., GraphQL, Kubernetes, AWS"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="requiredEducation">Required Education (comma-separated)</Label>
          <Input
            id="requiredEducation"
            value={criteria.requiredEducation?.join(', ') || ''}
            onChange={(e) =>
              updateCriteria({
                requiredEducation: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
            placeholder="e.g., Computer Science, Engineering, MBA"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Custom AI Instructions</h3>
        <p className="text-sm text-muted-foreground">
          Provide additional context or requirements for the AI to consider when scoring
        </p>

        <Textarea
          value={criteria.customPrompt || ''}
          onChange={(e) =>
            updateCriteria({
              customPrompt: e.target.value || undefined,
            })
          }
          placeholder="e.g., Prioritize candidates with startup experience. Bonus points for open source contributions. Prefer candidates who have built products from scratch..."
          rows={5}
        />
      </div>
    </div>
  );
}
