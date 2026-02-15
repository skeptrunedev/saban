import { useParams, useNavigate } from 'react-router-dom';
import type { Profile } from '@saban/shared';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { NotesEditor } from '@/components/NotesEditor';
import { TagManager } from '@/components/TagManager';
import { ArrowLeft, ExternalLink, User } from 'lucide-react';

const statusColors: Record<Profile['status'], string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  replied: 'bg-green-100 text-green-800',
  qualified: 'bg-emerald-100 text-emerald-800',
  disqualified: 'bg-gray-100 text-gray-800',
};

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profileId = parseInt(id || '0', 10);

  const { data: profile, isLoading } = useProfile(profileId);
  const updateMutation = useUpdateProfile();

  const handleStatusChange = (newStatus: Profile['status']) => {
    updateMutation.mutate({ id: profileId, updates: { status: newStatus } });
  };

  const handleNotesUpdate = async (notes: string) => {
    await updateMutation.mutateAsync({ id: profileId, updates: { notes } });
  };

  const handleTagsUpdate = async (tags: string[]) => {
    await updateMutation.mutateAsync({ id: profileId, updates: { tags } });
  };

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  if (!profile) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Lead not found</p>
        <Button variant="link" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown';

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                {profile.profile_picture_payload ? (
                  <img
                    src={profile.profile_picture_payload}
                    alt={fullName}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <User className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-xl">{fullName}</CardTitle>
                  <Badge className={statusColors[profile.status || 'new']} variant="secondary">
                    {profile.status || 'new'}
                  </Badge>
                </div>
                {profile.vanity_name && (
                  <p className="text-muted-foreground">@{profile.vanity_name}</p>
                )}
                <a
                  href={profile.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center text-sm text-primary hover:underline"
                >
                  View on LinkedIn
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={profile.status || 'new'}
                onValueChange={(v) => handleStatusChange(v as Profile['status'])}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="disqualified">Disqualified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <TagManager tags={profile.tags} onUpdate={handleTagsUpdate} />

            <NotesEditor notes={profile.notes} onSave={handleNotesUpdate} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Source</p>
              <p className="truncate">{profile.source_profile_url || 'N/A'}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Section</p>
              <p>{profile.source_section || 'N/A'}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Captured</p>
              <p>{new Date(profile.captured_at).toLocaleString()}</p>
            </div>
            {profile.member_urn && (
              <div>
                <p className="font-medium text-muted-foreground">Member URN</p>
                <p className="font-mono text-xs">{profile.member_urn}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
