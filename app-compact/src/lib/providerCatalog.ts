import catalog from '../../../contracts/ai-provider-catalog.json' with { type: 'json' };

type CatalogModel = {
  id: string;
  label: string;
  surfaces: string[];
};

const compactModels = catalog.providers
  .flatMap((provider) => provider.models as CatalogModel[]);

export const COMPACT_AI_MODELS = compactModels
  .filter((model) => model.surfaces.includes('compact'))
  .map((model) => ({ id: model.id, name: model.label }));

// Android shell uses the catalog's 'android' surface (compact set plus android-only
// models such as volcano/kimi-k3).
export const ANDROID_AI_MODELS = compactModels
  .filter((model) => model.surfaces.includes('android'))
  .map((model) => ({ id: model.id, name: model.label }));
