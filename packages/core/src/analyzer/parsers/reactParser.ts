import type { ParsedFile } from '../types';
import type { TsParser, TsParseInput } from './tsParser';

export interface ReactParseInput {
  relPath: string;
  content: string;
  language: TsParseInput['language'];
}

export interface ReactParser {
  parse(input: ReactParseInput): ParsedFile;
}

export function createReactParser(tsParser: TsParser): ReactParser {
  return {
    parse(input) {
      return tsParser.parse({
        relPath: input.relPath,
        content: input.content,
        language: input.language,
      });
    },
  };
}
