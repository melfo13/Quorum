# PulseGroup

Consolidates the budgets of six group companies into one currency without manual capture, and keeps
every figure traceable to the cell it came from. Built for the Open2 Build & Pitch hackathon,
Accounting track. The spec is in `docs/handoff/PULSEGROUP_HANDOFF.md`.

## Run

```bash
nvm use            # Node 24
pnpm install
pnpm dev           # http://localhost:3000 → /load
pnpm test          # engine tests against data/_truth
pnpm run lint
pnpm data          # regenerate the practice dataset (docs/seed.md)
```

No network is needed at run time: fonts are local (`geist`), and the engine reads files from disk.

## Where things are

| Path | What |
| --- | --- |
| `data/` | The six budget files and `supuestos.xlsx` (group rates, WACC, tax rate). Today this is the practice set from `pnpm data`; drop the official files here with the same names, and adjust `mappings/` if their structure differs. |
| `data/anterior/` | The previous version of the budget, used as the base for the deviation signal. |
| `data/_truth/` | Answer key and expected consolidation for the practice set. Only tests read it. |
| `mappings/*.json` | One `SourceMapping` per company: sheets, header row, shape, columns by header label, scale, expense sign, account and counterparty maps. |
| `config/catalog.json` | The group chart of accounts. |
| `lib/engine/` | The accounting engine, pure functions: `workbook` (xlsx/csv reader), `map`, `validate`, `fx`, `intercompany`, `consolidate`, `bridge`, `explain`, `pipeline`. |
| `lib/server/` | Request state (resolutions in a cookie) and source-row excerpts. |
| `app/` | Screens: `/load`, `/load/[company]/mapping`, `/summary`, `/consolidated`. |

## Decisions worth knowing

- **No figure comes from an LLM.** Every number is computed and tested. Sentences are templates (`lib/engine/explain.ts`).
- **Money is in integer cents** once converted, rounded once per fact, so sums and the bridge close exactly. The bridge throws if it does not close.
- **Blocks hold rows out until a person acts.** An inverted company rate holds the whole company; a row in a currency with no group rate holds that row; an unbalanced month holds that month's balance.
- **Intercompany lines are eliminated in full on both sides.** What matches is an elimination, the rest is shown as unreconciled. This gives the right group figure even when the two books disagree; the finding says which book is off. On the balance sheet the residual goes to account 3900.
- **A subtotal that does not add up is a warning, not a quarantine.** The engine sums the accounts and never the file's subtotal, so holding the accounts back would remove correct rows.
- **Deviation is measured against the previous version** (`data/anterior/`). The handoff left the base open; this is a proposal.
- **SheetJS is not used.** The event network intercepts TLS and npm could not reach it, so `lib/engine/workbook.ts` reads and writes xlsx and csv with Node's zlib. `@types/react` is vendored in `vendor/` for the same reason.

## Not done yet

- LLM-proposed mappings (`/api` route with structured output and a cache). Mappings are hand-written JSON for now.
- Editing a mapping from the Mapping screen; it is read-only and the approval is stored per visitor.
