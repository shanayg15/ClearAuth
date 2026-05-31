// Tigris object storage (S3-compatible) integration — $1,500 prize target.
// Stores raw clinical notes (notes/{id}.txt) and generated PA packets
// (packets/{id}.md), and presigns GETs so the dashboard can open them.
//
// Fail-soft is the #1 rule: with no creds, or on any error/timeout, log `[tigris]`
// and return the key (store) / null (presign) so the pipeline never blocks and
// never throws into the request path.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ENDPOINT = process.env.TIGRIS_ENDPOINT ?? "https://t3.storage.dev";
const BUCKET = process.env.TIGRIS_STORAGE_BUCKET ?? "clearauth";
const TIMEOUT_MS = 10_000;
const PRESIGN_TTL_SECONDS = 600; // 10 minutes

// undefined = not yet resolved, null = resolved-but-unconfigured (no creds).
let _client: S3Client | null | undefined;

function getClient(): S3Client | null {
  if (_client !== undefined) return _client;
  const accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.log("[tigris] no credentials set — running in offline (no-op) mode");
    _client = null;
    return null;
  }
  _client = new S3Client({
    region: "auto",
    endpoint: ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
  });
  console.log(`[tigris] client configured for ${ENDPOINT} bucket=${BUCKET}`);
  return _client;
}

// Reject (not hang) if a Tigris call exceeds the budget; callers catch + fall back.
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`tigris timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * PutObject the body to the Tigris bucket. Returns the key on success OR on any
 * failure (so callers can persist the key regardless and retry/presign later).
 */
export async function storeObject(
  key: string,
  body: string | Buffer,
  contentType: string
): Promise<string> {
  const client = getClient();
  const bytes = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
  if (!client) {
    console.log(`[tigris] skip upload (offline) key=${key} bytes=${bytes}`);
    return key;
  }
  try {
    const Body = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    await withTimeout(
      client.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: key, Body, ContentType: contentType })
      ),
      TIMEOUT_MS
    );
    console.log(`[tigris] stored key=${key} contentType=${contentType} bytes=${bytes}`);
    return key;
  } catch (err) {
    console.error(`[tigris] storeObject failed key=${key}:`, err instanceof Error ? err.message : err);
    return key;
  }
}

/**
 * Presigned GET URL valid for 10 minutes, or null when unconfigured / on error.
 */
export async function getPresignedUrl(key: string): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.log(`[tigris] no presigned URL (offline) key=${key}`);
    return null;
  }
  try {
    const url = await withTimeout(
      getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
        expiresIn: PRESIGN_TTL_SECONDS,
      }),
      TIMEOUT_MS
    );
    return url;
  } catch (err) {
    console.error(`[tigris] getPresignedUrl failed key=${key}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
