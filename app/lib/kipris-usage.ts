export type KiprisUsageSnapshot = {
  total: number;
  startedAt: string;
  lastCalledAt: string | null;
  byOperation: Record<string, number>;
};

const runtime = globalThis as typeof globalThis & {
  __kiprisApiUsage?: KiprisUsageSnapshot;
};

function usageState(): KiprisUsageSnapshot {
  if (!runtime.__kiprisApiUsage) {
    runtime.__kiprisApiUsage = {
      total: 0,
      startedAt: new Date().toISOString(),
      lastCalledAt: null,
      byOperation: {},
    };
  }
  return runtime.__kiprisApiUsage;
}

export function recordKiprisApiCall(operation: string) {
  const state = usageState();
  state.total += 1;
  state.lastCalledAt = new Date().toISOString();
  state.byOperation[operation] = (state.byOperation[operation] ?? 0) + 1;
}

export function getKiprisApiUsage(): KiprisUsageSnapshot {
  const state = usageState();
  return {
    total: state.total,
    startedAt: state.startedAt,
    lastCalledAt: state.lastCalledAt,
    byOperation: { ...state.byOperation },
  };
}
