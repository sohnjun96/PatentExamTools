export type WorkspacePreferences = {
  version: 1;
  view: 'overview' | 'technology' | 'response-analysis' | 'strategy';
  selectedClaim: number;
  selectedRound: string;
  resourceTab: string;
  keywords: string[];
  featureRoles: Record<string, string>;
  scrollPositions: Record<string, number>;
};
export const WORKSPACE_PREFERENCES_PREFIX = 'patent-exam-view-v1:';

export function parseWorkspacePreferences(raw: string | null): WorkspacePreferences | null {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw) as WorkspacePreferences;
    if (value.version !== 1 || !['overview', 'technology', 'response-analysis', 'strategy'].includes(value.view)) return null;
    return {
      version: 1, view: value.view, selectedClaim: Number.isInteger(value.selectedClaim) && value.selectedClaim > 0 ? value.selectedClaim : 1,
      selectedRound: typeof value.selectedRound === 'string' ? value.selectedRound : '', resourceTab: typeof value.resourceTab === 'string' ? value.resourceTab : 'biblio',
      keywords: Array.isArray(value.keywords) ? value.keywords.filter((item): item is string => typeof item === 'string').slice(0, 100) : [],
      featureRoles: value.featureRoles && typeof value.featureRoles === 'object' && !Array.isArray(value.featureRoles) ? Object.fromEntries(Object.entries(value.featureRoles).filter(([key, role]) => /^\d+[A-Z]+$/.test(key) && ['핵심 검색', '조합 검색', '일반 구성', '검색 제외', '확인 필요'].includes(role))) : {},
      scrollPositions: value.scrollPositions && typeof value.scrollPositions === 'object' ? Object.fromEntries(Object.entries(value.scrollPositions).filter(([key, number]) => ['overview', 'technology', 'response-analysis', 'strategy'].includes(key) && Number.isFinite(number) && number >= 0)) : {},
    };
  } catch { return null; }
}
