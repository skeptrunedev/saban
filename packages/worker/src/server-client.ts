import type { BrightDataProfile, JobQualification, Env } from './types';

/**
 * Client for calling back to the Elysia server's internal API
 */
export class ServerClient {
  private serverUrl: string;
  private internalKey: string;

  constructor(env: Env) {
    this.serverUrl = env.SERVER_URL;
    this.internalKey = env.SERVER_INTERNAL_KEY;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': this.internalKey,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return (data as { data: T }).data;
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: string,
    snapshotId?: string,
    error?: string
  ): Promise<void> {
    await this.fetch('/api/internal/jobs/status', {
      method: 'POST',
      body: JSON.stringify({ jobId, status, snapshotId, error }),
    });
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId: string): Promise<void> {
    await this.fetch('/api/internal/jobs/complete', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  }

  /**
   * Store enrichment data for a profile
   */
  async storeEnrichment(profileId: number, data: BrightDataProfile): Promise<void> {
    await this.fetch('/api/internal/enrichments', {
      method: 'POST',
      body: JSON.stringify({
        profileId,
        connectionCount: data.connection_count,
        followerCount: data.follower_count,
        experience: data.experience,
        education: data.education,
        skills: data.skills,
        certifications: data.certifications,
        languages: data.languages,
        about: data.about,
        rawResponse: data,
      }),
    });
  }

  /**
   * Store qualification result for a profile
   */
  async storeQualificationResult(
    profileId: number,
    qualificationId: number,
    score: number,
    reasoning: string,
    passed: boolean
  ): Promise<void> {
    await this.fetch('/api/internal/qualifications/result', {
      method: 'POST',
      body: JSON.stringify({
        profileId,
        qualificationId,
        score,
        reasoning,
        passed,
      }),
    });
  }

  /**
   * Get qualification by ID
   */
  async getQualification(qualificationId: number): Promise<JobQualification | null> {
    try {
      return await this.fetch<JobQualification>(`/api/internal/qualifications/${qualificationId}`);
    } catch {
      return null;
    }
  }
}
