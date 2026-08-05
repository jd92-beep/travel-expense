import catalog from "../../../contracts/ai-provider-catalog.json" with { type: "json" };

export const PROVIDER_MODELS: Record<string, string[]> = Object.fromEntries(
  catalog.providers
    .map((provider) => [
      provider.id,
      provider.models
        .filter((model) => model.surfaces.includes("admin-edge"))
        .map((model) => model.id),
    ])
    .filter(([, models]) => (models as string[]).length),
) as Record<string, string[]>;
