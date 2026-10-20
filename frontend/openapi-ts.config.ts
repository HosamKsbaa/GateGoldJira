import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../backend/api/openapi.json',
  output: 'src/app/api/generated',
  plugins: [
    '@hey-api/typescript',
    '@hey-api/client-fetch',
    { name: 'zod', compatibilityVersion: 4 },
    { name: '@hey-api/sdk', validator: { request: 'zod', response: 'zod' } },
  ],
});
