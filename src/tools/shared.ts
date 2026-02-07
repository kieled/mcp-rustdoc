import { z } from 'zod';

/** Zod enum shared by tools that accept an item type parameter. */
export const itemTypeEnum = z.enum([
  'mod', 'struct', 'enum', 'trait', 'fn', 'macro',
  'type', 'constant', 'static', 'union', 'attr', 'derive',
]);

/** Optional version parameter shared across tools. */
export const versionParam = z
  .string()
  .optional()
  .describe('Crate version (e.g. "1.49.0"). Defaults to latest.');
