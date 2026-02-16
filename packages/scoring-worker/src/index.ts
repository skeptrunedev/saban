import Anthropic from '@anthropic-ai/sdk';
import type { Env, ProfileToScore, BrightDataProfile, QualificationCriteria, ScoringResult } from './types';

export default {
  /**
   * Cron handler - runs every 5 minutes to score profiles
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    console.log('Scoring cron: Starting');
    await runScoring(env);
    console.log('Scoring cron: Finished');
  },

  /**
   * HTTP handler for manual testing/health checks
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'saban-scoring-worker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Manual trigger for testing
    if (url.pathname === '/trigger') {
      const result = await runScoring(env);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

async function runScoring(env: Env): Promise<{ scored: number; failed: number; total: number }> {
  // Get profiles that need scoring from server
  const profilesToScore = await getProfilesToScore(env);

  if (profilesToScore.length === 0) {
    console.log('No profiles to score');
    return { scored: 0, failed: 0, total: 0 };
  }

  console.log(`Scoring ${profilesToScore.length} profiles`);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let scored = 0;
  let failed = 0;

  for (const profile of profilesToScore) {
    try {
      const result = await scoreProfile(client, profile.rawResponse, profile.criteria);

      await storeResult(env, profile.profileId, profile.qualificationId, result);

      console.log(
        `Profile ${profile.profileId} (${profile.qualificationName}): score=${result.score}, passed=${result.passed}`
      );
      scored++;
    } catch (err) {
      console.error(`Failed to score profile ${profile.profileId}:`, err);
      failed++;
    }
  }

  return { scored, failed, total: profilesToScore.length };
}

async function getProfilesToScore(env: Env): Promise<ProfileToScore[]> {
  const response = await fetch(`${env.SERVER_URL}/api/internal/scoring/pending`, {
    headers: {
      'X-Internal-Key': env.SERVER_INTERNAL_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get profiles to score: ${response.status}`);
  }

  const data = (await response.json()) as { success: boolean; data: ProfileToScore[] };
  return data.data || [];
}

async function storeResult(
  env: Env,
  profileId: number,
  qualificationId: number,
  result: ScoringResult
): Promise<void> {
  const response = await fetch(`${env.SERVER_URL}/api/internal/qualifications/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': env.SERVER_INTERNAL_KEY,
    },
    body: JSON.stringify({
      profileId,
      qualificationId,
      score: result.score,
      reasoning: result.reasoning,
      passed: result.passed,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to store result: ${response.status}`);
  }
}

async function scoreProfile(
  client: Anthropic,
  profile: BrightDataProfile,
  criteria: QualificationCriteria
): Promise<ScoringResult> {
  const profileSummary = buildProfileSummary(profile);
  const criteriaSummary = buildCriteriaSummary(criteria);

  const systemPrompt = `You are an expert recruiter evaluating LinkedIn profiles against job qualification criteria.
Your task is to score how well a candidate matches the requirements on a scale of 0-100.

Scoring guidelines:
- 90-100: Exceptional match, exceeds all requirements
- 70-89: Strong match, meets most requirements
- 50-69: Moderate match, meets some requirements
- 30-49: Weak match, meets few requirements
- 0-29: Poor match, does not meet requirements

IMPORTANT: Be flexible and make reasonable inferences when data is missing.
- If experience years aren't explicit, infer from job history, seniority of roles, or career progression
- A senior title or founder role implies significant experience
- High follower counts suggest industry influence and experience
- Don't penalize candidates for incomplete LinkedIn profiles - judge based on available evidence
- When in doubt, give the benefit of the doubt to candidates with strong signals

You must respond in valid JSON format with exactly these fields:
{
  "score": <number 0-100>,
  "reasoning": "<brief explanation of score>",
  "passed": <true if score >= 70, false otherwise>
}`;

  const userPrompt = `Evaluate this candidate profile against the job criteria.

## Candidate Profile
${profileSummary}

## Job Qualification Criteria
${criteriaSummary}

${criteria.customPrompt ? `## Additional Requirements\n${criteria.customPrompt}` : ''}

Respond with a JSON object containing score, reasoning, and passed fields.`;

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 500,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const result = JSON.parse(jsonMatch[0]) as ScoringResult;

  return {
    score: Math.max(0, Math.min(100, Math.round(result.score))),
    reasoning: result.reasoning || 'No reasoning provided',
    passed: result.score >= 70,
  };
}

function buildProfileSummary(profile: BrightDataProfile): string {
  const lines: string[] = [];

  lines.push(`**Name:** ${profile.name || `${profile.first_name} ${profile.last_name}`}`);
  lines.push(`**Headline:** ${profile.headline || 'Not specified'}`);
  lines.push(`**Location:** ${profile.location || 'Not specified'}`);
  lines.push(`**Connections:** ${profile.connections?.toLocaleString() || 'Unknown'}`);
  lines.push(`**Followers:** ${profile.followers?.toLocaleString() || 'Unknown'}`);

  if (profile.about) {
    lines.push(`\n**About:**\n${profile.about.substring(0, 500)}${profile.about.length > 500 ? '...' : ''}`);
  }

  if (profile.experience && profile.experience.length > 0) {
    lines.push('\n**Experience:**');
    for (const exp of profile.experience.slice(0, 5)) {
      const duration = exp.duration || '';
      const dates = exp.start_date ? `(${exp.start_date} - ${exp.end_date || 'Present'})` : '';
      lines.push(`- ${exp.title} at ${exp.company} ${dates} ${duration}`);
    }
  }

  if (profile.education && profile.education.length > 0) {
    lines.push('\n**Education:**');
    for (const edu of profile.education.slice(0, 3)) {
      const degree = edu.degree ? `${edu.degree}` : '';
      const field = edu.field_of_study ? ` in ${edu.field_of_study}` : '';
      lines.push(`- ${edu.school}${degree ? `: ${degree}${field}` : ''}`);
    }
  }

  if (profile.skills && profile.skills.length > 0) {
    lines.push(`\n**Skills:** ${profile.skills.slice(0, 15).join(', ')}`);
  }

  if (profile.certifications && profile.certifications.length > 0) {
    lines.push('\n**Certifications:**');
    for (const cert of profile.certifications.slice(0, 5)) {
      lines.push(`- ${cert.name}${cert.issuing_organization ? ` (${cert.issuing_organization})` : ''}`);
    }
  }

  if (profile.languages && profile.languages.length > 0) {
    lines.push(
      `\n**Languages:** ${profile.languages.map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`).join(', ')}`
    );
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
    lines.push(`- Required companies (must have worked at): ${criteria.requiredCompanies.join(', ')}`);
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
