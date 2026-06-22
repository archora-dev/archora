import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/core/src/analyzer/__tests__ -> repo root is 5 levels up.
const repoRoot = path.resolve(here, '../../../../..');

export const fixturePath = (name: string): string => path.join(repoRoot, 'fixtures', name);
