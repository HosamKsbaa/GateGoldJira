import * as z from 'zod';
import { zFailure } from '../../api/generated/zod.gen';

// Unknown data is confined to the JSON boundary; domain callers receive generated DTOs.
const failureSchema = z.object({ error: zFailure, current: z.unknown(), unfinished: z.unknown() });
export type FailurePayload = z.infer<typeof failureSchema>;
export const parseFailure = (input: unknown) => failureSchema.safeParse(input);
export class ApiError extends Error {
  constructor(
    readonly payload: FailurePayload,
    readonly status: number,
  ) {
    super(payload.error.message);
  }
}
export async function readResult<T>(
  request: Promise<{
    data?: T;
    error?: unknown;
    response?: Response;
  }>,
): Promise<T> {
  const result = await request;
  if (result.data !== undefined) return result.data;
  const failure = parseFailure(result.error);
  if (failure.success) throw new ApiError(failure.data, result.response?.status ?? 0);
  throw new Error('The service could not complete this request. Try again.');
}

export class RetryIntent<T> {
  private intention: { canonical: string; reference: string } | null = null;
  reference(input: T): string {
    const canonical = JSON.stringify(input);
    if (this.intention?.canonical !== canonical)
      this.intention = { canonical, reference: crypto.randomUUID() };
    return this.intention.reference;
  }
  finish(): void {
    this.intention = null;
  }
}
