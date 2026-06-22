import { canSignalFailCi, type ScanResult, type SignalSeverity } from '@archora/core';
import type { ScanDiff } from '@archora/core';
import { buildSignalBaselineView, countBaselineSignals } from '@archora/core';

// `--fail-on` rule forms:
//   grade:<A|B|C|D|F>           - archDebt grade <= letter
//   cycles:<N>                  - scan has > N cycles
//   layer-violations:<N>        - > N layer violations
//   new-cycles:<N>              - diff introduces > N new cycles (requires --base)
//   new-layer-violations:<N>    - diff introduces > N new layer violations (requires --base)
//   new-contract-violations:<N> - diff introduces > N new contract violations (requires --base)
//   recommendations:<N>         - > N total recommendations
//   contract-violations:<N>     - > N architectural contract violations
//   contract-errors:<N>         - > N error-severity contract violations only
//   signals:<severity>          - any CI-safe signal at severity+ (stable/high-confidence by default)
//   new-signals:<severity>      - new CI-safe signals versus --base
//   regressed-signals:<severity> - regressed CI-safe signals versus --base
export interface FailOnRule {
  raw: string;
  evaluate(scan: ScanResult, context: FailOnContext | ScanDiff | null): boolean;
  describe(scan: ScanResult, context: FailOnContext | ScanDiff | null): string;
}

export interface FailOnContext {
  diff: ScanDiff | null;
  baseline: ScanResult | null;
}

