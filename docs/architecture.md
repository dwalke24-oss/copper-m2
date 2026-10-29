# Architecture

How the Copper State Labs app fits together. Each module adds a section at the
end (see [Adding a module](#adding-a-module)) when it changes how the app
works: new pages, tables or AI calls.

_Fictional — for educational use._

## The starter app (Module 0)

A Next.js app that builds, runs and deploys with **no environment variables**.
A Google AI Studio key is optional until a module needs one.

| Piece | Where | What it does |
|---|---|---|
| Pages | `app/` | `layout.tsx` sets the fonts and theme; `page.tsx` is the placeholder home page |
| Brand components | `components/copper/` | `Logo`, `SiteHeader`, `SiteFooter`, `ModeToggle` |
| UI kit | `components/ui/` (shadcn), `components/ai-elements/` (AI Elements) | The only UI libraries the app uses |
| Setup card | `components/setup-required.tsx` | `<SetupRequired service="ai" />`, shown instead of a page whose service isn't configured |
| Company catalog | `lib/copper/catalog.ts`, `lib/copper/data/catalog.json` | Product, plan and privacy facts from the Product Bible (Sections 3, 4, 8 and 10). Pages read prices and plan details from here instead of typing them (added in the Module 1 starter) |
| AI wrapper | `lib/ai/call.ts` | `callText` and `callObject`: every model call goes through these and is logged to the terminal |
| Models and prices | `lib/ai/models.ts`, `lib/ai/pricing.ts` | The approved Gemini models and their token prices |
| Module checks | `specs/module-N/`, `scripts/check.mjs` | Each module's spec, instructions, rubric and acceptance tests; `npm run check` runs them |

## Data flow

1. A user opens a page in `app/`.
2. Server code checks what's configured (`isAiConfigured()`). If the key is
   missing, the page renders `<SetupRequired />` instead of crashing.
3. Data comes from files under `lib/copper/data/`, except where a module has
   moved it to a database: Module 2 part 2 moves stock to a Supabase
   `inventory` table, read through `lib/copper/inventory.ts`. Facts that don't
   change daily (prices, colors) stay in the files.
4. AI requests go through `callText` / `callObject` in `lib/ai/call.ts`, which
   calls Google and then prints one `[ai_calls]` line: `module`, `feature`,
   `model`, tokens, `cost_usd`, `latency_ms`, `ok`.

```ts
const { text } = await callText(
  { module: 2, feature: "ask-copper" },
  { prompt },
);
```

## Two kinds of "AI tiers"

Don't mix these up:

- **Copper State Labs' product tiers** (On-device, Raw Ore, Refined, the
  Copper Cloud) are part of the fictional company. They are facts in the
  [Product Bible](copper-state-labs/product-bible.md) and rows in the `ai_tiers`
  table.
- **The models this app calls** are real Claude models listed in
  `lib/ai/models.ts`. Their cost is logged in `ai_calls`.

## Decisions

- **No environment variables required.** Every service is optional, so a fresh
  clone builds and deploys before any accounts are set up.
- **One AI wrapper.** Routing every call through `lib/ai/call.ts` gives one
  place to log cost and latency per module and feature.
- **No authentication or row-level security yet.** They arrive in a later
  module.

## Adding a module

When a module changes how the app fits together, add a section here:

```md
## Module N: <feature name>

**Summary:** one or two sentences: what this adds and why.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/...` | |
| Components | `components/...` | |
| Data | `lib/copper/data/...` | Data files added |
| AI calls | `lib/ai/call.ts` (module, feature) | Model, prompt purpose, expected cost per call |

**Data flow:** user action → page → server code → database / model → response.

**Decisions and trade-offs:** what you chose, the alternatives, and why.

**Risks and open questions:** cost, privacy, accuracy or safety risks, and how
you handle them.
```

## Module 2: Ask Copper

**Summary:** A floating chat panel that answers price, cost and stock
questions by calling four read-only tools instead of guessing, and shows each
step (thinking, tool calls, reply) as it streams in.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/page.tsx` | Mounts `<AskCopper />` and passes `isAiConfigured()` down. No new pages or routes |
| Components | `components/copper/ask-copper.tsx`, `components/copper/ask-copper-answer.tsx` | The launcher, the panel with its two chats (tools on and off), and each answer drawn as stations on a rail with a card per tool call |
| Tools | `lib/copper/assistant/tools.ts` | `get_products`, `get_prices`, `calculate_cost`, `check_availability`, each with a zod input contract. Prices come from the catalog; stock comes from `readInventory()` on every call |
| Instructions | `lib/copper/assistant/instructions.ts` | `COPPER_INSTRUCTIONS`, sent only when tools are on |
| Server Action | `lib/copper/assistant/ask.ts` | `askCopper({ messages, useTools })` returns a live `Progress` right away and fills it from the model's stream |
| Data | `lib/copper/data/inventory.json` | The stock list, read through `lib/copper/inventory.ts` |
| AI calls | `callStream` (module 2, `ask-copper`) | The default Gemini model, with thought summaries and up to 5 steps. Roughly $0.002–$0.005 per question with tools (two model steps, about 1,024 thinking tokens) |

**Data flow:** shopper asks a question → `AskCopper` sends that chat's history
to `askCopper()` → `callStream` → the model calls tools, which read the
catalog and stock list → each stream part updates the `Progress` → the panel
redraws from every update.

**Decisions and trade-offs:**
- Tools on and off are separate chats, so the tools-off model can't copy an
  answer the tools worked out.
- With tools off, no instructions are sent at all: telling a model to use tools
  it doesn't have makes it return nothing.
- Each update is a fresh copy of the whole `Progress`, so a missed or held
  update never goes stale.
- The answer renders markdown with `Streamdown` (the renderer under AI
  Elements' `MessageResponse`) without its Mermaid, KaTeX and code plugins,
  which are heavy and not needed for short shopping answers.

**Risks and open questions:** the tools only read, so the model can't change
anything. The tools-off chat can and does invent prices; it is labeled
"Answered without tools: may be made up". If stock can't be read, Copper says
so rather than reporting a stock level.
