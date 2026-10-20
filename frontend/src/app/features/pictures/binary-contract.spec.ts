import { describe, expect, it } from 'vitest';
import { pictureBinaryResponse, pictureUploadRequest } from './binary-contract';
describe('Browser picture binary contracts', () => {
  const input = {
    body: {
      file: new Blob(['picture'], { type: 'image/png' }),
      metadata: {
        filename: 'شرح.png',
        description: 'توضيح',
        mimeType: 'image/png',
        publication: 'comment_draft',
      },
    },
    headers: { 'Idempotency-Key': '90000000-0000-4000-8000-000000000001' },
    path: { issueId: '20000000-0000-4000-8000-000000000001' },
  };
  it('accepts actual browser binary inputs and downloads', () => {
    expect(pictureUploadRequest.safeParse(input).success).toBe(true);
    expect(pictureBinaryResponse.safeParse(input.body.file).success).toBe(true);
  });
  it('rejects string files, malformed metadata and authority fields at generated boundaries', () => {
    expect(
      pictureUploadRequest.safeParse({ ...input, body: { ...input.body, file: 'not bytes' } })
        .success,
    ).toBe(false);
    expect(
      pictureUploadRequest.safeParse({
        ...input,
        body: { ...input.body, metadata: { ...input.body.metadata, mimeType: 'image/svg+xml' } },
      }).success,
    ).toBe(false);
    expect(pictureUploadRequest.safeParse({ ...input, path: { issueId: 'bad' } }).success).toBe(
      false,
    );
  });
});
