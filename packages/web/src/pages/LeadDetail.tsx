import { useParams, useNavigate } from 'react-router-dom';
import type { Profile } from '@saban/shared';
import {
  useProfile,
  useUpdateProfile,
  useProfileEnrichment,
  useProfileQualifications,
  useStartEnrichment,
  useQualifications,
} from '@/lib/queries';
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
import {
  ArrowLeft,
  ExternalLink,
  User,
  MapPin,
  Link2,
  Users,
  Sparkles,
  Briefcase,
  GraduationCap,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { parseUTCTimestamp } from '@/lib/utils';

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
  const { data: enrichment, isLoading: enrichmentLoading } = useProfileEnrichment(profileId);
  const { data: qualificationResults } = useProfileQualifications(profileId);
  const { data: qualifications } = useQualifications();
  const updateMutation = useUpdateProfile();
  const enrichMutation = useStartEnrichment();

  const handleStatusChange = (newStatus: Profile['status']) => {
    updateMutation.mutate({ id: profileId, updates: { status: newStatus } });
  };

  const handleNotesUpdate = async (notes: string) => {
    await updateMutation.mutateAsync({ id: profileId, updates: { notes } });
  };

  const handleTagsUpdate = async (tags: string[]) => {
    await updateMutation.mutateAsync({ id: profileId, updates: { tags } });
  };

  const handleEnrich = async (qualificationId?: number) => {
    await enrichMutation.mutateAsync({ profileIds: [profileId], qualificationId });
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
  const profileImage = profile.profile_picture_url || profile.profile_picture_payload;

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
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-muted">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt={fullName}
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <User className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-xl">{fullName}</CardTitle>
                  {profile.connection_degree && (
                    <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {profile.connection_degree}
                    </span>
                  )}
                  <Badge className={statusColors[profile.status || 'new']} variant="secondary">
                    {profile.status || 'new'}
                  </Badge>
                </div>
                {profile.headline && (
                  <p className="text-muted-foreground mt-1">{profile.headline}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                  {profile.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {profile.location}
                    </span>
                  )}
                  {profile.vanity_name && (
                    <span className="flex items-center gap-1">
                      <Link2 className="h-4 w-4" />
                      @{profile.vanity_name}
                    </span>
                  )}
                </div>
                <a
                  href={profile.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center text-sm text-primary hover:underline"
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
            {profile.headline && (
              <div>
                <p className="font-medium text-muted-foreground">Headline</p>
                <p>{profile.headline}</p>
              </div>
            )}
            {profile.location && (
              <div>
                <p className="font-medium text-muted-foreground">Location</p>
                <p>{profile.location}</p>
              </div>
            )}
            {profile.connection_degree && (
              <div>
                <p className="font-medium text-muted-foreground">Connection</p>
                <p>{profile.connection_degree}</p>
              </div>
            )}
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
              <p>
                {parseUTCTimestamp(profile.captured_at).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZoneName: 'short',
                })}
              </p>
            </div>
            {profile.member_urn && (
              <div>
                <p className="font-medium text-muted-foreground">Member URN</p>
                <p className="font-mono text-xs break-all">{profile.member_urn}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enrichment Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Enrichment Data
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEnrich()}
              disabled={enrichMutation.isPending}
            >
              {enrichMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enriching...
                </>
              ) : (
                'Enrich Profile'
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {enrichmentLoading ? (
              <p className="text-sm text-muted-foreground">Loading enrichment data...</p>
            ) : enrichment ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Connections
                    </div>
                    <p className="text-2xl font-bold">
                      {enrichment.connection_count?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Followers
                    </div>
                    <p className="text-2xl font-bold">
                      {enrichment.follower_count?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                </div>

                {enrichment.about && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">About</p>
                    <p className="text-sm line-clamp-4">{enrichment.about}</p>
                  </div>
                )}

                {enrichment.skills && enrichment.skills.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {enrichment.skills.slice(0, 10).map((skill, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {enrichment.skills.length > 10 && (
                        <Badge variant="outline" className="text-xs">
                          +{enrichment.skills.length - 10} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {enrichment.experience && enrichment.experience.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Briefcase className="h-4 w-4" />
                      Experience
                    </p>
                    <div className="space-y-2">
                      {enrichment.experience.slice(0, 3).map((exp, i) => (
                        <div key={i} className="text-sm border-l-2 pl-3">
                          <p className="font-medium">{exp.title}</p>
                          <p className="text-muted-foreground">{exp.company}</p>
                          {exp.duration && (
                            <p className="text-xs text-muted-foreground">{exp.duration}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {enrichment.education && enrichment.education.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <GraduationCap className="h-4 w-4" />
                      Education
                    </p>
                    <div className="space-y-2">
                      {enrichment.education.slice(0, 2).map((edu, i) => (
                        <div key={i} className="text-sm border-l-2 pl-3">
                          <p className="font-medium">{edu.school}</p>
                          {edu.degree && (
                            <p className="text-muted-foreground">
                              {edu.degree}
                              {edu.field_of_study && ` in ${edu.field_of_study}`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Last enriched: {new Date(enrichment.enriched_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">
                  No enrichment data available yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Click "Enrich Profile" to fetch connection count, experience, and more
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Qualification Scores</CardTitle>
            {qualifications && qualifications.length > 0 && (
              <Select
                onValueChange={(v) => handleEnrich(parseInt(v))}
                disabled={enrichMutation.isPending}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Run qualification..." />
                </SelectTrigger>
                <SelectContent>
                  {qualifications.map((qual) => (
                    <SelectItem key={qual.id} value={String(qual.id)}>
                      {qual.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            {qualificationResults && qualificationResults.length > 0 ? (
              <div className="space-y-3">
                {qualificationResults.map((result) => (
                  <div
                    key={result.id}
                    className={`rounded-lg border p-4 ${
                      result.passed
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {result.passed ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <span className="font-medium">
                          {result.qualification?.name || 'Unknown Qualification'}
                        </span>
                      </div>
                      <div
                        className={`text-2xl font-bold ${
                          result.passed ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {result.score}/100
                      </div>
                    </div>
                    {result.reasoning && (
                      <p className="text-sm text-muted-foreground">{result.reasoning}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Evaluated: {new Date(result.evaluated_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">
                  No qualification scores yet
                </p>
                <p className="text-xs text-muted-foreground">
                  {qualifications && qualifications.length > 0
                    ? 'Select a qualification to score this profile'
                    : 'Create a job qualification first to score leads'}
                </p>
                {(!qualifications || qualifications.length === 0) && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => navigate('/qualifications')}
                    className="mt-2"
                  >
                    Create Qualification
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
