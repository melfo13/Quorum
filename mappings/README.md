# How a mapping is read

One JSON file per company. The name matches the company id (`mappings/EMP_CR_01.json`). The engine loads every `mappings/*.json` and opens `data/<companyId>/<file>`.

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

## What the engine does with it

1. Read each data row under the header.
2. Send `Cuenta` through `accountMap`. A code with no entry is unmapped and stays out of the group total.
3. Keep `Monto` as written, because `expenseSign` is `negative` and `scale` is `1`.
4. Convert to quetzales with `data/supuestos.xlsx`. Income-statement rows use the month's average rate. Balance-sheet rows use the month's closing rate. `GTQ` needs no rate. A currency with no rate, such as `EUR`, holds that row out.
5. When two rows are identical, the later copy is held out as a duplicate.
6. Build the consolidated statements and the KPIs. The single WACC and the single tax in `supuestos.xlsx` apply to every company.

The mapping screen for a company is `/load/<companyId>/mapping`, after the example data is loaded.

## Account map

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
