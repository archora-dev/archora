import { computed, type ComputedRef } from 'vue';
import { useScanStore } from '@/entities/scan';
import { useHistoryStore } from '@/entities/history';
import { useFindingTriageStore } from '@/entities/finding-triage';
import { useCockpitViewStore } from '@/features/cockpit-view';
import {
  deriveCockpitFindings,
  type CockpitFindingsResult,
} from '@/features/cockpit-view/model/deriveCockpitFindings';

export function useCockpit(): {
  result: ComputedRef<CockpitFindingsResult | null>;
  view: ReturnType<typeof useCockpitViewStore>;
} {
  const scan = useScanStore();
  const history = useHistoryStore();
  const triage = useFindingTriageStore();
  const view = useCockpitViewStore();

  const result = computed<CockpitFindingsResult | null>(() => {
    const current = scan.result;
    if (!current) return null;
    const projectId = current.project.id;
    const baselineAt = history.baselineFor(projectId);
    const baselineScan = baselineAt
      ? (history.forProject(projectId).find((s) => s.scannedAt === baselineAt)?.scan ?? null)
      : null;
    // Touch the project's triage map so the computed re-runs on any triage change.
    const triageMap = triage.forProject(projectId);
    return deriveCockpitFindings({
      scan: current,
      baselineScan,
      lens: view.lens,
      filter: view.filter,
      triage: (findingId) => triageMap[findingId]?.state ?? 'active',
      showTriaged: view.showTriaged,
    });
  });

  return { result, view };
}
