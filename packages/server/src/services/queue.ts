// Cloudflare Queue producer client
// Sends jobs to the CF Queue for processing by the worker

// Read env vars at runtime to avoid ESM hoisting issues
function getCfAccountId() {
  return process.env.CLOUDFLARE_ACCOUNT_ID;
}
function getCfApiToken() {
  return process.env.CLOUDFLARE_API_TOKEN;
}
function getCfQueueId() {
  return process.env.CLOUDFLARE_QUEUE_ID || '8086a32ffb1a4a06b43de1891516a637';
}

interface EnrichmentJobMessage {
  jobId: string;
  profileIds: number[];
  profileUrls: string[];
  qualificationId?: number;
  organizationId: string;
}

/**
 * Send a job to the Cloudflare Queue
 */
export async function enqueueJob(message: EnrichmentJobMessage): Promise<void> {
  const accountId = getCfAccountId();
  const apiToken = getCfApiToken();
  const queueId = getCfQueueId();

  console.log('[Queue] Credentials:', { accountId, queueId, tokenPrefix: apiToken?.slice(0, 10) });

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare credentials not configured (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/queues/${queueId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: message,
        content_type: 'json',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to enqueue job: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log(`Enqueued job ${message.jobId} to CF Queue:`, result);
}

/**
 * Check if CF Queue is configured
 */
export function isQueueConfigured(): boolean {
  return !!(getCfAccountId() && getCfApiToken());
}
