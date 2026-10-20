import type { AssetMetadata, AttachmentUploadMetadata } from '../../api/generated/types.gen';

export const maximumAttachmentBytes = 10 * 1024 * 1024;
export const attachmentFileAccept = '*/*';

const formats = [
  { extension: '.pdf', mimeType: 'application/pdf', label: 'PDF' },
  { extension: '.txt', mimeType: 'text/plain', label: 'Text' },
  { extension: '.csv', mimeType: 'text/csv', label: 'CSV' },
  {
    extension: '.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
  },
  {
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel',
  },
] satisfies Array<{
  extension: string;
  mimeType: AttachmentUploadMetadata['mimeType'];
  label: string;
}>;

export function attachmentMetadata(
  file: File,
  maximum = maximumAttachmentBytes,
): AttachmentUploadMetadata | null {
  if (file.size < 1 || file.size > maximum) return null;
  const filename = file.name.trim();
  if (!filename || /[\u0000-\u001f\u007f/\\]/u.test(filename)) return null;
  const format = formats.find(value => filename.toLowerCase().endsWith(value.extension));
  if (!format) return { filename, mimeType: 'application/octet-stream' };
  // Browsers sometimes omit document MIME types. The backend validates actual
  // bytes against the extension and declared format before accepting a file.
  return { filename, mimeType: format.mimeType };
}

export function attachmentFormat(mimeType: AttachmentUploadMetadata['mimeType']): string {
  return formats.find(value => value.mimeType === mimeType)?.label ?? 'Document';
}

export function attachmentSize(value: number | string): string {
  const byteSize = Number(value);
  if (byteSize < 1024) return `${byteSize} bytes`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KiB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MiB`;
}

export function assetMetadata(
  file: File,
  maximum: number,
  publication: AssetMetadata['publication'],
): AssetMetadata | null {
  const document = attachmentMetadata(file, maximum);
  if (!document) return null;
  const imageType = ['image/png', 'image/jpeg', 'image/webp'].find(mime => mime === file.type);
  if (imageType === 'image/png' || imageType === 'image/jpeg' || imageType === 'image/webp') {
    if (file.size > Math.min(maximum, 10 * 1024 * 1024)) return null;
    return {
      kind: 'image',
      filename: document.filename,
      description: Array.from(document.filename).slice(0, 200).join(''),
      mimeType: imageType,
      publication,
    };
  }
  return {
    kind: 'file',
    filename: document.filename,
    description: '',
    mimeType: document.mimeType,
    publication,
  };
}
