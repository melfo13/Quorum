Read and follow `.cursor/skills/match-emp-presupuesto/SKILL.md` before you edit anything. Do that match for every EMP file, not only `EMP_CR_01`.

EMP files:

- `data/EMP_CR_01/EMP_CR_01.csv`
- `data/EMP_CR_02/EMP_CR_02.csv`
- `data/EMP_CR_03/EMP_CR_03.csv`
- `data/EMP_GT_01/EMP_GT_01.csv`
- `data/EMP_GT_02/EMP_GT_02.csv`
- `data/EMP_GT_03/EMP_GT_03.csv`

`EMP_CR` is Costa Rica, in colones (`CRC`). `EMP_GT` is Guatemala, in quetzales (`GTQ`). Do not convert a Costa Rica balance into quetzales, and do not convert a Guatemala balance into colones. The group currency in `data/supuestos.xlsx` stays `GTQ`.

For each EMP file, create the presupuesto the skill describes. `EMP_CR_01` already has `data/EMP_CR_01/EMP_CR_01_presupuesto.xlsx`; bring that file back in line with the skill if it has drifted, and leave its seeded errors in place (the identical May export rows, and the euro licence). For every other EMP file, create `data/<empresa_id>/<empresa_id>_presupuesto.xlsx` in the same long shape as `EMP_CR_01_presupuesto.xlsx`: one row per account and month, the same accounts, fiscal year 2027, CSV months `2026-01` … `2026-12` written onto `2027-01` … `2027-12`.

Build each new file from `EMP_CR_01` as the template, then apply the skill to that EMP file. Scale the operating lines (sales, costs, working capital, plant) by that file’s anchor equity divided by `EMP_CR_01`’s anchor equity. A Guatemala file is scaled in quetzales: take the template through the skill’s CRC-per-GTQ rate first, then apply the equity ratio. Debt, equity, interest, tax, and cash then follow the skill for that file’s own rows. Paid-in capital, the short-term share of debt, and the cash plug are the same rules as in the skill. Cash and retained earnings stay positive, and each month’s balance ties.

Set `currency` in a mapping for each new company to `CRC` or `GTQ`.

Modify `data/supuestos.xlsx` so every EMP file is represented, not only the last one you write. Keep `Moneda del grupo` as `GTQ`. Add the `CRC` average and closing rates once, at the skill’s GTQ-per-CRC rate, for every month of 2027. Do not add a `GTQ` rate. On the parameter sheet, keep the engine’s single `WACC` and `Tasa impositiva` cells equal to the `EMP_CR_01` anchor, and add one row per EMP file with `empresa_id`, that file’s anchor `wacc_moneda_local` (6 decimals), and that file’s `tasa_impuesto_t`. Use the skill’s formula for each anchor row (`2026-01`).

Do not run `pnpm data`.

When you finish, run the skill’s checks on every presupuesto you created or updated, and list each company with its currency, January debt, January equity, local WACC, and tax.
