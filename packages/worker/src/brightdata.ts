import type { BrightDataProfile, ScrapeError } from './types';

const BRIGHTDATA_BASE_URL = 'https://api.brightdata.com';
const R2_ENDPOINT = 'https://2f016a113dca4bbf3eda769b3f7d12fd.r2.cloudflarestorage.com';
const R2_BUCKET = 'saban-brightdata-results';

interface TriggerResponse {
  snapshot_id: string;
}

interface R2DeliveryConfig {
  type: 's3';
  filename: {
    template: string;
    extension: string;
  };
  bucket: string;
  endpoint_url: string;
  credentials: {
    'aws-access-key': string;
    'aws-secret-key': string;
  };
  directory: string;
  compress: boolean;
}

/**
 * Trigger a LinkedIn profile scrape via BrightData with R2 delivery
 * Results will be delivered to the R2 bucket instead of polling BrightData
 */
export async function triggerScrape(
  profileUrls: string[],
  apiKey: string,
  datasetId: string,
  r2AccessKey: string,
  r2SecretKey: string
): Promise<string> {
  const deliveryConfig: R2DeliveryConfig = {
    type: 's3',
    filename: {
      template: 'snapshot_{[job]}',
      extension: 'json',
    },
    bucket: R2_BUCKET,
    endpoint_url: R2_ENDPOINT,
    credentials: {
      'aws-access-key': r2AccessKey,
      'aws-secret-key': r2SecretKey,
    },
    directory: '',
    compress: true,
  };

  const response = await fetch(
    `${BRIGHTDATA_BASE_URL}/datasets/v3/trigger?dataset_id=${datasetId}&notify=false&include_errors=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: profileUrls.map((url) => ({ url })),
        deliver: deliveryConfig,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`BrightData trigger failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as TriggerResponse;
  return data.snapshot_id;
}

/**
 * Poll R2 bucket for BrightData results
 * The file will be named snapshot_{snapshotId}.json.gz
 */
export async function pollR2ForResults(
  snapshotId: string,
  r2Bucket: R2Bucket,
  maxAttempts = 60,
  initialDelayMs = 5000
): Promise<(BrightDataProfile | ScrapeError)[]> {
  // File is compressed and named snapshot_{job}.json.gz
  const fileName = `snapshot_${snapshotId}.json.gz`;
  let attempts = 0;
  let delayMs = initialDelayMs;

  console.log(`Polling R2 for file: ${fileName}`);

  while (attempts < maxAttempts) {
    const object = await r2Bucket.get(fileName);

    if (object) {
      console.log(`Found results file in R2: ${fileName}`);

      // Decompress gzip and parse JSON
      const compressedData = await object.arrayBuffer();
      const decompressed = await decompressGzip(new Uint8Array(compressedData));
      const jsonText = new TextDecoder().decode(decompressed);
      const data = JSON.parse(jsonText) as (BrightDataProfile | ScrapeError)[];

      return data;
    }

    attempts++;
    console.log(`R2 poll attempt ${attempts}/${maxAttempts} - file not ready yet`);
    await sleep(delayMs);
    // Exponential backoff, max 30 seconds
    delayMs = Math.min(delayMs * 1.5, 30000);
  }

  throw new Error(`Results not found in R2 after ${maxAttempts} attempts for snapshot ${snapshotId}`);
}

/**
 * Decompress gzip data using the Web Streams API
 */
async function decompressGzip(compressedData: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(compressedData);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine all chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a result is an error
 */
export function isError(result: BrightDataProfile | ScrapeError): result is ScrapeError {
  return 'error' in result;
}
