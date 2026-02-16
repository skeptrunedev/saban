import type { Env, EnrichmentJobMessage, BrightDataProfile } from './types';
import { triggerScrape, pollR2ForResults, isError } from './brightdata';
import { scoreProfileWithAI } from './anthropic';
import { ServerClient } from './server-client';

export default {
  /**
   * Queue consumer handler - processes enrichment jobs
   */
  async queue(
    batch: MessageBatch<EnrichmentJobMessage>,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const serverClient = new ServerClient(env);

    for (const message of batch.messages) {
      const job = message.body;
      console.log(`Processing job ${job.jobId} with ${job.profileIds.length} profiles`);

      try {
        await processJob(job, env, serverClient);
        message.ack();
      } catch (error) {
        console.error(`Job ${job.jobId} failed:`, error);

        // Update job status to failed
        await serverClient.updateJobStatus(
          job.jobId,
          'failed',
          undefined,
          error instanceof Error ? error.message : 'Unknown error'
        );

        // Retry if we have retries left, otherwise ack to move to DLQ
        if (message.attempts < 3) {
          message.retry();
        } else {
          message.ack();
        }
      }
    }
  },

  /**
   * HTTP handler for manual testing/health checks
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'saban-enrichment-worker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

/**
 * Process a single enrichment job
 */
async function processJob(
  job: EnrichmentJobMessage,
  env: Env,
  serverClient: ServerClient
): Promise<void> {
  const { jobId, profileIds, profileUrls, qualificationId } = job;

  // Update status to scraping
  await serverClient.updateJobStatus(jobId, 'scraping');

  // Trigger BrightData scrape with R2 delivery
  console.log(`Job ${jobId}: Triggering BrightData scrape for ${profileUrls.length} profiles`);
  const snapshotId = await triggerScrape(
    profileUrls,
    env.BRIGHTDATA_API_KEY,
    env.BRIGHTDATA_DATASET_ID,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY
  );

  await serverClient.updateJobStatus(jobId, 'scraping', snapshotId);
  console.log(`Job ${jobId}: BrightData snapshot ${snapshotId} created, results will be delivered to R2`);

  // Poll R2 for results (BrightData delivers to R2 when ready)
  const results = await pollR2ForResults(snapshotId, env.BRIGHTDATA_RESULTS);
  console.log(`Job ${jobId}: Got ${results.length} results from R2`);

  // Update status to enriching
  await serverClient.updateJobStatus(jobId, 'enriching', snapshotId);

  // Build URL to profileId mapping
  const urlToProfileId = new Map<string, number>();
  for (let i = 0; i < profileUrls.length; i++) {
    urlToProfileId.set(profileUrls[i], profileIds[i]);
  }

  // Store enrichment data
  const successfulProfiles: Array<{ profileId: number; data: BrightDataProfile }> = [];

  for (const result of results) {
    if (isError(result)) {
      console.error(`Job ${jobId}: Error for ${result.url}: ${result.error}`);
      continue;
    }

    const profileData = result as BrightDataProfile;
    const profileId = urlToProfileId.get(profileData.url);

    if (!profileId) {
      console.warn(`Job ${jobId}: No profile found for URL ${profileData.url}`);
      continue;
    }

    // Store enrichment
    await serverClient.storeEnrichment(profileId, profileData);
    console.log(`Job ${jobId}: Stored enrichment for profile ${profileId}`);

    successfulProfiles.push({ profileId, data: profileData });
  }

  // If qualification specified, run AI scoring
  if (qualificationId) {
    await serverClient.updateJobStatus(jobId, 'qualifying', snapshotId);

    const qualification = await serverClient.getQualification(qualificationId);
    if (qualification) {
      for (const { profileId, data } of successfulProfiles) {
        try {
          const { score, reasoning, passed } = await scoreProfileWithAI(
            data,
            qualification.criteria,
            env.ANTHROPIC_API_KEY
          );

          await serverClient.storeQualificationResult(
            profileId,
            qualificationId,
            score,
            reasoning,
            passed
          );

          console.log(
            `Job ${jobId}: Scored profile ${profileId}: ${score}/100 (${passed ? 'PASS' : 'FAIL'})`
          );
        } catch (err) {
          console.error(`Job ${jobId}: Failed to score profile ${profileId}:`, err);
        }
      }
    }
  }

  // Mark job complete
  await serverClient.completeJob(jobId);
  console.log(`Job ${jobId}: Completed successfully`);
}
