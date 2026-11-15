# Compact 0.36.2 OpenRouter integration and model comparison

2026-11-15. Broker 2026.11.15.1. Automatic image/text routing uses Ling 3.2 Flash free then DeepSeek V4.1 Flash 1017. Explicit choices remain one attempt. Quota and 429 errors stop the chain. Free routing has zero-price ceilings. DeepSeek has USD 0.30 input / 1.20 output per million-token ceilings and provider fallbacks disabled.

The app currently has no decision-model flow. The requested Perplexity Decider, Decider Flash and JEV order remains conditional on a decision layer becoming necessary. No extra decision calls were introduced.

## Comparison

One synthetic receipt, one short Cantonese itinerary and one two-purchase email per model. Output ceiling 220 tokens, reasoning disabled, concurrency two, no model retries. Each timing is a single network-inclusive observation.

| Model | Receipt seconds / fields | Itinerary seconds / fields | Email seconds / fields | Total tokens | USD cost |
| --- | --- | --- | --- | --- | --- |
| inclusionai/ling-3.2-flash:free | 3.33 / 5/5 | 3.22 / 5/6 | 4.18 / 4/4 | 709 | 0.00000000 |
| deepseek/deepseek-v4.1-flash-1017 | 0.85 / 5/5 | 0.99 / 6/6 | 0.69 / 4/4 | 571 | 0.00009978 |
| qwen/qwen3.7-flash | 2.04 / 5/5 | 2.23 / 6/6 | 1.94 / 4/4 | 772 | 0.00005716 |
| xiaomi/mimo-v2.6-flash | 3.33 / 5/5 | 4.46 / 6/6 | 4.04 / 4/4 | 682 | 0.00013104 |

Ling omitted the explicit 17:00 check-in time. All other scored fields matched. Initial unpinned MiMo vision failed at the Darkbloom endpoint. MiMo was repeated using the same Xiaomi-only route as the app and passed all three cases. Both runs are retained locally.

Recommendations from this small sample are Ling for free default use, DeepSeek for itinerary detail preservation, Qwen3.7 Flash for very cheap image/text extraction, and Xiaomi-pinned MiMo as another multimodal option. Gemma 4 26B A4B free supports images in the current catalog and is an untested alternative.

## Credential evidence

Only the exact newly specified RTF was read. Its sole key was imported directly into the live Worker secret OPENROUTER_API_KEY. The old provider key was not used. Existing Wrangler OAuth was restored with existing scopes, omitting an unsupported legacy scope. A Broker DeepSeek health test with an eight-token ceiling passed in 1.55 seconds. New-key usage increased from USD 0.000377536 to USD 0.000381954 during that isolated test.

App Settings tests passed for Ling and DeepSeek, each capped at eight output tokens. A disposable profile was used with production user-data writes disabled. New-key raw/Base64/escaped/split-literal checks cover tracked files and generated client/Worker output. TruffleHog runs locally with verification disabled. Publication gates also cover staged contents, outgoing Git objects and deployment artifacts. The source RTF remains sensitive local material outside the repository.

## References

- [Live OpenRouter catalog](https://openrouter.ai/api/v1/models)
- [Ling 3.2 Flash free](https://openrouter.ai/inclusionai/ling-3.2-flash:free)
- [DeepSeek models](https://openrouter.ai/deepseek)
- [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
