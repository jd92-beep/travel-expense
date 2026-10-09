import catalog from '../../../contracts/ai-provider-catalog.json' with { type: 'json' };

type CatalogModel = {
  id: string;
  label: string;
  surfaces: string[];
  tasks: string[];
};

export const COMPACT_AI_MODELS = catalog.providers
  .flatMap((provider) => (provider.models as CatalogModel[]).map(model => ({ ...model, providerId: provider.id, providerName: provider.label })))
  .filter((model) => model.surfaces.includes('compact'))
  .map((model) => ({ id: model.id, name: model.label, providerId: model.providerId, providerName: model.providerName, tasks: model.tasks }));

// Every contract-catalog model id (any surface). The Settings picker only offers
// COMPACT_AI_MODELS, but routing must also accept broker-surface ids that stale or
// shared state may carry (e.g. kimi/kimi-code) while rejecting non-catalog garbage.
export const ALL_CATALOG_AI_MODEL_IDS: readonly string[] = catalog.providers
  .flatMap((provider) => provider.models as CatalogModel[])
  .map((model) => model.id);

/**
 * Resolve a user-selected model id to a contract catalog id.
 * Accepts the full `provider/model` id or a unique bare model name (legacy state).
 * Returns null for anything outside the catalog — callers must not route those.
 */
export function resolveCatalogAiModelId(id: string): string | null {
  const chosen = String(id || '').trim();
  if (!chosen) return null;
  if (ALL_CATALOG_AI_MODEL_IDS.includes(chosen)) return chosen;
  const matches = ALL_CATALOG_AI_MODEL_IDS.filter((mid) => mid.endsWith(`/${chosen}`));
  return matches.length === 1 ? matches[0] : null;
}
