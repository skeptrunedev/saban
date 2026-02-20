import type { Env } from './types';
import { isError, getResultUrl, extractVanityName, decompressGzip } from './brightdata';
import { ServerClient } from './server-client';

export default {
  /**
   * Cron handler - runs every minute to:
   * 1. Process any BrightData results in R2
   * 2. Trigger scrapes for unenriched profiles
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    console.log('Cron: Starting scheduled tasks');
    const serverClient = new ServerClient(env);

    // Step 1: Process R2 results
    console.log('Cron: Checking R2 for BrightData results');
    const listed = await env.BRIGHTDATA_RESULTS.list();
    console.log(`Cron: Found ${listed.objects.length} files in R2`);

    for (const obj of listed.objects) {
      // Skip non-gzip files
      if (!obj.key.endsWith('.json.gz')) {
        console.log(`Cron: Skipping non-gzip file: ${obj.key}`);
        continue;
      }

      console.log(`Cron: Processing file ${obj.key}`);

      try {
        await processR2File(obj.key, env, serverClient);

        // Delete the file after successful processing
        await env.BRIGHTDATA_RESULTS.delete(obj.key);
        console.log(`Cron: Deleted processed file ${obj.key}`);
      } catch (error) {
        console.error(`Cron: Error processing ${obj.key}:`, error);
        // Don't delete on error - will retry next cron run
      }
    }

    // Step 2: Enrich profiles using People Data Labs API
    console.log('Cron: Enriching profiles with PDL');
    try {
      const result = await serverClient.enrichWithPDL(10);
      console.log(`Cron: PDL enrichment result: ${result.enriched} enriched, ${result.failed} failed`);
    } catch (error) {
      console.error('Cron: Error enriching with PDL:', error);
    }

    // Step 3: Run pending scoring (for new qualifications against existing profiles)
    console.log('Cron: Running pending scoring');
    try {
      const result = await serverClient.runPendingScoring(50);
      console.log(`Cron: Scoring result: ${result.scored} scored, ${result.failed} failed, ${result.remaining} remaining`);
    } catch (error) {
      console.error('Cron: Error running scoring:', error);
    }

    console.log('Cron: Finished scheduled tasks');
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

    // Manual trigger for processing R2 results
    if (url.pathname === '/trigger') {
      const serverClient = new ServerClient(env);
      const listed = await env.BRIGHTDATA_RESULTS.list();

      const results: string[] = [];
      for (const obj of listed.objects) {
        if (!obj.key.endsWith('.json.gz')) continue;

        try {
          await processR2File(obj.key, env, serverClient);
          await env.BRIGHTDATA_RESULTS.delete(obj.key);
          results.push(`Processed and deleted: ${obj.key}`);
        } catch (error) {
          results.push(`Error with ${obj.key}: ${error}`);
        }
      }

      return new Response(JSON.stringify({ processed: results }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Manual trigger for PDL enrichment
    if (url.pathname === '/trigger-pdl') {
      const serverClient = new ServerClient(env);
      try {
        const result = await serverClient.enrichWithPDL(50);
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Manual trigger for running pending scoring
    if (url.pathname === '/trigger-scoring') {
      const serverClient = new ServerClient(env);
      try {
        const result = await serverClient.runPendingScoring(100);
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};

/**
 * Process a single R2 file containing BrightData results
 */
async function processR2File(
  key: string,
  env: Env,
  serverClient: ServerClient
): Promise<void> {
  const object = await env.BRIGHTDATA_RESULTS.get(key);
  if (!object) {
    throw new Error(`File not found: ${key}`);
  }

  // Decompress and parse
  const compressedData = await object.arrayBuffer();
  const decompressed = await decompressGzip(new Uint8Array(compressedData));
  const jsonText = new TextDecoder().decode(decompressed);
  const results = JSON.parse(jsonText) as Record<string, unknown>[];

  console.log(`Processing ${results.length} results from ${key}`);

  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    const resultUrl = getResultUrl(result);

    if (isError(result)) {
      const errorMsg = result.error || result.warning;
      console.log(`Skipping error result for ${resultUrl}: ${errorMsg}`);
      errorCount++;
      continue;
    }

    const vanityName = resultUrl ? extractVanityName(resultUrl) : undefined;

    if (!vanityName) {
      console.warn(`Could not extract vanity name from URL: ${resultUrl}`);
      errorCount++;
      continue;
    }

    try {
      // Store enrichment by vanity name (server will look up profile)
      await serverClient.storeEnrichmentByVanity(vanityName, result as any);
      console.log(`Stored enrichment for vanity: ${vanityName}`);
      successCount++;
    } catch (err) {
      console.error(`Failed to store enrichment for ${vanityName}:`, err);
      errorCount++;
    }
  }

  console.log(`Processed ${key}: ${successCount} success, ${errorCount} errors`);
}
