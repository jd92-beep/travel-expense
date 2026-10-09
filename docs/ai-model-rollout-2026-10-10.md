# AI model rollout and verification — 2026-10-10

Implementation: Compact **0.29.0**, React **0.2.11**, broker **2026.10.10.1**. Boss authorized commit, merge and push on 2026-10-10; the resulting `main` push triggers public-client deployment. Separate manual broker deployment and private provider-key provisioning await explicit approval. No production data was changed.

## Model catalog

Sixteen chat choices were added: ten fixed OpenRouter free models, its dynamic free router, four paid models, and OpenCode Space Bunny Free. Existing direct Kimi, MiMo and Volcano choices are hidden from the Compact picker; their other catalog surfaces remain available. Classification and safety-only endpoints are excluded from general extraction.

| Provider | Native model ID | Cost tier | Photo input | App functions |
| --- | --- | --- | --- | --- |
| openrouter | `apodex/apodex-1.1-mini:free` | Free | No | voice, email, trip-update |
| openrouter | `xiaomi/mimo-v2.6-flash` | Paid | Yes | scan, voice, email, trip-update |
| openrouter | `meta/muse-spark-1.3-contributor` | Paid | Yes | scan, voice, email, trip-update |
| openrouter | `z-ai/glm-5.3-flash` | Paid | Yes | scan, voice, email, trip-update |
| openrouter | `dots-studio/dots-3-note-preview:free` | Free | Yes | scan, voice, email, trip-update |
| openrouter | `liquid/lfm-2.5-2.6b:free` | Free | No | voice, email, trip-update |
| openrouter | `nvidia/nemotron-3.5-lightning:free` | Free | No | voice, email, trip-update |
| openrouter | `qwen/qwen3.7-flash` | Paid | Yes | scan, voice, email, trip-update |
| openrouter | `poolside/laguna-s-2.1:free` | Free | No | voice, email, trip-update |
| openrouter | `cohere/north-mini-code:free` | Free | No | voice, email, trip-update |
| openrouter | `nvidia/nemotron-3-ultra-550b-a55b:free` | Free | No | voice, email, trip-update |
| openrouter | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | Free | Yes | scan, voice, email, trip-update |
| openrouter | `google/gemma-4-26b-a4b-it:free` | Free | Yes | scan, voice, email, trip-update |
| openrouter | `nvidia/nemotron-3-super-120b-a12b:free` | Free | No | voice, email, trip-update |
| openrouter | `openrouter/free` | Free | Yes | scan, voice, email, trip-update |
| opencode | `space-bunny-free` | Free | Yes | scan, voice, email, trip-update |

The voice function first transcribes speech with the browser speech-recognition API; the selected LLM receives text. This rollout does not replace the speech transcriber. `openrouter/free` selects a different compatible free underlying model per request, so its output quality is not a fixed model benchmark. Pi and Hermes expose the input types their native clients support.

## App policy and actual selection

- Automatic photo extraction: Muse Spark Contributor → MiMo-V2.6-Flash.
- Automatic Email, booking, itinerary and voice-text extraction: Nemotron 3 Super → North Mini Code → Apodex 1.1 Mini → paid Qwen3.7 Flash.
- An explicit category selection makes exactly one model attempt. Failure is shown; it does not silently switch models or substitute local extraction. Selecting “自動（預設及後備）” enables the chains above.
- 429, rate-limit, daily-limit and quota failures stop immediately. Fixed free requests have a zero-price ceiling, and OpenRouter provider fallbacks are disabled. Paid routes pin the validated first-party providers: Meta, Xiaomi, Alibaba and Z.ai.
- Providers start collapsed, with accessible +/− expansion and radio choices. Photo choices include only image-capable models. Selection and translation language persist through local state, Supabase settings and Notion metadata.
- Tests use exactly the selected provider/model with `kind=test`, maximum eight output tokens and no fallback. A health success proves reachability, not accurate extraction. Manual catalog scanning makes one call per model with 3.1-second spacing and stops on quota; untested models are not reported as available.

## Extraction and translation changes

Receipt prompts now include the supplied source text, an actual valid JSON skeleton and source-evidence rules. They distinguish line total from unit price, tax from products, final total from tender/change or suggested tips, booking reference from receipt serial, booking date from email sent date, and active booking from cancelled/forwarded copies. Duplicate purchased rows are retained. Missing dates, times and payment methods remain unknown; missing dates require correction before saving. USD cents and each record’s actual currency are retained.

