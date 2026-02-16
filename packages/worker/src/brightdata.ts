/**
 * Check if a result is an error or warning (private profile, etc.)
 */
export function isError(result: Record<string, unknown>): boolean {
  return 'error' in result || 'warning' in result;
}

/**
 * Get the URL from a BrightData result (handles both formats)
 */
export function getResultUrl(result: Record<string, unknown>): string | undefined {
  // Normal profile has url at top level
  if ('url' in result && result.url) {
    return result.url as string;
  }
  // Error/warning results have url in input.url
  if ('input' in result && (result.input as any)?.url) {
    return (result.input as any).url;
  }
  return undefined;
}

/**
 * Extract the vanity name from a LinkedIn URL for matching
 * Handles different subdomains (www, ae, de, etc.) and formats
 */
export function extractVanityName(url: string): string | undefined {
  const match = url.match(/linkedin\.com\/in\/([^/?]+)/i);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Decompress gzip data using the Web Streams API
 */
export async function decompressGzip(compressedData: Uint8Array): Promise<Uint8Array> {
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
