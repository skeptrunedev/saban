import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfiles, useProfileEnrichment } from '@/lib/queries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ExternalLink,
  User,
  MapPin,
  Briefcase,
  CheckCircle2,
  Calendar,
  Users,
  Building2,
  Mail,
  Loader2,
} from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/utils';
import type { ProfileWithScore } from '@saban/shared';

function ProfileCard({ profile }: { profile: ProfileWithScore }) {
  const navigate = useNavigate();
  const { data: enrichment } = useProfileEnrichment(profile.id);

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown';
  const profileImage = getProxiedImageUrl(profile.profile_picture_url || profile.profile_picture_payload);
  const location = profile.location || enrichment?.raw_response?.location_name || enrichment?.raw_response?.location_locality;
  const currentCompany = enrichment?.raw_response?.job_company_name;
  const currentTitle = enrichment?.raw_response?.job_title;
  const reviewedDate = profile.reviewed_at ? new Date(profile.reviewed_at).toLocaleDateString() : null;
  const contactedDate = profile.contacted_at ? new Date(profile.contacted_at).toLocaleDateString() : null;

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => navigate(`/review?id=${profile.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
            {profileImage ? (
              <img src={profileImage} alt={fullName} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <User className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                {fullName}
              </h3>
              {profile.best_score && (
                <Badge
                  variant={profile.best_score >= 80 ? 'default' : 'secondary'}
                  className={profile.best_score >= 80 ? 'bg-green-600' : ''}
                >
                  {profile.best_score}
                </Badge>
              )}
            </div>
            {(currentTitle || profile.headline) && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {currentTitle || profile.headline}
              </p>
            )}
            {currentCompany && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Building2 className="h-3 w-3" />
                {String(currentCompany)}
              </p>
            )}
            {location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {String(location)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex gap-2 text-xs text-muted-foreground">
            {reviewedDate && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                {reviewedDate}
              </span>
            )}
            {contactedDate && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-blue-600" />
                Contacted
              </span>
            )}
          </div>
          <a
            href={profile.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:text-blue-800"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export function Qualified() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useProfiles({
    page,
    limit,
    status: 'qualified',
  });

  const profiles = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Calculate stats
  const contacted = profiles.filter((p: ProfileWithScore) => p.contacted_at).length;
  const thisWeek = profiles.filter((p: ProfileWithScore) => {
    if (!p.reviewed_at) return false;
    const reviewDate = new Date(p.reviewed_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return reviewDate >= weekAgo;
  }).length;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Loading qualified candidates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              Qualified Candidates
            </h1>
            <p className="text-sm text-muted-foreground">
              People you've approved during review
            </p>
          </div>
        </div>
        <Button onClick={() => navigate('/review')}>
          Continue Reviewing
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-muted-foreground">Total Qualified</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{contacted}</p>
                <p className="text-xs text-muted-foreground">Contacted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{thisWeek}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{total - contacted}</p>
                <p className="text-xs text-muted-foreground">Not Yet Contacted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profiles Grid */}
      {profiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No qualified candidates yet</h3>
            <p className="text-muted-foreground mb-4">
              Start reviewing candidates to build your qualified list
            </p>
            <Button onClick={() => navigate('/review')}>
              Start Reviewing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile: ProfileWithScore) => (
              <ProfileCard key={profile.id} profile={profile} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
