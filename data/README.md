# How to read the data

Six companies. Each folder holds that company's budget and the WACC inputs that set its debt, equity, and local rate. `supuestos.xlsx` is the group's sheet, not a company's. The group currency is the quetzal (GTQ).

The consolidator opens the presupuesto and `supuestos.xlsx`. It does not open the CSV. The CSV is the worksheet those two files were filled from.

| Folder | Budget (what the engine reads) | WACC inputs (not read by the engine) | Budget currency |
| --- | --- | --- | --- |
| `EMP_CR_01/` | `EMP_CR_01_presupuesto.xlsx` | `EMP_CR_01.csv` | CRC |
| `EMP_CR_02/` | `EMP_CR_02_presupuesto.xlsx` | `EMP_CR_02.csv` | CRC |
| `EMP_CR_03/` | `EMP_CR_03_presupuesto.xlsx` | `EMP_CR_03.csv` | CRC |
| `EMP_GT_01/` | `EMP_GT_01_presupuesto.xlsx` | `EMP_GT_01.csv` | GTQ |
| `EMP_GT_02/` | `EMP_GT_02_presupuesto.xlsx` | `EMP_GT_02.csv` | GTQ |
| `EMP_GT_03/` | `EMP_GT_03_presupuesto.xlsx` | `EMP_GT_03.csv` | GTQ |

`EMP_CR` is Costa Rica, in colones. `EMP_GT` is Guatemala, in quetzales. A Costa Rica balance is not stored in quetzales, and a Guatemala balance is not stored in colones.

How a row becomes a group account is in `mappings/README.md`. How to run it is in the project `README.md`.

## Presupuesto

Sheet `Presupuesto`. Row 1 is the header. One data row is one account in one month.

| Column | Meaning |
| --- | --- |
| `Cuenta` | Local account code, such as `4101`. |
| `Descripción` | The account name in the file. |
| `Mes` | `2027-01` through `2027-12`. |
| `Moneda` | Currency of this row. Company rows are `CRC` or `GTQ`. One April row on each file is `EUR`. |
| `Monto` | Amount in `Moneda`. Revenue is positive. Expenses are negative. |
| `Contraparte` | The other party, when the row is with a related company. Empty on the rest. |

The fiscal year is 2027. The CSV months `2026-01` … `2026-12` were written onto `2027-01` … `2027-12`. The CSV also has 2025. Those rows are not in the presupuesto.

For each month, short-term loans (`2301`) plus long-term loans (`2501`) equal that month's `deuda_total_d`. Paid-in capital (`3101`) plus retained earnings (`3201`) plus the year-to-date result (`3301`) equal `patrimonio_e`. Cash (`1101`) is the plug that makes assets equal liabilities plus equity.

Two rows are left in on purpose, on every file:

- May has two identical `4102` export rows. The second is a duplicate.
- April has a software licence on account `6501` for EUR −18,500. The group rate table has no euro rate.

## WACC CSV

One row is that company for one month. Rates are decimals (`0.30` is 30%). `deuda_total_d` and `patrimonio_e` are in `moneda_local`.

| Column | What it is |
| --- | --- |
| `pais_id` | `CR` or `GT`. |
| `empresa_id` | The folder name. |
| `periodo` | `2025-01` … `2026-12`. |
| `moneda_local` | `CRC` or `GTQ`. |
| `rf_usd`, `erp_maduro`, `crp` | Risk-free rate, mature-market premium, country risk. |
| `beta_desapalancada` | Unlevered beta. |
| `tasa_impuesto_t` | That company's tax rate. Costa Rica is `0.30`. Guatemala is `0.25`. |
| `deuda_total_d`, `patrimonio_e` | Debt and equity in local currency. |
| `kd_pre_tax_usd` | Pre-tax cost of debt in dollars. |
| `inflacion_usd`, `inflacion_local` | Expected inflation. |

The formula that turns a row into a local WACC is in `docs/wacc-inputs.md`. The anchor is January 2026 (`2026-01`). That row's local WACC is stored at 6 decimals on the parameter sheet of `supuestos.xlsx`.

## supuestos.xlsx

Two sheets.

**Tasas.** Columns `Moneda`, `Mes`, `Tipo`, `GTQ por unidad`. `Tipo` is `Promedio` (income-statement months) or `Cierre` (balance-sheet months). The rate is quetzales per one unit of `Moneda`. Colones use `0.01546793` for every month of 2027, both types. There is no `GTQ` row: a quetzal amount is already in the group currency. Dollar and peso rows are also on this sheet.

**Parametros.** The engine reads the first row whose label matches, and it uses that value for every company:

| Label | Value | Used as |
| --- | --- | --- |
| `Moneda del grupo` | `GTQ` | The currency of the consolidated figures. |
| `WACC` | `0.122178` | The local WACC of `EMP_CR_01` for January 2026. |
| `Tasa impositiva` | `0.30` | The tax of `EMP_CR_01`, used for NOPAT. |
| `Ejercicio` | `2027` | The fiscal year. |

Below those rows, one line per company gives `empresa_id`, that file's own `wacc_moneda_local`, and that file's `tasa_impuesto_t`. Those lines are the record of each anchor. The engine does not read them. Consolidated NOPAT and EVA use the single `WACC` and the single `Tasa impositiva` above.
