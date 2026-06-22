import { fromA } from './a';
import { fromC } from './c';
import { lonely } from './standalone';
export const run = (): string => `${fromA()}-${fromC()}-${lonely()}`;
