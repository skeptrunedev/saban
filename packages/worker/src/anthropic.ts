import Anthropic from '@anthropic-ai/sdk';
import type { BrightDataProfile, QualificationCriteria } from './types';

export interface ScoringResult {
  score: number;
  reasoning: string;
  passed: boolean;
}

/**
 * Score a LinkedIn profile against qualification criteria using Claude Haiku
 */
export async function scoreProfileWithAI(
  profile: BrightDataProfile,
  criteria: QualificationCriteria,
  apiKey: string
): Promise<ScoringResult> {
  const client = new Anthropic({ apiKey });

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

function buildProfileSummary(profile: BrightDataProfile): string {
  const lines: string[] = [];

  lines.push(`**Name:** ${profile.name || `${profile.first_name} ${profile.last_name}`}`);
  lines.push(`**Headline:** ${profile.headline || 'Not specified'}`);
  lines.push(`**Location:** ${profile.location || 'Not specified'}`);
  lines.push(`**Connections:** ${profile.connection_count?.toLocaleString() || 'Unknown'}`);
  lines.push(`**Followers:** ${profile.follower_count?.toLocaleString() || 'Unknown'}`);

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
      lines.push(
        `- ${cert.name}${cert.issuing_organization ? ` (${cert.issuing_organization})` : ''}`
      );
    }
  }

  if (profile.languages && profile.languages.length > 0) {
    lines.push(
      `\n**Languages:** ${profile.languages
        .map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`)
        .join(', ')}`
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
