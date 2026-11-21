# Quórum

Consolidates the budgets of six group companies into one currency without manual capture, and keeps
every figure traceable to the cell it came from. Built for the Open2 Build & Pitch hackathon,
Accounting track. The spec is in `docs/handoff/PULSEGROUP_HANDOFF.md`.

## Run

```bash
nvm use            # Node 24
pnpm install
pnpm dev           # http://localhost:3000 → /load
pnpm test          # engine tests against the EMP budgets in data/
pnpm run lint
pnpm data          # regenerate the practice dataset (docs/seed.md)
pnpm happy-path    # clean copies of data/ for a demo, named after each company, in ~/Desktop/happy-path
```

No network is needed at run time: fonts are local (`geist`), and the engine reads files from disk.

### The data agent

The **Agente** button in the top bar opens a sidebar on every screen that answers questions about the
processed data. It pushes the page instead of covering it; drag its left edge (or use the expand
button) to make it wider. On a phone it opens full screen. Spec: `docs/specs/agente-datos.md`.

```bash
# .env.local (gitignored), read by lib/agent/config.ts
ANTHROPIC_API_KEY=...          # the key; this is the only part that needs network
ANTHROPIC_BASE_URL=...         # optional: an Anthropic-compatible gateway instead of api.anthropic.com
PULSEGROUP_MODEL=...           # optional: model id, default claude-opus-5-5
PULSEGROUP_AGENT=simulado      # optional: a scripted model drives the same loop, no key needed
```

With no key and no simulator, the three fixed questions are answered by template and free questions are off.

Consolidado opens with a **Lectura rápida**: the agent reads the statement in four points (the number,
why it is not the simple sum, who creates and destroys value, what is pending) with the same tools and
the same figure check as any answer, or by template without a model. It loads after the page and is
kept per dataset, decisions and model, so only a change asks the model again.

To run it on Meta's Muse Spark (Meta Model API speaks the Anthropic Messages format), the key goes in
`ANTHROPIC_AUTH_TOKEN` (Meta wants `Authorization: Bearer`), with
`ANTHROPIC_BASE_URL=https://api.meta.ai` and `PULSEGROUP_MODEL=muse-spark-1.3-contributor` (or
`muse-spark-1.3`, which Meta does not train on). Through a gateway the agent sends only standard
Messages fields: no prompt caching and no refusal fallback.

### Happy path for a demo

`pnpm happy-path` runs the engine on `data/` and fixes exactly what it reports (drops duplicate rows
and rows in a currency with no group rate, flips inverted signs), writes the six budgets plus
`supuestos.xlsx` to `~/Desktop/happy-path` as `<company name> - presupuesto <year>.xlsx`, and fails
unless the result loads with no findings. Upload those seven files: every company is recognised by
its name, Carga shows them all clean and Resumen says the number is ready.

Company names in `mappings/*.json` (`companyName`) are fictional, for the demo; the codes
(`EMP_GT_01`…) and file names are unchanged. An upload is recognised by the exact file name, or by a
name that contains the company code or the company name, with or without accents.

## Where things are

| Path | What |
| --- | --- |
| `data/` | One folder per company (`EMP_CR_01/`, `EMP_GT_01/`, …) with that company's budget and WACC file. `supuestos.xlsx` is the group sheet. How to read the files, the mappings, and the screens is in `docs/reading-the-data.md`. |
| `mappings/*.json` | One mapping per company: which file, which columns, and the local account → group account map. How it is applied is in `mappings/README.md`. |
| `config/catalog.json` | The group chart of accounts. |
| `lib/engine/` | The accounting engine, pure functions: `workbook` (xlsx/csv reader), `map`, `validate`, `fx`, `intercompany`, `consolidate`, `bridge`, `explain`, `pipeline`. |
| `lib/server/` | Request state (resolutions in a cookie) and source-row excerpts. |
| `lib/agent/` | The data agent: read-only tools over the engine result, the loop, the figure check, proposals, the three fixed questions and their templates, the simulator, and `config.ts` (env). |
| `components/agent/` | The agent sidebar, mounted in `app/layout.tsx`, and its open/width state. |
| `app/` | Screens: `/load`, `/load/[company]/mapping`, `/summary`, `/consolidated`. `POST /api/ask` serves the agent. |

