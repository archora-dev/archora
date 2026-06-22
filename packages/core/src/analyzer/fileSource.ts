export interface FileSource {
  rootPath: string;
  list(): Promise<string[]>;
  read(relativePath: string): Promise<string>;
  readMany?(relativePaths: readonly string[]): Promise<Record<string, string>>;
  /** True iff `relativePath` is a regular file (not a directory). */
  exists(relativePath: string): Promise<boolean>;
}
