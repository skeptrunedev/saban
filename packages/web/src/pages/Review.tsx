import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ProfileWithScore } from '@saban/shared';
import { useReviewQueue, useUpdateProfile, useNextReviewProfile, useProfileEnrichment, useProfile, useProfileQualifications } from '@/lib/queries';
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
  Building2,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  Award,
  Languages,
  Mail,
  Phone,
  Github,
  Twitter,
  Heart,
  FileText,
  Globe,
  Link,
  Facebook,
} from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/utils';

export function Review() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = useReviewQueue();
  const updateMutation = useUpdateProfile();
  const nextMutation = useNextReviewProfile();

  const [currentProfile, setCurrentProfile] = useState<ProfileWithScore | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [notes, setNotes] = useState('');
  const [sentMessage, setSentMessage] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Get profile ID from URL for direct access
  const urlProfileId = searchParams.get('id') ? parseInt(searchParams.get('id')!, 10) : 0;

  // Fetch specific profile if ID in URL (allows viewing any profile, not just queue)
  const { data: urlProfile } = useProfile(urlProfileId);

  const { data: enrichment } = useProfileEnrichment(currentProfile?.id ?? 0);
  const { data: qualificationResults } = useProfileQualifications(currentProfile?.id ?? 0);

  // Update URL when profile changes
  useEffect(() => {
    if (currentProfile) {
      setSearchParams({ id: String(currentProfile.id) }, { replace: true });
    }
  }, [currentProfile, setSearchParams]);

  // Initialize with profile from URL or first from queue
  useEffect(() => {
    // If we have a URL profile ID and it loaded, use that
    if (urlProfileId && urlProfile && !currentProfile) {
      setCurrentProfile(urlProfile as ProfileWithScore);
      return;
    }

    // Otherwise fall back to queue
    if (queue && queue.length > 0 && !currentProfile) {
      const profileFromUrl = urlProfileId ? queue.find(p => p.id === urlProfileId) : null;
      if (profileFromUrl) {
        setCurrentProfile(profileFromUrl);
        return;
      }
      setCurrentProfile(queue[0]);
    }
  }, [queue, currentProfile, urlProfileId, urlProfile]);

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

      const key = e.key.toLowerCase();
      if (key === 'y' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleDecision('qualified');
      } else if (key === 'n' || e.key === 'ArrowLeft') {
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
                {Boolean(currentProfile.location || enrichment?.raw_response?.location_name || enrichment?.raw_response?.location_locality || enrichment?.raw_response?.city) && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                    <MapPin className="h-4 w-4" />
                    {currentProfile.location || String(enrichment?.raw_response?.location_name || enrichment?.raw_response?.location_locality || enrichment?.raw_response?.city || '')}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Links - LinkedIn & Twitter */}
            <div className="flex gap-2 mb-4">
              {currentProfile.profile_url && (
                <a
                  href={currentProfile.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  LinkedIn
                </a>
              )}
              {enrichment?.raw_response?.twitter_url && (
                <a
                  href={String(enrichment.raw_response!.twitter_url).startsWith('http') ? String(enrichment.raw_response!.twitter_url) : `https://${enrichment.raw_response!.twitter_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm bg-black text-white px-3 py-1.5 rounded-md hover:bg-gray-800"
                >
                  <Twitter className="h-4 w-4" />
                  @{enrichment.raw_response?.twitter_username || 'X'}
                </a>
              )}
              {enrichment?.raw_response?.github_url && (
                <a
                  href={String(enrichment.raw_response!.github_url).startsWith('http') ? String(enrichment.raw_response!.github_url) : `https://${enrichment.raw_response!.github_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-gray-900"
                >
                  <Github className="h-4 w-4" />
                  {enrichment.raw_response?.github_username || 'GitHub'}
                </a>
              )}
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

            {/* AI Analysis */}
            {qualificationResults && qualificationResults.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 mb-6">
                <p className="text-xs font-medium text-blue-800 mb-2 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  AI Analysis
                </p>
                <div className="space-y-3">
                  {qualificationResults.map((result) => (
                    <div key={result.qualification_id} className="text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-blue-900">{result.qualification?.name}</span>
                        <span className={`font-bold ${result.score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                          {result.score}/100
                        </span>
                      </div>
                      <p className="text-blue-800/80 text-xs leading-relaxed">
                        {result.reasoning}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Experience & Education */}
            {enrichment && (
              <div className="space-y-4 mb-6">
                {/* Headline from raw_response */}
                {Boolean(enrichment.raw_response?.headline) && (
                  <div className="text-sm font-medium">
                    {String(enrichment.raw_response?.headline)}
                  </div>
                )}

                {/* Key Stats Row */}
                {(enrichment.raw_response?.inferred_years_experience || enrichment.raw_response?.inferred_salary || enrichment.raw_response?.linkedin_connections) && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {enrichment.raw_response?.inferred_years_experience && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{String(enrichment.raw_response!.inferred_years_experience)} yrs exp</span>
                      </div>
                    )}
                    {enrichment.raw_response?.inferred_salary && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <span>${Number(enrichment.raw_response!.inferred_salary).toLocaleString()}</span>
                      </div>
                    )}
                    {enrichment.raw_response?.linkedin_connections && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span>{Number(enrichment.raw_response!.linkedin_connections).toLocaleString()} connections</span>
                      </div>
                    )}
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

                {/* Current Company with details */}
                {Boolean(enrichment.raw_response?.job_company_name) && (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Current Company
                    </p>
                    <p className="font-medium text-sm">{String(enrichment.raw_response?.job_company_name)}</p>
                    {enrichment.raw_response?.job_title && (
                      <p className="text-xs text-muted-foreground">{String(enrichment.raw_response!.job_title)}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      {enrichment.raw_response?.job_company_industry && (
                        <Badge variant="outline" className="text-xs">
                          {String(enrichment.raw_response!.job_company_industry)}
                        </Badge>
                      )}
                      {enrichment.raw_response?.job_company_size && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {String(enrichment.raw_response!.job_company_size)}
                        </span>
                      )}
                      {enrichment.raw_response?.job_company_inferred_revenue && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <DollarSign className="h-3 w-3" />
                          {String(enrichment.raw_response!.job_company_inferred_revenue)}
                        </span>
                      )}
                      {enrichment.raw_response?.job_company_total_funding_raised && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          ${(Number(enrichment.raw_response!.job_company_total_funding_raised) / 1000000).toFixed(1)}M raised
                        </span>
                      )}
                      {enrichment.raw_response?.job_company_12mo_employee_growth_rate && (
                        <span className="flex items-center gap-1 text-green-600">
                          <TrendingUp className="h-3 w-3" />
                          {(Number(enrichment.raw_response!.job_company_12mo_employee_growth_rate) * 100).toFixed(0)}% growth
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Experience */}
                {enrichment.experience && Array.isArray(enrichment.experience) && enrichment.experience.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      Experience ({enrichment.experience.length} roles)
                    </p>
                    <div className="space-y-2">
                      {enrichment.experience.slice(0, 3).map((exp: { title?: { name?: string } | string; company?: { name?: string } | string; start_date?: string; end_date?: string; company_size?: string; company_industry?: string }, i: number) => {
                        const title = typeof exp.title === 'object' ? exp.title?.name : exp.title;
                        const company = typeof exp.company === 'object' ? exp.company?.name : exp.company;
                        return (
                          <div key={i} className="text-sm border-l-2 border-primary/30 pl-3">
                            <p className="font-medium">{title || 'Unknown Role'}</p>
                            <p className="text-muted-foreground text-xs">
                              {company || 'Unknown Company'}
                              {exp.company_industry && ` · ${exp.company_industry}`}
                              {(exp.start_date || exp.end_date) && ` · ${exp.start_date || ''}${exp.end_date ? ` - ${exp.end_date}` : ' - Present'}`}
                            </p>
                          </div>
                        );
                      })}
                      {enrichment.experience.length > 3 && (
                        <p className="text-xs text-muted-foreground pl-3">
                          +{enrichment.experience.length - 3} more roles
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Education */}
                {enrichment.education && Array.isArray(enrichment.education) && enrichment.education.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      Education
                    </p>
                    <div className="space-y-1">
                      {enrichment.education.slice(0, 2).map((edu: { school?: { name?: string } | string; name?: string; degree?: string; degrees?: string[]; field_of_study?: string; majors?: string[]; start_date?: string; end_date?: string }, i: number) => {
                        const schoolName = typeof edu.school === 'object' ? edu.school?.name : (edu.school || edu.name);
                        const degree = edu.degree || (edu.degrees && edu.degrees[0]);
                        const major = edu.field_of_study || (edu.majors && edu.majors[0]);
                        return (
                          <div key={i} className="text-sm border-l-2 border-primary/30 pl-3">
                            <p className="font-medium">{schoolName || 'Unknown School'}</p>
                            {(degree || major) && (
                              <p className="text-muted-foreground text-xs">
                                {degree}
                                {major && ` in ${major}`}
                                {(edu.start_date || edu.end_date) && ` (${edu.start_date || ''}${edu.end_date ? `-${edu.end_date}` : ''})`}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Certifications */}
                {enrichment.raw_response?.certifications && Array.isArray(enrichment.raw_response!.certifications) && enrichment.raw_response!.certifications.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      Certifications
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(enrichment.raw_response!.certifications as Array<string | { name?: string }>).slice(0, 4).map((cert, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {typeof cert === 'string' ? cert : cert?.name || 'Certification'}
                        </Badge>
                      ))}
                      {enrichment.raw_response!.certifications.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{enrichment.raw_response!.certifications.length - 4}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Languages */}
                {enrichment.raw_response?.languages && Array.isArray(enrichment.raw_response!.languages) && enrichment.raw_response!.languages.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Languages className="h-3 w-3" />
                      Languages
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(enrichment.raw_response!.languages as Array<string | { name?: string }>).map((lang, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {typeof lang === 'string' ? lang : lang?.name || 'Unknown'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {enrichment.skills && enrichment.skills.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {enrichment.skills.slice(0, 10).map((skill: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {enrichment.skills.length > 10 && (
                        <Badge variant="outline" className="text-xs">
                          +{enrichment.skills.length - 10}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Contact Info */}
                {(enrichment.raw_response?.emails || enrichment.raw_response?.personal_emails || enrichment.raw_response?.work_email || enrichment.raw_response?.phone_numbers || enrichment.raw_response?.mobile_phone) && (
                  <div className="rounded-lg border bg-blue-50/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Contact Info
                    </p>
                    <div className="space-y-1 text-sm">
                      {enrichment.raw_response?.work_email && (
                        <a href={`mailto:${enrichment.raw_response!.work_email}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                          <Mail className="h-3 w-3" />
                          {String(enrichment.raw_response!.work_email)} <span className="text-xs text-muted-foreground">(work)</span>
                        </a>
                      )}
                      {enrichment.raw_response?.recommended_personal_email && (
                        <a href={`mailto:${enrichment.raw_response!.recommended_personal_email}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                          <Mail className="h-3 w-3" />
                          {String(enrichment.raw_response!.recommended_personal_email)} <span className="text-xs text-muted-foreground">(personal)</span>
                        </a>
                      )}
                      {enrichment.raw_response?.emails && Array.isArray(enrichment.raw_response!.emails) && enrichment.raw_response!.emails.length > 0 && !enrichment.raw_response?.work_email && !enrichment.raw_response?.recommended_personal_email && (
                        <a href={`mailto:${(enrichment.raw_response!.emails as Array<{address?: string}>)[0]?.address || enrichment.raw_response!.emails[0]}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                          <Mail className="h-3 w-3" />
                          {String((enrichment.raw_response!.emails as Array<{address?: string}>)[0]?.address || enrichment.raw_response!.emails[0])}
                        </a>
                      )}
                      {(enrichment.raw_response?.mobile_phone || enrichment.raw_response?.phone_numbers) && (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {String(enrichment.raw_response!.mobile_phone || (Array.isArray(enrichment.raw_response!.phone_numbers) ? enrichment.raw_response!.phone_numbers[0] : ''))}
                        </p>
                      )}
                    </div>
                  </div>
                )}


                {/* Interests */}
                {enrichment.raw_response?.interests && Array.isArray(enrichment.raw_response!.interests) && enrichment.raw_response!.interests.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      Interests
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(enrichment.raw_response!.interests as string[]).slice(0, 8).map((interest, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {interest}
                        </Badge>
                      ))}
                      {enrichment.raw_response!.interests.length > 8 && (
                        <Badge variant="outline" className="text-xs">
                          +{enrichment.raw_response!.interests.length - 8}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Job Summary */}
                {Boolean(enrichment.raw_response?.job_summary) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Current Role Summary
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {String(enrichment.raw_response!.job_summary)}
                    </p>
                  </div>
                )}

                {/* Demographics */}
                {Boolean(enrichment.raw_response?.birth_year || enrichment.raw_response?.industry || enrichment.raw_response?.sex) && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {Boolean(enrichment.raw_response?.birth_year) && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>~{new Date().getFullYear() - Number(enrichment.raw_response!.birth_year)} years old</span>
                      </div>
                    )}
                    {Boolean(enrichment.raw_response?.sex) && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span>{String(enrichment.raw_response!.sex)}</span>
                      </div>
                    )}
                    {Boolean(enrichment.raw_response?.industry) && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <Briefcase className="h-3 w-3 text-muted-foreground" />
                        <span>{String(enrichment.raw_response!.industry)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Location Details */}
                {Boolean(enrichment.raw_response?.location_continent || enrichment.raw_response?.location_metro || enrichment.raw_response?.countries) && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {Boolean(enrichment.raw_response?.location_continent) && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span>{String(enrichment.raw_response!.location_continent)}</span>
                      </div>
                    )}
                    {Boolean(enrichment.raw_response?.location_metro) && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{String(enrichment.raw_response!.location_metro)} metro</span>
                      </div>
                    )}
                    {Boolean(enrichment.raw_response?.countries && Array.isArray(enrichment.raw_response!.countries)) && (
                      <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span>{(enrichment.raw_response!.countries as string[]).join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Extended Company Info */}
                {Boolean(enrichment.raw_response?.job_company_employee_count || enrichment.raw_response?.job_company_founded || enrichment.raw_response?.job_company_type || enrichment.raw_response?.job_company_ticker || enrichment.raw_response?.job_company_website) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Company Details
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Boolean(enrichment.raw_response?.job_company_employee_count) && (
                        <span className="bg-muted/50 px-2 py-1 rounded">
                          {Number(enrichment.raw_response!.job_company_employee_count).toLocaleString()} employees
                        </span>
                      )}
                      {Boolean(enrichment.raw_response?.job_company_founded) && (
                        <span className="bg-muted/50 px-2 py-1 rounded">
                          Founded {String(enrichment.raw_response!.job_company_founded)}
                        </span>
                      )}
                      {Boolean(enrichment.raw_response?.job_company_type) && (
                        <span className="bg-muted/50 px-2 py-1 rounded">
                          {String(enrichment.raw_response!.job_company_type)}
                        </span>
                      )}
                      {Boolean(enrichment.raw_response?.job_company_ticker) && (
                        <span className="bg-muted/50 px-2 py-1 rounded font-mono">
                          ${String(enrichment.raw_response!.job_company_ticker)}
                        </span>
                      )}
                      {Boolean(enrichment.raw_response?.job_company_website) && (
                        <a href={String(enrichment.raw_response!.job_company_website).startsWith('http') ? String(enrichment.raw_response!.job_company_website) : `https://${enrichment.raw_response!.job_company_website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                          <Link className="h-3 w-3" />
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Job Title Details */}
                {Boolean(enrichment.raw_response?.job_title_role || enrichment.raw_response?.job_title_sub_role || enrichment.raw_response?.job_title_levels) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Boolean(enrichment.raw_response?.job_title_role) && (
                      <Badge variant="outline" className="text-xs">
                        Role: {String(enrichment.raw_response!.job_title_role)}
                      </Badge>
                    )}
                    {Boolean(enrichment.raw_response?.job_title_sub_role) && (
                      <Badge variant="outline" className="text-xs">
                        Sub-role: {String(enrichment.raw_response!.job_title_sub_role)}
                      </Badge>
                    )}
                    {Boolean(enrichment.raw_response?.job_title_levels && Array.isArray(enrichment.raw_response!.job_title_levels)) && (
                      (enrichment.raw_response!.job_title_levels as string[]).map((level, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {level}
                        </Badge>
                      ))
                    )}
                  </div>
                )}

                {/* Job Timestamps */}
                {Boolean(enrichment.raw_response?.job_start_date || enrichment.raw_response?.job_last_changed || enrichment.raw_response?.job_last_verified) && (
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {Boolean(enrichment.raw_response?.job_start_date) && (
                      <span>Started: {String(enrichment.raw_response!.job_start_date)}</span>
                    )}
                    {Boolean(enrichment.raw_response?.job_last_changed) && (
                      <span>Last changed: {String(enrichment.raw_response!.job_last_changed)}</span>
                    )}
                    {Boolean(enrichment.raw_response?.job_last_verified) && (
                      <span>Verified: {String(enrichment.raw_response!.job_last_verified)}</span>
                    )}
                  </div>
                )}

                {/* Facebook */}
                {enrichment.raw_response?.facebook_url && (
                  <div>
                    <a
                      href={String(enrichment.raw_response!.facebook_url).startsWith('http') ? String(enrichment.raw_response!.facebook_url) : `https://${enrichment.raw_response!.facebook_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <Facebook className="h-4 w-4" />
                      {enrichment.raw_response?.facebook_username || 'Facebook'}
                    </a>
                  </div>
                )}

                {/* Other Profiles */}
                {enrichment.raw_response?.profiles && Array.isArray(enrichment.raw_response!.profiles) && enrichment.raw_response!.profiles.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Other Profiles</p>
                    <div className="flex flex-wrap gap-2">
                      {(enrichment.raw_response!.profiles as Array<{network?: string; url?: string; username?: string}>).map((profile, i) => (
                        <a
                          key={i}
                          href={profile.url?.startsWith('http') ? profile.url : `https://${profile.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-muted/50 px-2 py-1 rounded"
                        >
                          <Link className="h-3 w-3" />
                          {profile.network || profile.username || 'Profile'}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Regions */}
                {enrichment.raw_response?.regions && Array.isArray(enrichment.raw_response!.regions) && enrichment.raw_response!.regions.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Regions:</span> {(enrichment.raw_response!.regions as string[]).join(', ')}
                  </div>
                )}

                {/* Street Addresses */}
                {enrichment.raw_response?.street_addresses && Array.isArray(enrichment.raw_response!.street_addresses) && enrichment.raw_response!.street_addresses.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Addresses:</span> {(enrichment.raw_response!.street_addresses as Array<{street_address?: string; locality?: string; region?: string}>).map(a => `${a.street_address || ''} ${a.locality || ''} ${a.region || ''}`.trim()).join('; ')}
                  </div>
                )}

                {/* Summary/About if not shown above */}
                {enrichment.raw_response?.summary && !enrichment.about && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                    <p className="text-sm text-muted-foreground line-clamp-4">
                      {String(enrichment.raw_response!.summary)}
                    </p>
                  </div>
                )}

                {/* All Emails List */}
                {enrichment.raw_response?.emails && Array.isArray(enrichment.raw_response!.emails) && enrichment.raw_response!.emails.length > 1 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">All Emails ({enrichment.raw_response!.emails.length})</p>
                    <div className="space-y-1">
                      {(enrichment.raw_response!.emails as Array<{address?: string; type?: string} | string>).map((email, i) => {
                        const addr = typeof email === 'string' ? email : email.address;
                        const type = typeof email === 'object' ? email.type : undefined;
                        return (
                          <a key={i} href={`mailto:${addr}`} className="block text-xs text-blue-600 hover:underline">
                            {addr} {type && <span className="text-muted-foreground">({type})</span>}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All Phone Numbers */}
                {enrichment.raw_response?.phone_numbers && Array.isArray(enrichment.raw_response!.phone_numbers) && enrichment.raw_response!.phone_numbers.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Phone Numbers</p>
                    <div className="space-y-1">
                      {(enrichment.raw_response!.phone_numbers as string[]).map((phone, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{phone}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* LinkedIn Link */}
            <button
              onClick={() => {
                const width = Math.floor(window.screen.width / 2);
                const height = window.screen.height;
                const left = window.screen.width - width;
                window.open(
                  currentProfile.profile_url,
                  'linkedin-profile',
                  `width=${width},height=${height},left=${left},top=0`
                );
              }}
              className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg border p-3 text-sm text-primary hover:bg-muted/50 transition-colors"
            >
              View Full Profile on LinkedIn
              <ExternalLink className="h-4 w-4" />
            </button>

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