If photo extraction fails, the manual recovery draft retains the photo and error notice but leaves merchant, date and payment unknown and the amount zero. A filename containing dates or numbers cannot become expense evidence.

Six output languages are supported: Hong Kong Cantonese, Traditional Chinese, Simplified Chinese, English, Japanese and Korean. Foreign merchant, address, place and product names retain the original with a translation alongside; notes use the selected language. The broker also receives the language and places it in the system instruction. Chinese targets request Traditional characters where appropriate. Item text is rendered from structured line items, preventing quantity placeholders and hard-coded yen.

Itinerary prompts require local dates/times, IANA zones and country currencies; KTX is transport, unknown times/addresses stay blank, and explicit booking references and prices are preserved. Strict JSON and useful-result validation remain active. Automatic local preview remains labelled as a local result after all AI attempts fail; explicit selections cannot take that path.

## Free text evaluation

These are task fixtures, not an intelligence benchmark. Four models were tested on the same Japanese hotel email, Korean two-passenger KTX booking and three-country itinerary. Core receipt marks below compare **total, date, time, currency, payment, category and bookingRef** with saved ground truth. Extra records, item rows, translation and itinerary mistakes are reported separately rather than hidden by the score.

| Model | Hotel core / 7 | KTX core / 7 | Material result from the final four-model comparison |
| --- | --- | --- | --- |
| Nemotron 3 Super | 7 | 7 | Best core extraction and itinerary evidence. Non-reasoning booking initially omitted one passenger in structured item rows; names were incompletely translated. |
| North Mini Code | 6 | 7 | Hotel check-in time missing. KTX item total and quantity correct. Itinerary inserted a hotel event at an unsupported 12:00; some names not translated. |
| Apodex 1.1 Mini | 7, plus incorrect extra record | 0 | Included cancelled OLD7 as a second expense despite its cancellation note; returned an empty array for KTX. Itinerary translated more names but omitted the price and structured KTX reference. |
| Nemotron 3.5 Lightning | 7, but wrong merchant | 6 | Used HANA8 as merchant, classified KTX as flight, copied foreign notes, and added an extra empty itinerary day. |

North ranks ahead of Apodex for the fallback sequence because losing a booking or importing a cancelled expense is more serious than a missing check-in time. None of these models warrants a claim of perfect accuracy.

### Prompt iterations and reasoning experiment

- First round: 12 requests; all four itinerary replies were malformed JSON. These failures remain recorded.
- Valid itinerary-skeleton round: 4 requests; Nemotron and Lightning returned strict JSON, Apodex and North still failed the initial skeleton task.
- Final actual-broker comparison: 12 requests; all endpoints returned parsed JSON, with the semantic defects above. This is the common basis for ranking.
- Broker system-language check: 3 Nemotron requests; language-only strengthening did not fix all name translation or item rows.
- Low-reasoning check: 3 Nemotron requests. Hotel names/addresses translated, and KTX returned two KRW59,800 rows matching KRW119,600. The itinerary produced an unusable malformed-key object. Production therefore enables low reasoning for Nemotron Email/voice only; itinerary keeps the validated non-reasoning mode.

Reasoning can improve source reasoning but costs time/tokens: those three checks took 14.65 / 22.81 / 27.82 seconds and used 3,219 / 4,340 / 5,955 total tokens, all at zero cost. Hotel line items were empty in that check, so user review remains necessary.

### Final comparison: measured API time and usage

| Task | Model | HTTP | Seconds | Input tokens | Output tokens | USD cost |
| --- | --- | --- | --- | --- | --- | --- |
| email | `apodex/apodex-1.1-mini:free` | 200 | 2.803 | 1357 | 391 | 0.0000000000 |
| email | `cohere/north-mini-code:free` | 200 | 3.203 | 1268 | 195 | 0.0000000000 |
| email | `nvidia/nemotron-3-super-120b-a12b:free` | 200 | 2.756 | 1449 | 220 | 0.0000000000 |
| email | `nvidia/nemotron-3.5-lightning:free` | 200 | 7.931 | 1449 | 225 | 0.0000000000 |
| booking | `apodex/apodex-1.1-mini:free` | 200 | 1.111 | 1330 | 2 | 0.0000000000 |
| booking | `cohere/north-mini-code:free` | 200 | 2.466 | 1242 | 177 | 0.0000000000 |
| booking | `nvidia/nemotron-3-super-120b-a12b:free` | 200 | 1.768 | 1407 | 211 | 0.0000000000 |
| booking | `nvidia/nemotron-3.5-lightning:free` | 200 | 9.135 | 1407 | 285 | 0.0000000000 |
| itinerary | `apodex/apodex-1.1-mini:free` | 200 | 5.463 | 1587 | 889 | 0.0000000000 |
| itinerary | `cohere/north-mini-code:free` | 200 | 4.947 | 1488 | 588 | 0.0000000000 |
| itinerary | `nvidia/nemotron-3-super-120b-a12b:free` | 200 | 8.796 | 1736 | 858 | 0.0000000000 |
| itinerary | `nvidia/nemotron-3.5-lightning:free` | 200 | 17.741 | 1736 | 756 | 0.0000000000 |

