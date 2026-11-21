---
name: match-emp-presupuesto
description: >-
  Aligns an EMP_CR or EMP_GT WACC file with a company presupuesto (or budget)
  and supuestos.xlsx. Copies that file's debt and equity into the budget in the
  file's own currency, sets the group WACC and tax from the file, and adds a
  colón rate when the company is Costa Rica. Use when the user asks to match
  EMP_CR, EMP_GT, wacc_inputs, a presupuesto, a budget, or supuestos, or to
  keep Costa Rica in colones and Guatemala in quetzales.
---

# Match an EMP file to a presupuesto and supuestos

Do this when an `EMP_*` file should become the capital structure and the WACC of one company budget. Edit the presupuesto and `data/supuestos.xlsx`. Do not regenerate with `pnpm data`; that overwrites both from `scripts/generate-data.ts`.

## How the files relate

They do different jobs and meet in one formula.

- `data/<empresa_id>/EMP_*.csv` is not a budget. One row is a subsidiary for one month. It holds the ingredients of a WACC: market rates, tax, and debt and equity in `moneda_local`. The consolidator never opens these files. Each CSV sits in `data/<empresa_id>/` next to that company's presupuesto.
- `e#_presupuesto.xlsx` and `e#_budget.csv` are the same kind of file. Spanish names and English names are the language of the sender. Each file is that company's monthly income statement and balance sheet. Debt and equity here are the size of invested capital.
- `data/supuestos.xlsx` is the group assumption sheet. It already contains one finished WACC, one tax rate, and the exchange rates into quetzales. The engine reads those cells. It does not calculate the WACC.

EVA uses both:

`EVA = NOPAT − (debt + equity) × WACC`

The presupuesto supplies EBIT, debt, and equity. `supuestos.xlsx` supplies the tax that turns EBIT into NOPAT, and the WACC. Debt and equity in an EMP file are the balances to copy and the weights inside the WACC. Debt and equity in the presupuesto are only the balances the rate is charged on.

## Currencies

- `EMP_CR_##` is Costa Rica. `moneda_local` is `CRC`. Amounts are colones. A matched company stays in colones. Do not write those balances as quetzales.
- `EMP_GT_##` is Guatemala. `moneda_local` is `GTQ`. Amounts are quetzales. A matched company stays in quetzales. Do not write those balances as colones.
- The group currency in `supuestos.xlsx` stays `GTQ`. Quetzal companies need no FX row. A colón company needs a `CRC` average rate and a `CRC` closing rate for every month of the fiscal year, in GTQ per colón.

## Which EMP file matches which budget

Match the file the user names to the presupuesto they name. The worked pair is `data/EMP_CR_01/EMP_CR_01.csv` → `data/EMP_CR_01/EMP_CR_01_presupuesto.xlsx`. An `EMP_GT` file matches a company that already budgets in quetzales, on the same steps, without a currency conversion.

Map CSV months onto the presupuesto year by calendar month. `2026-01` is written onto `2027-01`, through `2026-12` onto `2027-12`. The anchor row is January of the CSV's budget year (`2026-01`). That row keeps the original annual debt and equity. The single WACC and the single tax in `supuestos.xlsx` come from the anchor row only.

## Procedure

