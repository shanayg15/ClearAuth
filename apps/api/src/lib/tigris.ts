// Tigris object storage (S3-compatible) integration.
// STUB (owner: Shanay). Returns the key without any network so uploads work
// offline. Real impl: PutObject to the Tigris bucket via @aws-sdk/client-s3
// pointed at TIGRIS_ENDPOINT, and presign GETs for the dashboard.

export async function storeObject(
  key: string,
  body: string | Buffer,
  contentType: string
): Promise<string> {
  const bytes = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
  console.log(`[tigris] stub storeObject key=${key} contentType=${contentType} bytes=${bytes}`);
  try {
    // TODO(real): PutObject to TIGRIS_STORAGE_BUCKET, then return the key.
    return key;
  } catch (err) {
    console.error("[tigris] stub storeObject error:", err);
    return key;
  }
}

export async function getPresignedUrl(key: string): Promise<string | null> {
  console.log(`[tigris] stub getPresignedUrl key=${key}`);
  try {
    const endpoint = process.env.TIGRIS_ENDPOINT ?? "https://t3.storage.dev";
    const bucket = process.env.TIGRIS_STORAGE_BUCKET ?? "clearauth";
    // TODO(real): return a genuinely signed, time-limited GET URL.
    return `${endpoint}/${bucket}/${key}`;
  } catch (err) {
    console.error("[tigris] stub getPresignedUrl error:", err);
    return null;
  }
}