## How to use it

The app starts empty. It reads a file only after someone loads the example or uploads workbooks.

```bash
pnpm dev           # http://localhost:3000
```

On the first screen, **Usar datos de ejemplo** loads `data/` through `mappings/`. **Subir archivos** accepts workbooks whose names match `file` in a mapping (`EMP_CR_01_presupuesto.xlsx`, and the same for the other five). A `supuestos.xlsx` in the upload replaces the group sheet. Without one, the upload uses `data/supuestos.xlsx`.

| Screen | What it shows |
| --- | --- |
| `/load` | Which files were read, and the rows held out (a duplicate, a currency with no rate, a month that does not balance). |
| `/load/EMP_CR_01/mapping` | How that company's file was read: sheet, columns, and each local account next to its group account. The same path works for the other five ids. |
| `/summary` | The group result and the bridge from each company's figures. |
| `/consolidated` | Income statement, balance sheet, and KPIs in quetzales, each figure traceable to the cell it came from. |

Income-statement amounts convert at the month's average rate. Balance-sheet amounts convert at the closing rate. `GTQ` is already the group currency. The WACC `0.122178` and the tax `0.30` in `supuestos.xlsx` are `EMP_CR_01`'s January 2026 anchor, and they are applied to every company. Each company's own local WACC is on the parameter sheet as a record. The engine does not read those rows, and it does not read the WACC CSV.

`pnpm data` rebuilds an older practice set and replaces `data/`. Do not run it if these EMP folders should stay.

## Decisions worth knowing

- **No figure comes from an LLM.** Every number is computed and tested. Sentences are templates (`lib/engine/explain.ts`).
- **Money is in integer cents** once converted, rounded once per fact, so sums and the bridge close exactly. The bridge throws if it does not close.
- **Blocks hold rows out until a person acts.** An inverted company rate holds the whole company; a row in a currency with no group rate holds that row; an unbalanced month holds that month's balance.
- **Intercompany lines are eliminated in full on both sides.** What matches is an elimination, the rest is shown as unreconciled. This gives the right group figure even when the two books disagree; the finding says which book is off. On the balance sheet the residual goes to account 3900.
- **An intercompany line whose counterparty is not a group company stays out of the number** (rule
  `IC_OUTSIDE`, one finding per company). It cannot be eliminated or reconciled with anyone, the same
  reason an unreconciled pair stays out. Income statement only: holding one side of an intercompany
  balance would unbalance the sheet. Today's `data/` hits it in every file: each one sells to
  "Empresa 3" and "Empresa 4" and buys from "Empresa 4", names that are no longer group companies.
  The fix belongs in the files (name the group company, with amounts both sides agree on); the
  happy path reads them as related parties outside the group and books them as ordinary sales and costs.
- **A subtotal that does not add up is a warning, not a quarantine.** The engine sums the accounts and never the file's subtotal, so holding the accounts back would remove correct rows.
- **Deviation is measured against a previous version** when `data/anterior/supuestos.xlsx` is present. The handoff left the base open; this is a proposal.
- **SheetJS is not used.** The event network intercepts TLS and npm could not reach it, so `lib/engine/workbook.ts` reads and writes xlsx and csv with Node's zlib. `@types/react` is vendored in `vendor/` for the same reason.
- **The agent quotes, it does not compute.** Its tools return figures already formatted by the engine, and every amount or percentage in an answer is checked against them; a figure that does not match is underlined as unverified. It can only propose the action a finding already carries, and the server checks the proposal again before applying it.
- **`@anthropic-ai/sdk` is vendored** with its dependencies (`vendor/anthropic-sdk`, plus `pnpm.overrides` in `package.json`), copied from the local npm cache because npm is unreachable here.

## Not done yet

- LLM-proposed mappings (`/api` route with structured output and a cache). Mappings are hand-written JSON for now.
- Editing a mapping from the Mapping screen; it is read-only and the approval is stored per visitor.
