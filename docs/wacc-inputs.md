# Insumos de WACC

Contrato de entrada para el cálculo del WACC por subsidiaria. El motor (SQL o Python) lee las columnas de entrada y genera las columnas calculadas. No forma parte del dataset de práctica descrito en `docs/seed.md`.

Las tasas van en decimal: `0.0425` es 4.25%. La deuda y el patrimonio van en moneda local.

## Columnas de entrada

Archivo plano de carga: `wacc_inputs.csv`.

| Columna | Tipo | Descripción | Ejemplo |
| --- | --- | --- | --- |
| `pais_id` | VARCHAR | Código ISO del país de la subsidiaria | `GT`, `CR`, `SV`, `HN`, `CO` |
| `empresa_id` | VARCHAR | Identificador único de la entidad del grupo | `EMP_01`, `EMP_02` |
| `periodo` | VARCHAR | Año o trimestre del presupuesto | `2026`, `2026-Q1` |
| `moneda_local` | VARCHAR | Código ISO de la moneda en que presupuesta | `GTQ`, `CRC`, `COP` |
| `rf_usd` | DECIMAL | Tasa libre de riesgo en USD (bono del Tesoro de EE.UU. a 10 años) | `0.0425` (4.25%) |
| `erp_maduro` | DECIMAL | Prima de riesgo de mercado maduro (S&P 500 implícita) | `0.0460` (4.60%) |
| `crp` | DECIMAL | Prima de riesgo país (Damodaran / EMBI) | `0.0310` (GT), `0.0445` (CR) |
| `beta_desapalancada` | DECIMAL | Beta del sector sin deuda (β_U) | `0.85` (consumo / retail) |
| `tasa_impuesto_t` | DECIMAL | Tasa impositiva corporativa efectiva del país (T) | `0.25` (GT), `0.30` (CR) |
| `deuda_total_d` | DECIMAL | Deuda financiera con costo, corto y largo plazo, en moneda local (D) | `15000000.00` |
| `patrimonio_e` | DECIMAL | Patrimonio a valor de mercado o contable ajustado, en moneda local (E) | `25000000.00` |
| `kd_pre_tax_usd` | DECIMAL | Costo de la deuda antes de impuestos en USD. Referencia de armado: R_f + CRP + spread de crédito. Entra ya calculado. | `0.0885` (8.85%) |
| `inflacion_usd` | DECIMAL | Inflación esperada de largo plazo en EE.UU. (π_usd) | `0.0230` (2.30%) |
| `inflacion_local` | DECIMAL | Inflación esperada en el país de la subsidiaria (π_local) | `0.0400` (GT), `0.0300` (CR) |

`kd_pre_tax_usd` es insumo. El motor no lo descompone en tasa libre de riesgo, prima país ni spread.

## Columnas calculadas

Símbolos: D = `deuda_total_d`, E = `patrimonio_e`, T = `tasa_impuesto_t`, β_U = `beta_desapalancada`, β_L = `beta_apalancada`, R_f = `rf_usd`, ERP = `erp_maduro`, CRP = `crp`, π_local = `inflacion_local`, π_usd = `inflacion_usd`.

| Columna | Fórmula | Propósito |
| --- | --- | --- |
| `ratio_d_e` | D / E | Apalancamiento financiero de la subsidiaria |
| `peso_deuda_wd` | D / (D + E) | Ponderación de la deuda en el capital |
| `peso_equity_we` | E / (D + E) | Ponderación del patrimonio en el capital |
| `beta_apalancada` | β_L = β_U × [1 + (1 − T) × (D / E)] | Ecuación de Hamada: ajusta el riesgo por deuda |
| `ke_usd` | R_f + (β_L × ERP) + CRP | Costo del patrimonio en dólares (CAPM ajustado por país) |
| `kd_after_tax_usd` | K_d,pre-tax × (1 − T) | Costo de la deuda después del escudo fiscal |
| `wacc_usd` | (K_e,usd × W_e) + (K_d,after-tax,usd × W_d) | WACC en dólares, para consolidar en USD |
| `wacc_moneda_local` | (1 + WACC_usd) × (1 + π_local) / (1 + π_usd) − 1 | WACC en moneda local, vía diferencial de inflación |

Orden de cálculo: ratio y pesos, luego beta apalancada, luego `ke_usd` y `kd_after_tax_usd`, luego `wacc_usd`, y al final `wacc_moneda_local`.

## Plantilla CSV

```csv
pais_id,empresa_id,periodo,moneda_local,rf_usd,erp_maduro,crp,beta_desapalancada,tasa_impuesto_t,deuda_total_d,patrimonio_e,kd_pre_tax_usd,inflacion_usd,inflacion_local
GT,EMP_GT_01,2026,GTQ,0.0425,0.0460,0.0310,0.82,0.25,12000000,28000000,0.0885,0.0230,0.0400
CR,EMP_CR_02,2026,CRC,0.0425,0.0460,0.0445,0.82,0.30,850000000,1400000000,0.1020,0.0230,0.0300
SV,EMP_SV_03,2026,USD,0.0425,0.0460,0.0580,0.82,0.30,4500000,9000000,0.1155,0.0230,0.0230
```

El Salvador presupuesta en USD y trae la misma inflación que EE.UU., así que en esa fila `wacc_moneda_local` coincide con `wacc_usd`.
