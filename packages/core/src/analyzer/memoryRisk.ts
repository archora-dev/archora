import ts from 'typescript';
import type { FileSource } from './fileSource';
import type { DetectedFramework, MemoryRiskFinding, MemoryRiskKind, ModuleNode } from './types';

export interface DetectMemoryRisksInput {
  source: FileSource;
  modules: readonly ModuleNode[];
  framework: DetectedFramework;
}

interface RiskPattern {
  kind: MemoryRiskKind;
  acquire: string;
  cleanup: string;
  testAcquire(node: ts.Node): boolean;
  testCleanup(node: ts.Node): boolean;
}

interface RiskContext {
  module: ModuleNode;
  framework: DetectedFramework;
  sourceFile: ts.SourceFile;
}

const PATTERNS: readonly RiskPattern[] = [
  {
    kind: 'event-listener-cleanup',
    acquire: 'addEventListener',
    cleanup: 'removeEventListener',
    testAcquire: isNamedCall('addEventListener'),
    testCleanup: isNamedCall('removeEventListener'),
  },
  {
    kind: 'timer-cleanup',
    acquire: 'setInterval',
    cleanup: 'clearInterval',
    testAcquire: isNamedCall('setInterval'),
    testCleanup: isNamedCall('clearInterval'),
  },
  {
    kind: 'timer-cleanup',
    acquire: 'setTimeout',
    cleanup: 'clearTimeout',
    testAcquire: isCapturedTimer('setTimeout'),
    testCleanup: isNamedCall('clearTimeout'),
  },
  {
    kind: 'observer-cleanup',
    acquire: 'observer',
    cleanup: 'disconnect',
    testAcquire: isObserverCreation,
    testCleanup: isNamedCall('disconnect'),
  },
  {
    kind: 'object-url-cleanup',
    acquire: 'createObjectURL',
    cleanup: 'revokeObjectURL',
    testAcquire: isNamedCall('createObjectURL'),
    testCleanup: isNamedCall('revokeObjectURL'),
  },
  {
    kind: 'subscription-cleanup',
    acquire: 'subscribe',
    cleanup: 'unsubscribe or stop handle',
    testAcquire: isNamedCall('subscribe'),
    testCleanup: isSubscriptionCleanup,
  },
];

export async function detectMemoryRisks(
  input: DetectMemoryRisksInput,
): Promise<MemoryRiskFinding[]> {
  const findings: MemoryRiskFinding[] = [];
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
      // Parent links are needed to tell a captured `setTimeout` handle from a
      // discarded fire-and-forget call (see isCapturedResult).
      true,
      scriptKindFor(module.id),
    );
    const context: RiskContext = {
      module,
      framework: input.framework,
      sourceFile,
    };
    findings.push(...detectInModule(context));
  }
  return dedupeFindings(findings);
}

function detectInModule(context: RiskContext): MemoryRiskFinding[] {
  if (context.framework === 'react' || context.framework === 'next') {
    return detectReactRisks(context);
  }
  if (context.framework === 'vue' || context.framework === 'nuxt') {
    return detectVueRisks(context);
  }
  if (context.framework === 'svelte') return detectSvelteRisks(context);
  return detectGenericRisks(context);
}

function detectReactRisks(context: RiskContext): MemoryRiskFinding[] {
  const findings: MemoryRiskFinding[] = [];
  visit(context.sourceFile, (node) => {
    if (!ts.isCallExpression(node) || !isIdentifierCall(node, 'useEffect')) return;
    const callback = node.arguments[0];
    if (!callback || !isFunctionLike(callback)) return;
    const body = callback.body;
    if (!ts.isBlock(body)) return;
    const cleanup = returnedCleanup(body);
    findings.push(...findMissingCleanup(context, body, cleanup, 'high'));
  });
  return findings;
}

function detectVueRisks(context: RiskContext): MemoryRiskFinding[] {
  const findings: MemoryRiskFinding[] = [];
  const unmountedCleanups = collectLifecycleCleanups(context.sourceFile, 'onUnmounted');
  visit(context.sourceFile, (node) => {
    if (!ts.isCallExpression(node) || !isIdentifierCall(node, 'onMounted')) return;
    const callback = node.arguments[0];
    if (!callback || !isFunctionLike(callback)) return;
    const body = callback.body;
    if (!ts.isBlock(body)) return;
    findings.push(...findMissingCleanupInAny(context, body, unmountedCleanups, 'high'));
  });
  return findings;
}

function detectSvelteRisks(context: RiskContext): MemoryRiskFinding[] {
  const findings: MemoryRiskFinding[] = [];
  visit(context.sourceFile, (node) => {
    if (!ts.isCallExpression(node) || !isIdentifierCall(node, 'onMount')) return;
    const callback = node.arguments[0];
    if (!callback || !isFunctionLike(callback)) return;
    const body = callback.body;
    if (!ts.isBlock(body)) return;
    const cleanup = returnedCleanup(body);
    findings.push(...findMissingCleanup(context, body, cleanup, 'high'));
  });
  return findings;
}

