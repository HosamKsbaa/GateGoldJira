import * as z from 'zod';
import {
  zUploadPictureBody,
  zUploadPictureHeaders,
  zUploadPicturePath,
} from '../../api/generated/zod.gen';

// Hey API 0.99 generates binary TypeScript inputs as Blob/File but its Zod
// plugin emits a string. Compose its generated metadata/path/header validators
// with the browser's concrete binary boundary; keep generated files untouched.
export const pictureBinaryResponse = z.instanceof(Blob);
export const pictureUploadRequest = z.object({
  body: zUploadPictureBody.extend({ file: pictureBinaryResponse }),
  headers: zUploadPictureHeaders,
  path: zUploadPicturePath,
  query: z.never().optional(),
});
