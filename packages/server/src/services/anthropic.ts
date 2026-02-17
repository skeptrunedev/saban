// Anthropic Claude API client for AI-powered qualification scoring

import Anthropic from '@anthropic-ai/sdk';
import type { QualificationCriteria } from '@saban/shared';

// BrightData raw response (actual field names from API)
interface BrightDataRawProfile {
  url?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  about?: string;
  connections?: number;
  followers?: number;
  current_company?: {
    name?: string;
    link?: string;
    location?: string;
    company_id?: string;
  };
  current_company_name?: string;
  experience?: Array<{
    title?: string;
    company?: string;
    start_date?: string;
    end_date?: string;
    duration?: string;
    description?: string;
    location?: string;
    positions?: Array<{
      title?: string;
      start_date?: string;
      end_date?: string;
      description?: string;
    }>;
  }>;
  education?: Array<{
    school?: string;
    title?: string; // BrightData uses 'title' for school name sometimes
    degree?: string;
    field_of_study?: string;
    start_year?: string;
    end_year?: string;
  }>;
  skills?: string[];
  certifications?: Array<{
    name?: string;
    issuing_organization?: string;
  }>;
  languages?: Array<{
    language?: string;
    proficiency?: string;
  }>;
  activity?: Array<{
    title?: string;
    link?: string;
  }>;
  honors_and_awards?: Array<{
    title?: string;
    issuer?: string;
  }>;
  publications?: Array<{
    title?: string;
    publisher?: string;
  }>;
}

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export interface ScoringResult {
  score: number;
  reasoning: string;
  passed: boolean;
}

/**
 * Score a LinkedIn profile against qualification criteria using Claude Haiku
 */
export async function scoreProfileWithAI(
  profile: BrightDataRawProfile,
  criteria: QualificationCriteria
): Promise<ScoringResult> {
  const client = getClient();

  const profileSummary = buildProfileSummary(profile);
  const criteriaSummary = buildCriteriaSummary(criteria);

  const systemPrompt = `You are an expert recruiter evaluating whether a LinkedIn profile represents a REALISTIC candidate for a specific role.

Your job is NOT just to check if they meet minimum qualifications - it's to assess whether this person would realistically consider and be a good fit for this role.

LIKELY DISQUALIFYING (score 0-40):
- Located outside the United States (India, Europe, etc.) - US-based candidates only
- CEOs/Founders of well-funded, successful, or fast-growing companies (they're committed to their thing)
- C-suite executives at large established companies (they've moved past this level)
- Active venture capitalists/investors (different career path)
- People at companies like Vercel, Stripe, major tech cos in senior roles (they have good jobs)
- Non-technical people for technical roles (and vice versa)

POTENTIALLY INTERESTING despite senior titles (evaluate carefully):
- Founders/CEOs at small companies that seem stagnant or have been doing the same thing for 5+ years
- C-suite at very early stage or struggling startups
- People whose company seems to be winding down or not growing
- "Fractional" or "Advisor" roles suggest they might be looking
- Founders of companies that failed or were acqui-hired

STRONG CANDIDATES (score 70+):
- Senior ICs or managers looking to level up
- People at similar level who might want a new opportunity
- People whose career trajectory logically leads to this role
- Those with right background who seem potentially moveable

Scoring guidelines:
- 80-100: Strong realistic candidate - right level, right background, likely recruitable
- 70-79: Good candidate - meets requirements and could realistically be interested
- 50-69: Maybe - uncertain if they'd be interested given their current situation
- 30-49: Unlikely - probably too senior, wrong path, or wouldn't be interested
- 0-29: Not a fit - clearly wrong level, successful founder/CEO, or completely different career

Think like a recruiter: "Would this person plausibly consider this role, or is it beneath them / irrelevant to them?"

You must respond in valid JSON format with exactly these fields:
{
  "score": <number 0-100>,
  "reasoning": "<brief explanation focusing on FIT and LIKELIHOOD, not just qualifications>",
  "passed": <true if score >= 70, false otherwise>
}`;

  const userPrompt = `Evaluate whether this person is a REALISTIC candidate for the role - not just qualified on paper, but someone who would actually consider this opportunity.

## Candidate Profile
${profileSummary}

## Role Requirements
${criteriaSummary}

${criteria.customPrompt ? `## Additional Context\n${criteria.customPrompt}` : ''}

Think critically: Is this person at the right career stage? Would reaching out to them about this role make sense, or would it be a waste of time because they're overqualified, in a different career path, or wouldn't be interested?

Respond with a JSON object containing score, reasoning, and passed fields.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  // Extract text content from response
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON response
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const result = JSON.parse(jsonMatch[0]) as ScoringResult;

  // Validate and normalize
  return {
    score: Math.max(0, Math.min(100, Math.round(result.score))),
    reasoning: result.reasoning || 'No reasoning provided',
    passed: result.score >= 70,
  };
}

