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

The formula that turns a row into a local WACC is in [wacc-inputs.md](wacc-inputs.md). The anchor is January 2026 (`2026-01`). That row's local WACC is stored at 6 decimals on the parameter sheet of `supuestos.xlsx`.

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

## How a mapping is read

One JSON file per company, in `mappings/`. The name matches the company id (`mappings/EMP_CR_01.json`). The engine loads every `mappings/*.json` and opens `data/<companyId>/<file>`.

All six files describe the same presupuesto shape. Only `companyId`, `companyName`, `file`, and `currency` change. Costa Rica mappings use `CRC`. Guatemala mappings use `GTQ`.

| Field | How to read it |
| --- | --- |
| `companyId` | The company in the consolidation, and the folder under `data/`. |
| `companyName` | The name on the screens. |
| `file` | The workbook inside that folder. An upload is recognized by this exact name. |
| `currency` | The company's currency. A row can still carry another code in `Moneda`. The euro licence does. |
| `scale` | `1` means `Monto` is already in currency units, not in thousands. |
| `expenseSign` | `negative` means an expense is already stored as a negative `Monto`. The amount is kept as written. |
| `sheets` | Which sheet to read, that the header is row 1, that the shape is one row per account and month, and which header is which column. |
| `accountMap` | Local `Cuenta` → group account in `config/catalog.json`. Two local sales accounts can share one group account. |
| `counterpartyMap` | The name in `Contraparte` → another company id. It is empty, so a related-party name stays a label and is not eliminated against another book. |
| `status` | `proposed` until someone approves it on the mapping screen. Approval is stored for that visitor, not in this file. |

`sheets[0].columns` names the headers:

| Key | Header in the file |
| --- | --- |
| `account` | `Cuenta` |
| `description` | `Descripción` |
| `period` | `Mes` |
| `amount` | `Monto` |
| `counterparty` | `Contraparte` |
| `currency` | `Moneda` |

### What the engine does with a mapping

1. Read each data row under the header.
2. Send `Cuenta` through `accountMap`. A code with no entry is unmapped and stays out of the group total.
3. Keep `Monto` as written, because `expenseSign` is `negative` and `scale` is `1`.
4. Convert to quetzales with `data/supuestos.xlsx`. Income-statement rows use the month's average rate. Balance-sheet rows use the month's closing rate. `GTQ` needs no rate. A currency with no rate, such as `EUR`, holds that row out.
5. When two rows are identical, the later copy is held out as a duplicate.
6. Build the consolidated statements and the KPIs. The single WACC and the single tax in `supuestos.xlsx` apply to every company.

### Account map

The same map is in every company file.

| Local | Name in the presupuesto | Group | Group name |
| --- | --- | --- | --- |
| `4101` | Ventas nacionales | `4000` | Ventas |
| `4102` | Ventas de exportación | `4000` | Ventas |
| `4190` | Ventas a empresas relacionadas | `4100` | Ventas entre empresas |
| `5101` | Costo de ventas | `5000` | Costo de ventas |
| `5190` | Compras a empresas relacionadas | `5100` | Compras entre empresas |
| `6101` | Sueldos y prestaciones | `6100` | Sueldos y prestaciones |
| `6201` | Fletes y distribución | `6200` | Logística y fletes |
| `6301` | Arrendamientos | `6300` | Arrendamientos |
| `6401` | Publicidad | `6400` | Mercadeo |
| `6501` | Servicios profesionales | `6500` | Servicios y otros gastos |
| `6502` | Otros gastos de administración | `6500` | Servicios y otros gastos |
| `6901` | Depreciaciones | `6900` | Depreciación |
| `7101` | Intereses bancarios | `7100` | Gastos financieros |
| `8101` | Impuesto sobre la renta | `8100` | Impuesto sobre la renta |
| `1101` | Caja y bancos | `1100` | Efectivo |
| `1201` | Clientes | `1200` | Cuentas por cobrar |
| `1251` | Cuentas por cobrar relacionadas | `1250` | Cuentas por cobrar entre empresas |
| `1301` | Inventarios | `1300` | Inventarios |
| `1501` | Propiedad, planta y equipo neto | `1500` | Propiedad, planta y equipo |
| `2101` | Proveedores | `2100` | Proveedores |
| `2151` | Cuentas por pagar relacionadas | `2150` | Cuentas por pagar entre empresas |
| `2201` | ISR por pagar | `2200` | Impuestos por pagar |
| `2301` | Préstamos bancarios corto plazo | `2300` | Deuda de corto plazo |
| `2501` | Préstamos bancarios largo plazo | `2500` | Deuda de largo plazo |
| `3101` | Capital pagado | `3100` | Capital social |
| `3201` | Utilidades acumuladas | `3200` | Utilidades retenidas |
| `3301` | Utilidad del ejercicio | `3300` | Resultado del ejercicio |

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
