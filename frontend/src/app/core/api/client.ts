import * as z from 'zod';
import {
  createClient,
  type Client,
  type Config,
  type RequestOptions,
  type ResponseStyle,
} from '../../api/generated/client';

// SDK 0.99 validates requests after Fetch converts header records to Headers.
// Normalize only the validator's boundary input; preserve the real HTTP headers,
// generic response types, and the generated body/path/query/header validators.
const requestParts = z.object({
  body: z.unknown().optional(),
  path: z.unknown().optional(),
  query: z.unknown().optional(),
  headers: z.instanceof(Headers),
});

function adaptHeaders(validator: Config['requestValidator']): Config['requestValidator'] {
  if (!validator) return undefined;
  return async input => {
    const parts = requestParts.parse(input);
    return validator({
      ...parts,
      headers: { 'Idempotency-Key': parts.headers.get('Idempotency-Key') },
    });
  };
}
function adaptMethod(method: Client['post']): Client['post'] {
  return <
    TData = unknown,
    TError = unknown,
    Throw extends boolean = false,
    Style extends ResponseStyle = 'fields',
  >(
    options: Omit<RequestOptions<TData, Style, Throw>, 'method'>,
  ) =>
    method<TData, TError, Throw, Style>({
      ...options,
      requestValidator: adaptHeaders(options.requestValidator),
    });
}
export function createApiClient(config: Config): Client {
  const client = createClient(config);
  return {
    ...client,
    post: adaptMethod(client.post),
    put: adaptMethod(client.put),
    patch: adaptMethod(client.patch),
  };
}
