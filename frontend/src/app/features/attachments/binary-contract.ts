import * as z from 'zod';
import {
  zUploadAttachmentBody,
  zUploadAttachmentHeaders,
  zUploadAttachmentPath,
} from '../../api/generated/zod.gen';
import { maximumAttachmentBytes } from './attachment-files';

// The generator represents browser binaries as strings in Zod. Keep generated
// metadata, IDs and headers, and validate the real browser bytes at this boundary.
export const attachmentBinaryResponse = z.instanceof(Blob);
export const attachmentUploadRequest = z.object({
  body: zUploadAttachmentBody.extend({
    file: attachmentBinaryResponse.refine(
      value => value.size > 0 && value.size <= maximumAttachmentBytes,
    ),
  }),
  headers: zUploadAttachmentHeaders,
  path: zUploadAttachmentPath,
  query: z.never().optional(),
});