## Real photo verification with the revised app prompts

The actual local broker called OpenRouter using the saved public receipt photos. Broker auth and KV were disposable fixtures; inference was real. No production user account or database was involved.

| Receipt / model | HTTP | Seconds | Input tokens | Output tokens | USD cost |
| --- | --- | --- | --- | --- | --- |
| muse-jp | 200 | 16.607 | 4819 | 1478 | 0.0007775000 |
| muse-kr | 200 | 17.398 | 4946 | 1316 | 0.0006714620 |
| muse-us | 200 | 16.452 | 1322 | 2135 | 0.0005592000 |
| muse-cn | 200 | 21.368 | 1141 | 3081 | 0.0007303000 |
| mimo-jp | 200 | 8.363 | 3852 | 339 | 0.0006342000 |
| mimo-us | 200 | 7.296 | 1238 | 374 | 0.0001551088 |

Six paid photo requests cost **US$0.0035277708** in total, using 17,318 input tokens and 8,723 output tokens. Their measured inference latency total was 87.484 seconds. API-reported cost is used, including caching/provider pricing; it is not recomputed from a headline price.

- Japan: Muse and MiMo retained JPY711, explicit cash evidence and three item amounts. Missing date/time stayed blank; Muse used 年輪蛋糕 for バウムクーヘン.
- Korea: Muse retained KRW122,000, 2023-04-09 20:21 and three line totals/quantities. No unsupported payment method was invented.
- USA: Muse and MiMo retained USD79.29, 2025-07-23 13:20, the printed tax/fees and the actual item rows, without adding suggested tips. Unknown payment stayed blank; wine GL was a glass.
- China: Muse retained CNY148, duplicated cola rows and the two-rice line total. Missing date stayed blank. Some Simplified display characters remained; the later system-language instruction was tested on text, not by buying another full photo round.

The earlier paid comparison also covered Qwen3.7 Flash and GLM5.3 Flash across all four countries; its 28 requests cost US$0.0107386972. This rollout reuses those results and does not claim a new four-model photo comparison. The new broker fixture verifies each paid route/pin and the Muse mandatory-reasoning request shape.

