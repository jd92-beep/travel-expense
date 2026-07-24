import catalog from '../../../contracts/ai-provider-catalog.json' with { type: 'json' };

type CatalogModel = {
  id: string;
  label: string;
  surfaces: string[];
};

export const COMPACT_AI_MODELS = catalog.providers
  .flatMap((provider) => provider.models as CatalogModel[])
  .filter((model) => model.surfaces.includes('compact'))
  .map((model) => ({ id: model.id, name: model.label }));
