import { Injectable, inject } from '@angular/core';
import {
  cancelAssetUpload,
  detachAsset,
  downloadAssetChunk,
  getAsset,
  getAssetPolicy,
  listAssets,
} from '../../api/generated/sdk.gen';
import type { AssetMetadata, AssetView } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
import { createApiClient } from '../../core/api/client';
import type { DraftFile } from '../../core/drafts/drafts.service';

@Injectable({ providedIn: 'root' })
export class AssetsApi {
  private readonly auth = inject(AuthService);
  policy() {
    return readResult(getAssetPolicy({ client: this.auth.client }));
  }
  get(assetId: string, signal?: AbortSignal) {
    return readResult(getAsset({ client: this.auth.client, path: { assetId }, signal }));
  }
  list(issueId: string, cursor?: string, includeOwnDrafts = false) {
    return readResult(
      listAssets({
        client: this.auth.client,
        path: { issueId },
        query: { limit: 25, includeOwnDrafts, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  detach(assetId: string, expectedIssueRevision: string, reference: string) {
    return readResult(
      detachAsset({
        client: this.auth.client,
        path: { assetId },
        body: { expectedIssueRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  cancel(sessionId: string, reference: string) {
    return readResult(
      cancelAssetUpload({
        client: this.auth.client,
        path: { sessionId },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  async uploadFile(
    issueId: string,
    metadata: AssetMetadata,
    item: DraftFile,
    progress: (received: number) => void,
    signal?: AbortSignal,
  ): Promise<AssetView> {
    const epoch = this.auth.sessionEpoch();
    const requireOwner = () => {
      signal?.throwIfAborted();
      if (epoch !== this.auth.sessionEpoch()) throw new Error('Your session changed.');
    };
    const configured = this.auth.client.getConfig();
    const originalFetch = configured.fetch ?? globalThis.fetch;
    // Generated auth/validation awaits can outlive the caller's next Angular
    // effect. Check the captured account immediately before actual dispatch,
    // preserving the configured cache policy and denial handling.
    const client = createApiClient({
      ...configured,
      fetch: (input, init) => {
        requireOwner();
        return originalFetch(input, init);
      },
    });
    const uploader = await import('./resumable-upload');
    requireOwner();
    try {
      const saved = await uploader.uploadFile(client, issueId, metadata, item, progress, signal);
      requireOwner();
      return saved;
    } catch (error: unknown) {
      requireOwner();
      throw error;
    }
  }

  async content(assetId: string, signal?: AbortSignal): Promise<Blob> {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0,
      mimeType = 'application/octet-stream';
    while (true) {
      signal?.throwIfAborted();
      const chunk = await readResult(
        downloadAssetChunk({
          client: this.auth.client,
          path: { assetId },
          query: { offset: String(offset), count: '1048576' },
          signal,
        }),
      );
      mimeType = chunk.asset.mimeType;
      const bytes = Uint8Array.from(atob(chunk.dataBase64), character => character.charCodeAt(0));
      if (!bytes.length || offset + bytes.length > Number(chunk.asset.byteSize))
        throw new Error('The attachment transfer stopped before completion.');
      chunks.push(bytes);
      offset += bytes.length;
      if (chunk.terminal) {
        if (offset !== Number(chunk.asset.byteSize))
          throw new Error('The attachment size changed.');
        break;
      }
    }
    return new Blob(chunks, { type: mimeType });
  }
}
