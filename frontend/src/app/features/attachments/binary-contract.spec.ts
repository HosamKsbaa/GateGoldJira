import { describe, expect, it } from 'vitest';
import { attachmentBinaryResponse, attachmentUploadRequest } from './binary-contract';
import { maximumAttachmentBytes } from './attachment-files';

describe('Browser document binary contracts', () => {
  const input = {
    body: {
      metadata: { filename: 'تقرير.pdf', mimeType: 'application/pdf' },
      file: new File(['%PDF-1.7\nDocument\n%%EOF'], 'تقرير.pdf', { type: 'application/pdf' }),
    },
    headers: { 'Idempotency-Key': '90000000-0000-4000-8000-000000000001' },
    path: { issueId: '20000000-0000-4000-8000-000000000001' },
  };

  it('accepts real browser bytes and authenticated binary responses', () => {
    expect(attachmentUploadRequest.safeParse(input).success).toBe(true);
    expect(attachmentBinaryResponse.safeParse(input.body.file).success).toBe(true);
  });

  it('rejects string files and disallowed formats at the generated boundary', () => {
    expect(
      attachmentUploadRequest.safeParse({ ...input, body: { ...input.body, file: 'not bytes' } })
        .success,
    ).toBe(false);
    expect(
      attachmentUploadRequest.safeParse({
        ...input,
        body: { ...input.body, metadata: { filename: 'script.html', mimeType: 'text/html' } },
      }).success,
    ).toBe(false);
  });

  it('rejects malformed IDs and idempotency references', () => {
    expect(attachmentUploadRequest.safeParse({ ...input, path: { issueId: 'bad' } }).success).toBe(
      false,
    );
    expect(
      attachmentUploadRequest.safeParse({ ...input, headers: { 'Idempotency-Key': 'bad' } })
        .success,
    ).toBe(false);
  });

  it('rejects empty or oversized payloads before uploading', () => {
    for (const file of [new Blob([]), new Blob([new Uint8Array(maximumAttachmentBytes + 1)])]) {
      expect(
        attachmentUploadRequest.safeParse({ ...input, body: { ...input.body, file } }).success,
      ).toBe(false);
    }
  });
});
