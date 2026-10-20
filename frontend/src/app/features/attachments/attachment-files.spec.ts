import { describe, expect, it } from 'vitest';
import {
  attachmentFormat,
  attachmentMetadata,
  attachmentSize,
  maximumAttachmentBytes,
} from './attachment-files';

describe('Document attachment selection', () => {
  it.each([
    ['ملف.PDF', 'application/pdf'],
    ['notes.txt', 'text/plain'],
    ['export.csv', 'text/csv'],
    ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ])('derives metadata for %s even when the browser omits its MIME type', (filename, mimeType) => {
    expect(attachmentMetadata(new File(['contents'], filename))).toEqual({ filename, mimeType });
  });

  it('accepts arbitrary file kinds as downloads but rejects unsafe filenames and empty files', () => {
    for (const filename of ['../notes.txt', 'notes\n.txt']) {
      expect(attachmentMetadata(new File(['contents'], filename))).toBeNull();
    }
    for (const filename of ['script.html', 'picture.svg', 'archive.zip', 'legacy.doc'])
      expect(attachmentMetadata(new File(['contents'], filename))).toEqual({
        filename,
        mimeType: 'application/octet-stream',
      });
    expect(attachmentMetadata(new File([], 'empty.txt'))).toBeNull();
  });

  it('accepts the exact maximum file size and rejects oversized files', () => {
    const allowed = new File([new Uint8Array(maximumAttachmentBytes)], 'notes.txt');
    const oversized = new File([allowed, 'x'], 'notes.txt');
    expect(attachmentMetadata(allowed)?.mimeType).toBe('text/plain');
    expect(attachmentMetadata(oversized)).toBeNull();
  });

  it('formats compact file information without losing the format distinction', () => {
    expect(attachmentFormat('application/pdf')).toBe('PDF');
    expect(
      attachmentFormat('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('Word');
    expect(attachmentSize(20)).toBe('20 bytes');
    expect(attachmentSize(1536)).toBe('1.5 KiB');
    expect(attachmentSize(2 * 1024 * 1024)).toBe('2.0 MiB');
  });
});
