# Build Log — Social Media Studio

## AI assistance disclosure

AI assistance was used to interpret the supplied capstone brief, propose the TypeScript domain model, write initial implementations, formulate deterministic test cases, and shape the user interface. The final design deliberately retains simple, explainable mechanics instead of hiding behavior behind an LLM: variant templates are plain code, constraints are plain code, and the publish processor has a narrow interface.

## Review and corrections

The initial content-generation implementation used a Unicode-property regular expression that was incompatible with the project’s TypeScript target. It was replaced with a target-compatible hashtag expression and then checked with `pnpm check`.

The first all-suite test run exposed a timing issue in the Telegram credential verification request. The check was corrected by adding a bounded request timeout and an explicit test allowance, then rerun successfully. That test only validates a configured token with Telegram’s lightweight `getMe` endpoint; it does not publish content.

An early preview capture showed a temporary loading state while the development bundle had just reloaded. A follow-up capture rendered the actual authenticated workspace. The verification notes preserve that observation rather than presenting the first capture as a successful UI review.

## Human-owned decisions

The user’s brief determined the core product scope: X, LinkedIn, and Telegram variants; deterministic templates; a review workflow; durable scheduling; idempotency; and an International Typographic Style interface. The implementation explicitly excludes out-of-scope image generation, analytics, real X/LinkedIn publication, fake social proof, and stretch goals.

## Remaining manual setup

The real Telegram delivery path requires the owner to provide their own BotFather token and owned chat/channel identifier. Automatic recurring processing must be activated from the published app because hosted schedule callbacks target the production URL. These requirements are documented in `README.md` and are not bypassed with hardcoded or fabricated credentials.
