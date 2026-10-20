import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const catalog = z.object({ cases: z.array(z.object({ id: z.string() })) }).parse(
  JSON.parse(readFileSync(resolve('../docs/use-cases/catalog.json'), 'utf8')) as unknown,
);
const ids = new Set(catalog.cases.map(item => item.id));

/** Attribute only the action and assertions actually executed inside this step. */
export type UseCaseSurface = 'web' | 'rest' | 'mcp' | 'operator' | 'background' | 'plugin' | 'frontend_service';
export async function useCase<T>(id: string, body: () => Promise<T>, surface?: UseCaseSurface): Promise<T> {
  if (!ids.has(id)) throw new Error('Unknown use-case ID: ' + id);
  return test.step('use-case: ' + id + (surface ? ' [' + surface + ']' : ''), body);
}
