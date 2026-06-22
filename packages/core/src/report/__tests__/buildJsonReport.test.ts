import { describe, it, expect } from 'vitest';
import { analyze } from '../../analyzer';
import { createNodeFsFileSource } from '../../analyzer/sources/nodeFsFileSource';
import { fixturePath } from '../../analyzer/__tests__/_paths';
import { buildJsonReport, type ReportEnvelope } from '../buildJsonReport';

describe('buildJsonReport', () => {
  it('wraps the scan result in a versioned envelope', async () => {
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-cycles') });
    const scan = await analyze(source);

    const json = buildJsonReport(scan, {
      appVersion: 'archora@test',
      exportedAt: '2026-01-01T00:00:00.000Z',
    });

    const parsed = JSON.parse(json) as ReportEnvelope;
    expect(parsed.schema).toBe(1);
    expect(parsed.app).toBe('archora@test');
    expect(parsed.exportedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.scan.project.name).toBe(scan.project.name);
    expect(parsed.scan.modules.length).toBe(scan.modules.length);
    expect(parsed.scan.cycles).toHaveLength(2);
  });

  it('produces minified output when pretty is false', async () => {
    const source = await createNodeFsFileSource({ rootPath: fixturePath('sample-cycles') });
    const scan = await analyze(source);
    const compact = buildJsonReport(scan, { pretty: false });
    const pretty = buildJsonReport(scan);
    expect(compact.length).toBeLessThan(pretty.length);
    expect(compact.includes('\n')).toBe(false);
  });
});
