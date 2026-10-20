import {
  appendAssetChunk,
  finalizeAssetUpload,
  getAssetUpload,
  startAssetUpload,
  getAsset,
} from '../../api/generated/sdk.gen';
import type { AssetMetadata, AssetView } from '../../api/generated/types.gen';
import type { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
import type { DraftFile } from '../../core/drafts/drafts.service';
function base64(bytes: Uint8Array): string {
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(value);
}
export async function uploadFile(
  client: AuthService['client'],
  issueId: string,
  metadata: AssetMetadata,
  item: DraftFile,
  progress: (received: number) => void,
  signal?: AbortSignal,
): Promise<AssetView> {
  signal?.throwIfAborted();
  if (!item.checksum) {
    const bytes = await item.file.arrayBuffer();
    signal?.throwIfAborted();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    signal?.throwIfAborted();
    item.checksum = Array.from(new Uint8Array(digest), value =>
      value.toString(16).padStart(2, '0'),
    ).join('');
  }
  signal?.throwIfAborted();
  if (!item.sessionId) {
    const start = await readResult(
      startAssetUpload({
        client: client,
        path: { issueId },
        body: { metadata, expectedBytes: String(item.file.size), checksum: item.checksum },
        headers: { 'Idempotency-Key': item.reference },
        signal,
      }),
    );
    signal?.throwIfAborted();
    item.sessionId = start.result.sessionId;
  }
  let session = await readResult(
    getAssetUpload({ client: client, path: { sessionId: item.sessionId }, signal }),
  );
  signal?.throwIfAborted();
  if (session.state === 'committed') {
    const asset = await readResult(getAsset({ client, path: { assetId: session.assetId }, signal }));
    signal?.throwIfAborted();
    return asset;
  }
  if (session.state === 'canceled' || session.state === 'expired')
    throw new Error('This upload was canceled or expired. Choose the file again.');
  let received = Number(session.receivedBytes);
  progress(received);
  item.chunkReferences ??= {};
  while (received < item.file.size) {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(
      await item.file.slice(received, received + Number(session.chunkBytes)).arrayBuffer(),
    );
    signal?.throwIfAborted();
    const reference = (item.chunkReferences[String(received)] ??= crypto.randomUUID());
    const appended = await readResult(
      appendAssetChunk({
        client: client,
        path: { sessionId: item.sessionId },
        body: { offset: String(received), dataBase64: base64(bytes) },
        headers: { 'Idempotency-Key': reference },
        signal,
      }),
    );
    signal?.throwIfAborted();
    session = appended.result;
    received = Number(session.receivedBytes);
    progress(received);
  }
  signal?.throwIfAborted();
  item.finalizeReference ??= crypto.randomUUID();
  const finalized = await readResult(
    finalizeAssetUpload({
      client: client,
      path: { sessionId: item.sessionId },
      headers: { 'Idempotency-Key': item.finalizeReference },
      signal,
    }),
  );
  signal?.throwIfAborted();
  return finalized.result;
}