Public image provenance (local SHA256 recorded with the original fixtures):
- [Japan receipt source](https://note.com/invinciblehound/n/n13b89a367387)
- [South Korea receipt source](https://everybaba.tistory.com/entry/미쉐린-가이드-서울-평양냉면-맛집-을지로-우래옥-불고기도-맛있네요)
- [USA receipt source](https://tabelog.com/hawaii/A6001/A600101/60000170/dtlrvwlst/B511129390/)
- [China receipt source](https://lin150666.pixnet.net/blog/posts/11403053284)

## Native agent configuration and preserved defaults

| Surface | Official configuration | Verification | Preserved default / fallback |
| --- | --- | --- | --- |
| Pi | Native `models.json`, existing private `auth.json`; OpenRouter compatibility and per-model routing metadata | 16 model/auth entries loaded; native SDK Nemotron and Space Bunny inference passed. Muse/GLM mandatory thinking maps off/minimal to low. | `openai-codex/gpt-6-luna`; settings not changed |
| HERO + Hermes Desktop primary connection | Native `config.yaml providers`, `key_env`, model metadata and `extra_body`; private `.env` | Native picker payload has 7 distinct provider groups and 16 models; resolver and two real SDK calls passed. Desktop GUI click path unavailable. | Weixin Deepseek-v4-flash; hero-volcengine/glm-5.3-flash |
| Oreo Hermes | Same official provider/config pattern on the named remote Hermes home | Remote native picker has 7 groups; Nemotron and Space Bunny real inference passed; gateway service remains active. | Weixin Deepseek-v4-flash; xai-oauth/grok-4.6, kimi-coding/k3 |
| Tommy OpenClaw | Native `models.providers`, per-model aliases/params plus current `agents.defaults.modelPolicy.allow`; env references | Config validation passed; live Gateway catalog lists all 16 additions available. Native inference remains unverified because workspace-plugin runtime publication timed out; details below. | Weixin Deepseek-v4-flash; xai/grok-4.6, kimi/k3 |

Hermes groups identical endpoint/key/API routes during inventory. Unique official `X-OpenRouter-Title` attribution headers keep the free, paid and dynamic-router policy groups distinct, preventing paid models from inheriting a free zero-price policy. Both Hermes homes use the official `catalog_provider` and `supports_vision` fields; all 16 capability overrides were checked through the native resolver. Muse and GLM receive mandatory low reasoning through each client's native configuration, without changing the agents' general reasoning defaults.

Tommy's official Gateway inference attempt returned a 120-second client timeout, then the server recorded `prepared model runtime publication (workspace plugins; agent main) timed out` after about 333 seconds. Further local and isolated native attempts also timed out before a confirmed response. The OpenCode attempt's upstream completion and token usage are unknown. These are not successful inference tests, nor evidence that the API key or models were rejected. Final readiness was HTTP 200 with `ready: true`, no failing checks and no degraded event-loop flag. Repairing unrelated workspace-plugin discovery is outside this model-catalog change.

No runtime source patches or new dependencies were introduced. No channel messages, bot replies, service restarts or default-model changes were requested by the verification helpers; OpenClaw applied its own config reload. Existing private backups precede configuration edits. Pi settings and the local HERO/Tommy defaults/fallbacks were checked against the originals; Oreo's configuration merge preserved its existing defaults/fallbacks.

## Checks and boundaries

- Compact and React: typecheck, build and secret scans passed; React changes are limited to compatible unknown-payment and language transport.
- Broker: syntax checks and disposable self-test passed, including nested IDs, image capabilities, provider pins, zero-price policy, selected language, mandatory reasoning and quota hard stops.
- Mobile AI routing: eight tests passed, including blank manual recovery after photo failure; scan workflow passed; settings suite previously passed 10 with one existing skip.
- Shared provider catalog and canonical-ledger checks passed. React/Compact shared-state smoke passed, including unknown payment and selected language.
- The mobile provider layout was viewed at 390×844; provider toggles/radios meet the existing touch targets.
- Local itinerary parser tests passed. No live database migration, production user-data mutation, Telegram delivery or full agent tool-use loop was performed.

Local diagnostic JSON and fixtures remain private under the task’s Pi checks folder; they are not committed. The initial free malformed-JSON attempts and reasoning failure remain available. The free fixture rounds made 34 requests; their API cost was zero. The nine real-broker checks added three free text requests and six paid photos. Native agent smoke calls are recorded separately.

Muse Spark **Contributor** permits use of prompts and completions to train future Meta models, as documented in [Meta's Contributor-tier terms](https://dev.meta.ai/docs/pricing-rate-limits). It requires the account age confirmation completed by Boss. The configured automatic image policy uses the explicitly requested Contributor model; receipts still need user review, particularly translations, quantities and absent dates.

## Official references

- [Pi model configuration and selection](https://pi.dev/docs/latest/models)
- [Hermes configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration/)
- [Hermes named providers and official model metadata](https://hermes-agent.nousresearch.com/docs/integrations/providers)
- [OpenClaw OpenRouter provider and per-model routing](https://docs.openclaw.ai/providers/openrouter)
- [OpenRouter application attribution headers](https://openrouter.ai/docs/app-attribution)
- [OpenRouter credit and rate limits](https://openrouter.ai/docs/api_reference/limits)
- [Muse Spark Contributor model](https://openrouter.ai/meta/muse-spark-1.3-contributor)
- [Meta Contributor pricing and data use](https://dev.meta.ai/docs/pricing-rate-limits)
- [OpenCode Zen](https://opencode.ai/docs/zen/)

Git delivery is authorized under the repository AGENTS instruction. Required release verification: confirm the intended source SHA and public-client deployment, then confirm the separately approved broker deployment/key provisioning and live selected-model path before declaring the entire AI rollout live. A Pages build alone does not deploy the Worker or provision provider keys. The Worker deploy dry-run passed before the broker approval question was issued.
