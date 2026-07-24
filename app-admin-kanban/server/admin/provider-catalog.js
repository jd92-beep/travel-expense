import catalog from '../../../contracts/ai-provider-catalog.json' with { type: 'json' };

const forSurface = (surface) => Object.fromEntries(
  catalog.providers
    .map((provider) => [
      provider.id,
      provider.models
        .filter((model) => model.surfaces.includes(surface))
        .map((model) => model.id),
    ])
    .filter(([, models]) => models.length),
);

export const PROVIDER_MODELS = Object.freeze(forSurface('admin-bff'));
