# Evidence — Social Media Studio

This document maps each capstone Definition of Done item and acceptance probe to a concrete source file, test, or manual run path.

| Requirement or probe | Evidence | Expected result |
| --- | --- | --- |
| Canonical source ingestion | `server/campaigns/ingest.ts`, `campaign.create` | URL or pasted text is normalized and stored in `campaigns.canonicalContent`. Local/private URLs and unreadable sources are refused. |
| Generation reads only stored content | `campaign.generateVariants` in `server/routers.ts` | The mutation reloads the campaign from the database and calls templates with `canonicalContent`; it accepts no variant source text. |
| X, LinkedIn, Telegram constraints | `server/campaigns/constraints.ts` and `generation.ts` | Every deterministic template returns a successful validation snapshot before it is inserted as a draft. |
| Blocked invalid variant | `campaigns.test.ts` — `blocks a rule-breaking variant before review` | A short, promotional, three-hashtag X text fails minimum length, tone, and hashtag validation. |
| Review statuses | `variants.status` enum and `campaign.reviewVariant` | Drafts become approved or rejected; editing revalidates and returns a variant to draft. Published variants cannot be edited or reviewed again. |
| Refused unapproved schedule | `campaigns.test.ts` — `refuses scheduling a variant that is not approved...` | The shared guard throws `TRPCError` with `BAD_REQUEST`; production mutation uses the same guard. |
| SocialPublisher adapter seam | `server/campaigns/types.ts`, `publishers.ts`, `processor.ts` | Processor requires only `SocialPublisher`; it has no Telegram/X/LinkedIn-specific branch. |
| Real publisher plus two mocks | `TelegramPublisher`, `MockPublisher` in `publishers.ts` | Telegram uses Bot API; Mock X and Mock LinkedIn write database previews. |
| Adapter configuration swap | `campaigns.test.ts` — `swaps mock adapters by configuration...` | The same `createPublisher` contract returns either mock adapter with no processor change. |
| Idempotent delivery | `scheduleSlots` unique keys, `mockDeliveries` unique key, `recordMockDelivery` | Repeated mock delivery returns the original reference rather than persisting a second preview. |
| Duplicate publish probe | `campaigns.test.ts` — `uses the stable idempotency key...` | Two calls with one stable key produce one stored preview and one delivery reference. |
| Resumable due processor | `claimDueSlots` and `DueSlotProcessor` | A conditional claim acquires pending or stale-processing work. Failed work returns to pending with an attempt record. |
| Worker restart probe | `campaigns.test.ts` — `resumes an interrupted due slot...` | The first run fails intentionally; the second succeeds and records exactly one successful delivery. |
| Visible history | `publishAttempts` table and History section of `Home.tsx` | Every started, failed, successful, or recovered-duplicate attempt has timestamp, adapter, outcome, reference, and error visibility. |
| Recurring server-side schedule | `server/scheduled.ts`, `server/_core/index.ts`, `scheduler.activate` | Published deployment registers authenticated `/api/scheduled/due-slots`; handler resolves settings by task UID only. |
| Secrets | `.env.example`, `server/telegram.secret.test.ts`, `.gitignore` | Only placeholders are committed. Credential check calls Telegram `getMe` only when a token is configured. |
| Reviewer run steps | `README.md` | README provides `pnpm dev`, an explicit seed path, test commands, and scheduler setup. |

## Latest automated execution

The deterministic campaign suite, existing authentication test, and Telegram credential verification completed successfully during the build session:

```text
Test Files  3 passed (3)
Tests       8 passed (8)
```

The visual verification notes in [`verification_notes.md`](./verification_notes.md) record the working authenticated preview and the follow-up needed after workflow data is seeded.