const GRADE_RANK: Record<ScanResult['archDebt']['grade'], number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};
const SIGNAL_SEVERITY_RANK: Record<SignalSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function parseFailOn(rule: string): FailOnRule {
  const colon = rule.indexOf(':');
  if (colon === -1) {
    throw new Error(`Invalid --fail-on rule: ${rule}. Expected "<key>:<value>".`);
  }
  const key = rule.slice(0, colon).trim();
  const value = rule.slice(colon + 1).trim();

  switch (key) {
    case 'grade': {
      const target = value.toUpperCase() as ScanResult['archDebt']['grade'];
      if (!(target in GRADE_RANK)) {
        throw new Error(`Invalid grade in --fail-on: ${value}. Expected A/B/C/D/F.`);
      }
      const targetRank = GRADE_RANK[target];
      return {
        raw: rule,
        evaluate: (scan) => GRADE_RANK[scan.archDebt.grade] <= targetRank,
        describe: (scan) => `archDebt grade ${scan.archDebt.grade} ≤ threshold ${target}`,
      };
    }
    case 'cycles': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (scan) => scan.cycles.length > n,
        describe: (scan) => `cycles=${scan.cycles.length} > threshold ${n}`,
      };
    }
    case 'layer-violations': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (scan) => scan.layerViolations.length > n,
        describe: (scan) => `layer violations=${scan.layerViolations.length} > threshold ${n}`,
      };
    }
    case 'recommendations': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (scan) => scan.recommendations.length > n,
        describe: (scan) => `recommendations=${scan.recommendations.length} > threshold ${n}`,
      };
    }
    case 'contract-violations': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (scan) => scan.contractViolations.length > n,
        describe: (scan) =>
          `contract violations=${scan.contractViolations.length} > threshold ${n}`,
      };
    }
    case 'contract-errors': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (scan) =>
          scan.contractViolations.filter((v) => v.severity === 'error').length > n,
        describe: (scan) => {
          const errors = scan.contractViolations.filter((v) => v.severity === 'error').length;
          return `contract errors=${errors} > threshold ${n}`;
        },
      };
    }
    case 'bundle-bloat': {
      const SEV_RANK: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };
      const target = value.toLowerCase() as 'high' | 'medium' | 'low';
      if (!(target in SEV_RANK)) {
        throw new Error(
          `Invalid severity in --fail-on bundle-bloat: ${value}. Expected high/medium/low.`,
        );
      }
      const min = SEV_RANK[target];
      return {
        raw: rule,
        evaluate: (scan) => {
          const issues = scan.bundle?.bloat ?? [];
          return issues.some((b) => SEV_RANK[b.severity] >= min);
        },
        describe: (scan) => {
          const issues = scan.bundle?.bloat ?? [];
          const matched = issues.filter((b) => SEV_RANK[b.severity] >= min).length;
          return (
            `bundle bloat issues at ${target}+ severity = ${matched}` +
            (scan.bundle ? '' : ' (no bundle stats supplied)')
          );
        },
      };
    }
    case 'new-cycles': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (_scan, context) => (contextDiff(context)?.newCycles.length ?? 0) > n,
        describe: (_scan, context) =>
          `new cycles=${contextDiff(context)?.newCycles.length ?? 0} > threshold ${n}` +
          (contextDiff(context) ? '' : ' (no baseline supplied - rule cannot fail)'),
      };
    }
    case 'new-layer-violations': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (_scan, context) => (contextDiff(context)?.newLayerViolations.length ?? 0) > n,
        describe: (_scan, context) =>
          `new layer violations=${contextDiff(context)?.newLayerViolations.length ?? 0} > threshold ${n}` +
          (contextDiff(context) ? '' : ' (no baseline supplied - rule cannot fail)'),
      };
    }
    case 'new-contract-violations': {
      const n = parseIntStrict(value, rule);
      return {
        raw: rule,
        evaluate: (_scan, context) => (contextDiff(context)?.newContractViolations.length ?? 0) > n,
        describe: (_scan, context) =>
          `new contract violations=${contextDiff(context)?.newContractViolations.length ?? 0} > threshold ${n}` +
          (contextDiff(context) ? '' : ' (no baseline supplied - rule cannot fail)'),
      };
    }
    case 'signals': {
      const minSeverity = parseSignalSeverity(value);
      return {
        raw: rule,
        evaluate: (scan) =>
          (scan.signals ?? []).some(
            (signal) =>
              SIGNAL_SEVERITY_RANK[signal.severity] >= SIGNAL_SEVERITY_RANK[minSeverity] &&
              canSignalFailCi(signal, { minSeverity }),
          ),
        describe: (scan) => {
          const matched = (scan.signals ?? []).filter(
            (signal) =>
              SIGNAL_SEVERITY_RANK[signal.severity] >= SIGNAL_SEVERITY_RANK[minSeverity] &&
              canSignalFailCi(signal, { minSeverity }),
          ).length;
          return `CI-safe signals at ${minSeverity}+ severity = ${matched}`;
        },
      };
    }
    case 'new-signals':
    case 'regressed-signals': {
      const minSeverity = parseSignalSeverity(value);
      const kind = key === 'new-signals' ? 'new' : 'regressed';
      return {
        raw: rule,
        evaluate: (scan, context) => {
          const baseline = contextBaseline(context);
          if (!baseline) return false;
          const view = buildSignalBaselineView(baseline, scan);
          return countBaselineSignals(view, kind, minSeverity) > 0;
        },
        describe: (scan, context) => {
          const baseline = contextBaseline(context);
          const count = baseline
            ? countBaselineSignals(buildSignalBaselineView(baseline, scan), kind, minSeverity)
            : 0;
          return (
            `${kind} CI-safe signals at ${minSeverity}+ severity = ${count}` +
            (baseline ? '' : ' (no baseline supplied - rule cannot fail)')
          );
        },
      };
    }
    default:
      throw new Error(`Unknown --fail-on key: ${key}.`);
  }
}

function contextDiff(context: FailOnContext | ScanDiff | null): ScanDiff | null {
  if (!context) return null;
  if ('diff' in context) return context.diff;
  return context;
}

function contextBaseline(context: FailOnContext | ScanDiff | null): ScanResult | null {
  if (!context || !('baseline' in context)) return null;
  return context.baseline;
}

function parseSignalSeverity(value: string): SignalSeverity {
  const severity = value.toLowerCase() as SignalSeverity;
  if (!(severity in SIGNAL_SEVERITY_RANK)) {
    throw new Error(
      `Invalid severity in --fail-on signals: ${value}. Expected critical/high/medium/low/info.`,
    );
  }
  return severity;
}

function parseIntStrict(value: string, rule: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || String(n) !== value) {
    throw new Error(`Invalid integer in --fail-on rule "${rule}": ${value}.`);
  }
  return n;
}