function buildProfileSummary(profile: BrightDataRawProfile): string {
  const lines: string[] = [];

  lines.push(`**Name:** ${profile.name || `${profile.first_name} ${profile.last_name}`}`);
  lines.push(`**Headline:** ${profile.headline || 'Not specified'}`);
  lines.push(`**Location:** ${profile.location || 'Not specified'}`);
  lines.push(`**Connections:** ${profile.connections?.toLocaleString() || 'Unknown'}`);
  lines.push(`**Followers:** ${profile.followers?.toLocaleString() || 'Unknown'}`);

  // Include current company info (often available even when full experience isn't)
  const currentCompany = profile.current_company_name || profile.current_company?.name;
  if (currentCompany) {
    lines.push(`**Current Company:** ${currentCompany}`);
  }

  if (profile.about) {
    lines.push(
      `\n**About:**\n${profile.about.substring(0, 500)}${profile.about.length > 500 ? '...' : ''}`
    );
  }

  if (profile.experience && profile.experience.length > 0) {
    lines.push('\n**Experience:**');
    for (const exp of profile.experience.slice(0, 5)) {
      const duration = exp.duration || '';
      const dates = exp.start_date ? `(${exp.start_date} - ${exp.end_date || 'Present'})` : '';
      lines.push(`- ${exp.title} at ${exp.company} ${dates} ${duration}`);
      // Include nested positions if available (BrightData sometimes nests role changes)
      if (exp.positions && exp.positions.length > 0) {
        for (const pos of exp.positions.slice(0, 3)) {
          const posDates = pos.start_date
            ? `(${pos.start_date} - ${pos.end_date || 'Present'})`
            : '';
          lines.push(`  - ${pos.title} ${posDates}`);
        }
      }
    }
  }

  if (profile.education && profile.education.length > 0) {
    lines.push('\n**Education:**');
    for (const edu of profile.education.slice(0, 3)) {
      const school = edu.school || edu.title; // BrightData uses 'title' sometimes
      const degree = edu.degree ? `${edu.degree}` : '';
      const field = edu.field_of_study ? ` in ${edu.field_of_study}` : '';
      const years =
        edu.start_year || edu.end_year
          ? ` (${edu.start_year || '?'} - ${edu.end_year || '?'})`
          : '';
      lines.push(`- ${school}${degree ? `: ${degree}${field}` : ''}${years}`);
    }
  }

  if (profile.skills && profile.skills.length > 0) {
    lines.push(`\n**Skills:** ${profile.skills.slice(0, 15).join(', ')}`);
  }

  if (profile.certifications && profile.certifications.length > 0) {
    lines.push('\n**Certifications:**');
    for (const cert of profile.certifications.slice(0, 5)) {
      lines.push(
        `- ${cert.name}${cert.issuing_organization ? ` (${cert.issuing_organization})` : ''}`
      );
    }
  }

  if (profile.languages && profile.languages.length > 0) {
    lines.push(
      `\n**Languages:** ${profile.languages.map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`).join(', ')}`
    );
  }

  if (profile.honors_and_awards && profile.honors_and_awards.length > 0) {
    lines.push(
      `\n**Honors & Awards:** ${profile.honors_and_awards
        .slice(0, 5)
        .map((h) => h.title)
        .join(', ')}`
    );
  }

  if (profile.publications && profile.publications.length > 0) {
    lines.push(`\n**Publications:** ${profile.publications.length} publication(s)`);
  }

  if (profile.activity && profile.activity.length > 0) {
    lines.push(`\n**Recent Activity:** ${profile.activity.length} recent post(s)/article(s)`);
  }

  return lines.join('\n');
}

function buildCriteriaSummary(criteria: QualificationCriteria): string {
  const lines: string[] = [];

  if (criteria.minConnections) {
    lines.push(`- Minimum connections: ${criteria.minConnections.toLocaleString()}`);
  }

  if (criteria.minFollowers) {
    lines.push(`- Minimum followers: ${criteria.minFollowers.toLocaleString()}`);
  }

  if (criteria.minExperienceYears) {
    lines.push(`- Minimum years of experience: ${criteria.minExperienceYears}`);
  }

  if (criteria.requiredTitles && criteria.requiredTitles.length > 0) {
    lines.push(`- Required job titles (must have held): ${criteria.requiredTitles.join(', ')}`);
  }

  if (criteria.preferredTitles && criteria.preferredTitles.length > 0) {
    lines.push(`- Preferred job titles: ${criteria.preferredTitles.join(', ')}`);
  }

  if (criteria.requiredCompanies && criteria.requiredCompanies.length > 0) {
    lines.push(
      `- Required companies (must have worked at): ${criteria.requiredCompanies.join(', ')}`
    );
  }

  if (criteria.preferredCompanies && criteria.preferredCompanies.length > 0) {
    lines.push(`- Preferred companies: ${criteria.preferredCompanies.join(', ')}`);
  }

  if (criteria.requiredSkills && criteria.requiredSkills.length > 0) {
    lines.push(`- Required skills: ${criteria.requiredSkills.join(', ')}`);
  }

  if (criteria.preferredSkills && criteria.preferredSkills.length > 0) {
    lines.push(`- Preferred skills: ${criteria.preferredSkills.join(', ')}`);
  }

  if (criteria.requiredEducation && criteria.requiredEducation.length > 0) {
    lines.push(`- Required education: ${criteria.requiredEducation.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No specific criteria defined';
}
