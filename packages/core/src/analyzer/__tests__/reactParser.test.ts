import { describe, it, expect } from 'vitest';
import { createParserRegistry, isParseFailure } from '../parsers';
import type { ParsedFile } from '../types';

const parseReact = (relPath: string, content: string): ParsedFile => {
  const registry = createParserRegistry({ framework: 'react' });
  const r = registry.parse({ relPath, content });
  if (isParseFailure(r)) throw new Error(`unexpected parse failure: ${r.reason}`);
  return r;
};

describe('reactParser (via registry, framework=react)', () => {
  it('captures lazy(() => import(...)) as a dynamic edge', () => {
    const file = parseReact(
      'src/App.tsx',
      `import { lazy } from 'react';
       const Settings = lazy(() => import('./routes/Settings'));
       export const App = () => null;`,
    );
    const dynamic = file.imports.filter((i) => i.kind === 'dynamic');
    expect(dynamic.map((i) => i.specifier)).toContain('./routes/Settings');
  });

  it('captures multiple lazy imports independently', () => {
    const file = parseReact(
      'src/App.tsx',
      `import { lazy } from 'react';
       const A = lazy(() => import('./A'));
       const B = lazy(() => import('./B'));
       export const App = () => null;`,
    );
    const specs = file.imports.filter((i) => i.kind === 'dynamic').map((i) => i.specifier);
    expect(specs).toEqual(expect.arrayContaining(['./A', './B']));
  });

  it('captures next/dynamic(() => import(...)) as a dynamic edge', () => {
    const file = parseReact(
      'src/App.tsx',
      `import dynamic from 'next/dynamic';
       const Chart = dynamic(() => import('./widgets/Chart'));
       export const App = () => null;`,
    );
    const dynamic = file.imports.filter((i) => i.kind === 'dynamic');
    expect(dynamic.map((i) => i.specifier)).toContain('./widgets/Chart');
  });

  it('captures next/dynamic with an options object as a dynamic edge', () => {
    const file = parseReact(
      'src/App.tsx',
      `import dynamic from 'next/dynamic';
       const Map = dynamic(() => import('./widgets/Map'), { ssr: false });
       export const App = () => null;`,
    );
    const dynamic = file.imports.filter((i) => i.kind === 'dynamic');
    expect(dynamic.map((i) => i.specifier)).toContain('./widgets/Map');
  });

  it('captures static imports of JSX components', () => {
    const file = parseReact(
      'src/App.tsx',
      `import { Header } from './components/Header';
       import { SearchIcon } from './components/icons/SearchIcon';
       export const App = () => (<div><Header /><SearchIcon /></div>);`,
    );
    const statics = file.imports.filter((i) => i.kind === 'static').map((i) => i.specifier);
    expect(statics).toEqual(
      expect.arrayContaining(['./components/Header', './components/icons/SearchIcon']),
    );
  });

  it('routes .jsx extension as js language', () => {
    const file = parseReact(
      'src/App.jsx',
      `import { Foo } from './foo'; export const App = () => <Foo />;`,
    );
    expect(file.language).toBe('js');
  });

  it('routes .tsx extension as ts language', () => {
    const file = parseReact(
      'src/App.tsx',
      `import { Foo } from './foo'; export const App = (): JSX.Element => <Foo />;`,
    );
    expect(file.language).toBe('ts');
  });

  it('does not treat external react packages as project edges (filtered downstream)', () => {
    const file = parseReact(
      'src/App.tsx',
      `import React, { useState } from 'react';
       import { useNavigate } from 'react-router-dom';
       import './side-effect-only';
       export const App = () => null;`,
    );
    // bare specifiers are recorded; buildGraph filters externals later
    const specs = file.imports.map((i) => i.specifier);
    expect(specs).toEqual(
      expect.arrayContaining(['react', 'react-router-dom', './side-effect-only']),
    );
  });
});

describe('parser routing by framework', () => {
  it('uses tsParser for unknown framework (no React-specific routing today)', () => {
    const registry = createParserRegistry({ framework: 'unknown' });
    const r = registry.parse({
      relPath: 'src/App.tsx',
      content: `const Settings = lazy(() => import('./Settings')); export const App = () => null;`,
    });
    expect(isParseFailure(r)).toBe(false);
    // reactParser is currently a delegate; just check lazy() emits a dynamic edge
    const dynamic = (r as ParsedFile).imports.filter((i) => i.kind === 'dynamic');
    expect(dynamic.map((i) => i.specifier)).toContain('./Settings');
  });
});