1. Read the EMP file, the presupuesto, `mappings/<empresa_id>.json`, and both sheets of `supuestos.xlsx`.
2. Compute the anchor WACC with the formula below. Round the stored WACC to 6 decimal places.
3. Set `supuestos.xlsx` parameter `WACC` to `wacc_moneda_local` and `Tasa impositiva` to `tasa_impuesto_t`. Note the cells as coming from that EMP row. Leave `Moneda del grupo` as `GTQ` and leave the fiscal year as it is.
4. For a Costa Rica match, append `CRC` rows to the Tasas sheet: each month of the fiscal year, both `Promedio` and `Cierre`, at the GTQ-per-CRC rate below. For a Guatemala match, add no GTQ row.
5. Rewrite the company currency. Costa Rica: every `GTQ` cell in the Moneda column becomes `CRC`. Guatemala: the column stays `GTQ`. Leave a seeded row in another currency untouched (Empresa 1's euro licence stays `EUR`).
6. Set each month's bank debt equal to that month's `deuda_total_d`, and paid-in capital + retained earnings + current-year result equal to `patrimonio_e`. Use the EMP integers exactly, in the EMP currency. Keep the file's existing short-term share of debt (`3,200,000 / 17,700,000` on Empresa 1). Paid-in capital is one constant. Current-year result follows the income statement. Retained earnings is whatever remains so the three equity accounts sum to `patrimonio_e`, including the April drop in the CSV.
7. Put every other amount into the company currency. A file that was in quetzales and is now in colones is scaled by CRC per GTQ, then debt, equity, interest, tax, and cash are overwritten with the figures in the next steps. A file that stays in quetzales is not scaled.
8. Interest for the month is `round(deuda_total_d × kd_local / 12)`, stored with the file's expense sign (negative on Empresa 1). `kd_local = (1 + kd_pre_tax_usd) × (1 + inflacion_local) / (1 + inflacion_usd) − 1`.
9. Tax expense is `tasa_impuesto_t` times pre-tax profit in the company currency. Exclude seeded rows from that profit: the second copy of a duplicate row, and any row whose currency is not the company currency.
10. Cash is the plug. After debt and equity are set, `cash = liabilities + equity − other assets`. Assets must equal liabilities plus equity every month, and cash and retained earnings must stay positive. If cash would be negative, lower net plant by a round amount until the tightest month is positive, then plug cash again.
11. Set `currency` in that company's `mappings/<empresa_id>.json` to `CRC` or `GTQ`. The per-row Moneda column is what the engine converts. The mapping is the company's label.
12. Keep seeded errors detectable. Two duplicate rows must stay identical after any scale. The euro row must stay euros.

`supuestos.xlsx` then applies that one WACC and that one tax to every company, not only the one that was matched. Say so when you finish.

If the WACC or the tax changed, update `data/_truth/expected_consolidated.json` `kpis`. The clean-file test reads `data/supuestos.xlsx` and does not read the edited presupuesto. Recompute from the clean totals already in that file:

- `nopat = ebit × (1 − tax)`, rounded to cents
- `roic = nopat / investedCapital`
- `eva = nopat − investedCapital × wacc`, rounded to cents

Leave `investedCapital` and `roce` as they are.

## WACC

Symbols are the EMP columns. `D` and `E` are the anchor row only.

```
β_L = beta_desapalancada × [1 + (1 − tasa_impuesto_t) × (D / E)]
Ke  = rf_usd + (β_L × erp_maduro) + crp
Kd  = kd_pre_tax_usd × (1 − tasa_impuesto_t)
WACC_usd    = Ke × E / (D + E) + Kd × D / (D + E)
WACC_local  = (1 + WACC_usd) × (1 + inflacion_local) / (1 + inflacion_usd) − 1
```

Store `WACC_local`. That is the rate charged on a budget in the company's currency.

## Rate for a colón company

Use one cross rate for the whole year, average and closing:

- CRC per USD: the BCCR average sell rate for the anchor month. January 2026 is 497.94.
- GTQ per USD: the group's January closing rate already in `supuestos.xlsx`. That rate is 7.7021.
- GTQ per CRC = 7.7021 / 497.94 = 0.01546793. Store that.
- CRC per GTQ = 497.94 / 7.7021. Scale a quetzal amount into colones with this.

## Worked match

`data/EMP_CR_01/EMP_CR_01.csv` → `data/EMP_CR_01/EMP_CR_01_presupuesto.xlsx`, anchor `2026-01`.

- Debt ₡850,000,000, equity ₡1,400,000,000, tax 0.30.
- β_L 1.1685, Ke 0.140751, WACC in dollars 0.114552, local WACC stored as 0.122178.
- Local pre-tax debt cost 0.109541. January interest is that rate on ₡850,000,000 for one month.
- Paid-in capital ₡937,423,560, the scale of the previous Q14,500,000.
- January cash stayed positive (₡172,613,017). No plant cut was required after the file was in colones.
- `mappings/EMP_CR_01.json` currency is `CRC`.
- The May export row still has an identical copy. The licence row is still EUR −18,500.

## Checks

Read the workbooks back with `lib/engine/workbook.ts`.

- Twelve months, and assets equal liabilities plus equity in each.
- Each month's debt equals `deuda_total_d` and equity equals `patrimonio_e`.
- Currencies are the company currency plus any seeded other currency. A Costa Rica file has no `GTQ` left.
- `supuestos.xlsx` shows the new WACC, the new tax, group currency `GTQ`, and 24 `CRC` rate rows when the company is Costa Rica.
- The duplicate pair is still identical. The seeded foreign-currency row is still there.
