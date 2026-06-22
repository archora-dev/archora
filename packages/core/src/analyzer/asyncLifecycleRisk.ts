import ts from 'typescript';
import type { FileSource } from './fileSource';
import type { AsyncLifecycleRiskFinding, DetectedFramework, ModuleNode } from './types';

export interface DetectAsyncLifecycleRisksInput {
  source: FileSource;
  modules: readonly ModuleNode[];
  framework: DetectedFramework;
}

interface RiskContext {
  module: ModuleNode;
  framework: DetectedFramework;
  sourceFile: ts.SourceFile;
}

export async function detectAsyncLifecycleRisks(
  input: DetectAsyncLifecycleRisksInput,
): Promise<AsyncLifecycleRiskFinding[]> {
  const findings: AsyncLifecycleRiskFinding[] = [];
  for (const module of input.modules) {
    if (module.runtime === 'server') continue;
    const code = await readSource(input.source, module.id);
    if (code === null) continue;
    const script = scriptContent(module.id, code);
    if (script.trim().length === 0) continue;
    const sourceFile = ts.createSourceFile(
      module.id,
      script,
      ts.ScriptTarget.Latest,
      false,
      scriptKindFor(module.id),
    );
    const context = {
      module,
      framework: input.framework,
      sourceFile,
    };
    findings.push(...detectInModule(context));
  }
  return dedupeFindings(findings);
}

function detectInModule(context: RiskContext): AsyncLifecycleRiskFinding[] {
  if (context.framework === 'react' || context.framework === 'next') {
    return detectLifecycleCall(context, 'useEffect', 'returned cleanup');
  }
  if (context.framework === 'vue' || context.framework === 'nuxt') {
    const cleanupRoots = collectLifecycleCleanups(context.sourceFile, 'onUnmounted');
    return detectLifecycleCall(context, 'onMounted', 'onUnmounted cleanup', cleanupRoots);
  }
  if (context.framework === 'svelte') {
    return detectLifecycleCall(context, 'onMount', 'returned cleanup');
  }
  return [];
}

function detectLifecycleCall(
  context: RiskContext,
  lifecycleName: string,
  cleanupLabel: string,
  externalCleanupRoots: readonly ts.Node[] = [],
): AsyncLifecycleRiskFinding[] {
  const findings: AsyncLifecycleRiskFinding[] = [];
  visit(context.sourceFile, (node) => {
    if (!ts.isCallExpression(node) || !isIdentifierCall(node, lifecycleName)) return;
    const callback = node.arguments[0];
    if (!callback || !isFunctionLike(callback)) return;
    const body = callback.body;
    if (!ts.isBlock(body)) return;
    if (!hasAsyncWork(body)) return;
    if (hasAbortOrStaleGuard(body, externalCleanupRoots)) return;
    findings.push(buildFinding(context, body, cleanupLabel));
  });
  return findings;
}

function buildFinding(
  context: RiskContext,
  node: ts.Node,
  cleanupLabel: string,
): AsyncLifecycleRiskFinding {
  const line =
    context.sourceFile.getLineAndCharacterOfPosition(node.getStart(context.sourceFile)).line + 1;
  return {
    id: `async-lifecycle:async-effect-cleanup:${context.module.id}:${line}`,
    kind: 'async-effect-cleanup',
    moduleId: context.module.id,
    framework: context.framework,
    severity: 'medium',
    confidence: 'high',
    evidence: [
      {
        message: `async lifecycle work has no visible abort, stale guard, or ${cleanupLabel}`,
        line,
        asyncSource: 'fetch',
        expectedGuard: 'AbortController or stale guard cleanup',
      },
    ],
    remediation:
      'Add AbortController, a stale-result guard, or lifecycle cleanup before updating state.',
  };
}

function hasAsyncWork(root: ts.Node): boolean {
  return hasNode(root, (node) => {
    if (ts.isAwaitExpression(node)) return true;
    if (!ts.isCallExpression(node)) return false;
    const name = callName(node.expression);
    return name === 'fetch' || name === 'then' || name === 'catch' || name === 'finally';
  });
}

function hasAbortOrStaleGuard(body: ts.Block, externalCleanupRoots: readonly ts.Node[]): boolean {
  const roots = [body, returnedCleanup(body), ...externalCleanupRoots].filter(
    (node): node is ts.Node => Boolean(node),
  );
  return (
    roots.some((root) =>
      hasNode(root, (node) => {
        if (ts.isNewExpression(node) && callName(node.expression) === 'AbortController') {
          return true;
        }
        if (!ts.isCallExpression(node)) return false;
        const name = callName(node.expression);
        return name === 'abort' || name === 'cancel' || name === 'unsubscribe' || name === 'stop';
      }),
    ) || hasStaleGuard(body)
  );
}

function hasStaleGuard(root: ts.Node): boolean {
  return hasNode(root, (node) => {
    if (!ts.isIdentifier(node)) return false;
    return /^(cancelled|canceled|stale|ignore|ignored|mounted|isMounted)$/u.test(node.text);
  });
}

function returnedCleanup(block: ts.Block): ts.Node | undefined {
  for (const statement of block.statements) {
    if (!ts.isReturnStatement(statement) || !statement.expression) continue;
    return statement.expression;
  }
  return undefined;
}

function collectLifecycleCleanups(sourceFile: ts.SourceFile, name: string): ts.Node[] {
  const nodes: ts.Node[] = [];
  visit(sourceFile, (node) => {
    if (!ts.isCallExpression(node) || !isIdentifierCall(node, name)) return;
    const callback = node.arguments[0];
    if (callback && isFunctionLike(callback)) nodes.push(callback.body);
  });
  return nodes;
}

function visit(node: ts.Node, cb: (node: ts.Node) => void): void {
  cb(node);
  ts.forEachChild(node, (child) => visit(child, cb));
}

function hasNode(root: ts.Node, predicate: (node: ts.Node) => boolean): boolean {
  let found = false;
  visit(root, (node) => {
    if (!found && predicate(node)) found = true;
  });
  return found;
}

function isFunctionLike(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function isIdentifierCall(node: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === name;
}

function callName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function dedupeFindings(
  findings: readonly AsyncLifecycleRiskFinding[],
): AsyncLifecycleRiskFinding[] {
  const seen = new Set<string>();
  const out: AsyncLifecycleRiskFinding[] = [];
  for (const finding of findings) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);
    out.push(finding);
  }
  return out;
}

async function readSource(source: FileSource, moduleId: string): Promise<string | null> {
  try {
    return await source.read(moduleId);
  } catch {
    return null;
  }
}

function scriptContent(moduleId: string, content: string): string {
  if (moduleId.endsWith('.vue') || moduleId.endsWith('.svelte')) {
    const blocks: string[] = [];
    const lower = content.toLowerCase();
    let offset = 0;
    while (offset < content.length) {
      const openStart = lower.indexOf('<script', offset);
      if (openStart === -1) break;
      const openEnd = lower.indexOf('>', openStart + '<script'.length);
      if (openEnd === -1) break;
      const closeStart = lower.indexOf('</script', openEnd + 1);
      if (closeStart === -1) break;
      const closeEnd = lower.indexOf('>', closeStart + '</script'.length);
      const block = content.slice(openEnd + 1, closeStart);
      if (block) blocks.push(block);
      offset = closeEnd === -1 ? closeStart + '</script'.length : closeEnd + 1;
    }
    return blocks.join('\n');
  }
  return content;
}

function scriptKindFor(moduleId: string): ts.ScriptKind {
  if (moduleId.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (moduleId.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (moduleId.endsWith('.js') || moduleId.endsWith('.mjs') || moduleId.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
