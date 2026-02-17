import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProfileWithScore } from '@saban/shared';
import { useReviewQueue, useUpdateProfile, useNextReviewProfile, useProfileEnrichment } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  ExternalLink,
  User,
  MapPin,
  Check,
  X,
  Loader2,
  PartyPopper,
  Briefcase,
  GraduationCap,
} from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/utils';

export function Review() {
  const navigate = useNavigate();
  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = useReviewQueue();
  const updateMutation = useUpdateProfile();
  const nextMutation = useNextReviewProfile();

  const [currentProfile, setCurrentProfile] = useState<ProfileWithScore | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [notes, setNotes] = useState('');
  const [sentMessage, setSentMessage] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const { data: enrichment } = useProfileEnrichment(currentProfile?.id ?? 0);

  // Initialize with first profile from queue
  useEffect(() => {
    if (queue && queue.length > 0 && !currentProfile) {
      setCurrentProfile(queue[0]);
    }
  }, [queue, currentProfile]);

  const remainingCount = queue ? queue.length - reviewedCount : 0;

  const handleDecision = useCallback(
    async (status: 'qualified' | 'disqualified') => {
      if (!currentProfile || isTransitioning) return;

      setIsTransitioning(true);

      try {
        // Update the profile status, notes, and timestamps
        const updates: {
          status: 'qualified' | 'disqualified';
          notes?: string;
          reviewedAt?: boolean;
          contactedAt?: boolean;
        } = {
          status,
          reviewedAt: true,
        };

        if (notes.trim()) {
          updates.notes = notes.trim();
        }

        if (sentMessage) {
          updates.contactedAt = true;
        }

        await updateMutation.mutateAsync({
          id: currentProfile.id,
          updates,
        });

        setReviewedCount((c) => c + 1);
        setNotes(''); // Clear notes for next profile
        setSentMessage(false); // Reset checkbox for next profile

        // Get the next profile
        const nextProfile = await nextMutation.mutateAsync(currentProfile.id);

        if (nextProfile) {
          setCurrentProfile(nextProfile);
        } else {
          // No more profiles, refetch to confirm
          const result = await refetchQueue();
          if (result.data && result.data.length > 0) {
            setCurrentProfile(result.data[0]);
          } else {
            setCurrentProfile(null);
          }
        }
      } catch (err) {
        console.error('Failed to update profile:', err);
      } finally {
        setIsTransitioning(false);
      }
    },
    [currentProfile, isTransitioning, notes, sentMessage, updateMutation, nextMutation, refetchQueue]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTransitioning || !currentProfile) return;

      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'y' || e.key === 'Y' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleDecision('qualified');
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleDecision('disqualified');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDecision, isTransitioning, currentProfile]);

  if (queueLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Loading review queue...</p>
        </div>
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <PartyPopper className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">
              {reviewedCount > 0 ? 'Review Complete!' : 'No Candidates to Review'}
            </h2>
            <p className="text-muted-foreground mb-4">
              {reviewedCount > 0
                ? `You reviewed ${reviewedCount} candidate${reviewedCount === 1 ? '' : 's'}.`
                : 'The review queue is empty.'}
            </p>
            {reviewedCount === 0 && (
              <p className="text-sm text-muted-foreground mb-6">
                Candidates appear here when they have:<br />
                - Status = "new"<br />
                - Been enriched<br />
                - A qualification score of 70+
              </p>
            )}
            <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fullName =
    [currentProfile.first_name, currentProfile.last_name].filter(Boolean).join(' ') ||
    'Unknown';
  const profileImage = getProxiedImageUrl(
    currentProfile.profile_picture_url || currentProfile.profile_picture_payload
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{remainingCount}</span> remaining
          {reviewedCount > 0 && (
            <span className="ml-2">
              ({reviewedCount} reviewed)
            </span>
          )}
        </div>
      </div>

      <Card className="mx-auto max-w-2xl overflow-hidden">
        <div className="relative">
          {isTransitioning && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          <CardContent className="p-8">
            {/* Profile Header */}
            <div className="flex items-start gap-6 mb-6">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-muted">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt={fullName}
                    className="h-24 w-24 rounded-full object-cover"
                  />
                ) : (
                  <User className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold">{fullName}</h2>
                {currentProfile.headline && (
                  <p className="text-muted-foreground mt-1 line-clamp-2">
                    {currentProfile.headline}
                  </p>
                )}
                {Boolean(currentProfile.location || enrichment?.raw_response?.city) && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                    <MapPin className="h-4 w-4" />
                    {currentProfile.location || String(enrichment?.raw_response?.city || '')}
                  </p>
                )}
              </div>
            </div>

            {/* Score */}
            <div className="rounded-lg border bg-muted/30 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Best Match</p>
                  <p className="font-medium">
                    {currentProfile.best_qualification_name || 'Unknown Qualification'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Score</p>
                  <p
                    className={`text-3xl font-bold ${
                      (currentProfile.best_score ?? 0) >= 80
                        ? 'text-green-600'
                        : (currentProfile.best_score ?? 0) >= 70
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                  >
                    {currentProfile.best_score ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Experience & Education */}
            {enrichment && (
              <div className="space-y-4 mb-6">
                {/* Headline from raw_response */}
                {Boolean(enrichment.raw_response?.headline) && (
                  <div className="text-sm font-medium">
                    {String(enrichment.raw_response?.headline)}
                  </div>
                )}

                {/* About */}
                {Boolean(enrichment.about || enrichment.raw_response?.about) && (
                  <div className="text-sm">
                    <p className="text-muted-foreground line-clamp-3">
                      {enrichment.about || String(enrichment.raw_response?.about || '')}
                    </p>
                  </div>
                )}

                {/* Current Company (fallback when no experience) */}
                {(!enrichment.experience || enrichment.experience.length === 0) && Boolean(enrichment.raw_response?.current_company) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      Current
                    </p>
                    <div className="text-sm border-l-2 border-primary/30 pl-3">
                      <p className="font-medium">
                        {String((enrichment.raw_response?.current_company as Record<string, unknown>)?.name || '')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Experience */}
                {enrichment.experience && enrichment.experience.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      Experience
                    </p>
                    <div className="space-y-2">
                      {enrichment.experience.slice(0, 2).map((exp: { title?: string; company?: string; start_date?: string; end_date?: string }, i: number) => (
                        <div key={i} className="text-sm border-l-2 border-primary/30 pl-3">
                          <p className="font-medium">{exp.title}</p>
                          <p className="text-muted-foreground text-xs">
                            {exp.company}
                            {(exp.start_date || exp.end_date) && ` · ${exp.start_date || ''}${exp.end_date ? ` - ${exp.end_date}` : ''}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Education */}
                {enrichment.education && enrichment.education.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      Education
                    </p>
                    <div className="space-y-1">
                      {enrichment.education.slice(0, 2).map((edu: { title?: string; degree?: string; field_of_study?: string; start_year?: string; end_year?: string }, i: number) => (
                        <div key={i} className="text-sm border-l-2 border-primary/30 pl-3">
                          <p className="font-medium">{edu.title}</p>
                          {(edu.degree || edu.start_year || edu.end_year) && (
                            <p className="text-muted-foreground text-xs">
                              {edu.degree}
                              {edu.field_of_study && `, ${edu.field_of_study}`}
                              {(edu.start_year || edu.end_year) && ` (${edu.start_year || ''}${edu.end_year ? `-${edu.end_year}` : ''})`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {enrichment.skills && enrichment.skills.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {enrichment.skills.slice(0, 8).map((skill: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {enrichment.skills.length > 8 && (
                        <Badge variant="outline" className="text-xs">
                          +{enrichment.skills.length - 8}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* LinkedIn Link */}
            <a
              href={currentProfile.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-6 flex items-center justify-center gap-2 rounded-lg border p-3 text-sm text-primary hover:bg-muted/50 transition-colors"
            >
              View Full Profile on LinkedIn
              <ExternalLink className="h-4 w-4" />
            </a>

            {/* Notes and Options */}
            <div className="mb-6 space-y-3">
              <Textarea
                ref={notesRef}
                placeholder="Add a note (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                rows={2}
              />
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sent-message"
                  checked={sentMessage}
                  onCheckedChange={(checked) => setSentMessage(checked === true)}
                />
                <Label htmlFor="sent-message" className="text-sm cursor-pointer">
                  I sent them a message
                </Label>
              </div>
            </div>

            {/* Decision Buttons */}
            <div className="flex gap-4">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 h-16 text-lg border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                onClick={() => handleDecision('disqualified')}
                disabled={isTransitioning}
              >
                <X className="mr-2 h-6 w-6" />
                No
                <Badge variant="secondary" className="ml-2 text-xs">
                  N
                </Badge>
              </Button>
              <Button
                size="lg"
                className="flex-1 h-16 text-lg bg-green-600 hover:bg-green-700"
                onClick={() => handleDecision('qualified')}
                disabled={isTransitioning}
              >
                <Check className="mr-2 h-6 w-6" />
                Yes
                <Badge variant="secondary" className="ml-2 text-xs bg-green-500/20 text-white">
                  Y
                </Badge>
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Use keyboard shortcuts: <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Y</kbd> for Yes,{' '}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">N</kbd> for No
            </p>
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