function detectGenericRisks(context: RiskContext): MemoryRiskFinding[] {
  return findMissingCleanup(context, context.sourceFile, context.sourceFile, 'medium');
}

function findMissingCleanup(
  context: RiskContext,
  acquireRoot: ts.Node,
  cleanupRoot: ts.Node | undefined,
  confidence: MemoryRiskFinding['confidence'],
): MemoryRiskFinding[] {
  const findings: MemoryRiskFinding[] = [];
  for (const pattern of PATTERNS) {
    const acquire = findFirst(acquireRoot, pattern.testAcquire);
    if (!acquire) continue;
    const hasCleanup = cleanupRoot ? hasNode(cleanupRoot, pattern.testCleanup) : false;
    if (hasCleanup) continue;
    findings.push(buildFinding(context, pattern, acquire, confidence));
  }
  return findings;
}

function findMissingCleanupInAny(
  context: RiskContext,
  acquireRoot: ts.Node,
  cleanupRoots: readonly ts.Node[],
  confidence: MemoryRiskFinding['confidence'],
): MemoryRiskFinding[] {
  const findings: MemoryRiskFinding[] = [];
  for (const pattern of PATTERNS) {
    const acquire = findFirst(acquireRoot, pattern.testAcquire);
    if (!acquire) continue;
    const hasCleanup = cleanupRoots.some((root) => hasNode(root, pattern.testCleanup));
    if (hasCleanup) continue;
    findings.push(buildFinding(context, pattern, acquire, confidence));
  }
  return findings;
}

function buildFinding(
  context: RiskContext,
  pattern: RiskPattern,
  node: ts.Node,
  confidence: MemoryRiskFinding['confidence'],
): MemoryRiskFinding {
  const line =
    context.sourceFile.getLineAndCharacterOfPosition(node.getStart(context.sourceFile)).line + 1;
  return {
    id: `memory:${pattern.kind}:${context.module.id}:${line}`,
    kind: pattern.kind,
    moduleId: context.module.id,
    framework: context.framework,
    severity: 'medium',
    confidence,
    evidence: [
      {
        message: `${pattern.acquire} has no visible ${pattern.cleanup} cleanup`,
        line,
        acquire: pattern.acquire,
        expectedCleanup: pattern.cleanup,
      },
    ],
    remediation: remediationFor(pattern.kind),
  };
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

function findFirst(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  let found: ts.Node | undefined;
  visit(root, (node) => {
    if (!found && predicate(node)) found = node;
  });
  return found;
}

function hasNode(root: ts.Node, predicate: (node: ts.Node) => boolean): boolean {
  return findFirst(root, predicate) !== undefined;
}

function isFunctionLike(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function isNamedCall(name: string): (node: ts.Node) => boolean {
  return (node) => ts.isCallExpression(node) && callName(node.expression) === name;
}

// A bare `setTimeout(fn, n)` expression statement is fire-and-forget and needs no
// cleanup. Flag only when the timer id is captured (assigned, stored on a property,
// returned, or passed on), since a kept handle signals the author intended it to be
// cancellable and leaving it uncleared is the suspicious case.
function isCapturedTimer(name: string): (node: ts.Node) => boolean {
  const matchesCall = isNamedCall(name);
  return (node) => matchesCall(node) && isCapturedResult(node);
}

function isCapturedResult(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isVariableDeclaration(parent)) return parent.initializer === node;
  if (ts.isPropertyDeclaration(parent)) return parent.initializer === node;
  if (ts.isPropertyAssignment(parent)) return parent.initializer === node;
  if (ts.isBinaryExpression(parent)) {
    return parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === node;
  }
  if (ts.isReturnStatement(parent)) return parent.expression === node;
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    return parent.arguments?.some((arg) => arg === node) ?? false;
  }
  // Parenthesized / as-expression wrappers keep the handle reachable.
  if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent)) {
    return isCapturedResult(parent);
  }
  return false;
}

function isIdentifierCall(node: ts.CallExpression, name: string): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === name;
}

function isObserverCreation(node: ts.Node): boolean {
  if (!ts.isNewExpression(node)) return false;
  if (!ts.isIdentifier(node.expression)) return false;
  return ['IntersectionObserver', 'MutationObserver', 'ResizeObserver'].includes(
    node.expression.text,
  );
}

function isSubscriptionCleanup(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const name = callName(node.expression);
  return name === 'unsubscribe' || name === 'stop';
}

function callName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function remediationFor(kind: MemoryRiskKind): string {
  switch (kind) {
    case 'event-listener-cleanup':
      return 'Remove the listener from the matching component teardown lifecycle.';
    case 'timer-cleanup':
      return 'Keep the timer handle and clear it during teardown.';
    case 'observer-cleanup':
      return 'Disconnect the observer during teardown.';
    case 'object-url-cleanup':
      return 'Revoke created object URLs after the preview or download is no longer needed.';
    case 'subscription-cleanup':
      return 'Store the unsubscribe handle and call it during teardown.';
  }
}

function dedupeFindings(findings: readonly MemoryRiskFinding[]): MemoryRiskFinding[] {
  const seen = new Set<string>();
  const out: MemoryRiskFinding[] = [];
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
