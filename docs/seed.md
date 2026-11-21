Genera un dataset de práctica para PulseGroup (lee PULSEGROUP_HANDOFF.md para el contexto).
Escribe un script reproducible en scripts/generate-data.ts (semilla fija, TypeScript, SheetJS
para xlsx) y ejecútalo. No escribas código de producto en esta tarea.

GRUPO

- 6 empresas de un grupo ficticio. Moneda del grupo: GTQ.
- Monedas: Empresas 1 y 2 en GTQ, 3 y 4 en USD, 5 y 6 en MXN.
- Presupuesto de 12 meses, con estado de resultados y balance por empresa.
- Catálogo del grupo de unas 25 cuentas (ingresos, ingresos entre empresas, costo de ventas,
  gastos operativos por tipo, depreciación, impuestos, activos y pasivos corrientes y no
  corrientes, cuentas por cobrar y por pagar entre empresas, deuda financiera, patrimonio).
- Cada empresa usa su propio plan de cuentas: códigos y nombres distintos, unas en español y
  otras en inglés.
- Al menos 6 pares de operaciones entre empresas, registradas en ambos lados (venta y compra,
  cuenta por cobrar y por pagar).
- Supuestos del grupo en data/supuestos.xlsx: tasas de cambio promedio y de cierre por moneda,
  WACC y tasa impositiva.
- Magnitudes realistas y coherentes: márgenes plausibles y balance que cuadra.

ESTRUCTURAS (cada archivo distinto, a propósito)

1. e1_presupuesto.xlsx: formato largo (una fila por cuenta y mes), encabezados en español.
2. e2_presupuesto.xlsx: formato largo con filas de subtotal y de total mezcladas con los datos.
3. e3_budget.csv: formato ancho (un mes por columna), encabezados en inglés, dos filas de
   título antes del encabezado.
4. e4_budget.csv: formato ancho, separador punto y coma, coma decimal, montos en miles.
5. e5_presupuesto.xlsx: formato largo, montos en miles, con su propia hoja "Tasas".
6. e6_presupuesto.xlsx: una hoja por área (Ventas, Operaciones, Administración) y una hoja
   "KPIs" con ROIC, ROCE y EVA escritos a mano como valores, no como fórmulas.

DOS VERSIONES

- data/: versión actual, con errores sembrados.
- data/anterior/: versión previa del mismo presupuesto, sin errores, con cifras entre 2 % y 6 %
  distintas y 3 cambios deliberados y grandes (por ejemplo, costo logístico de una empresa
  +14 %), para que el explicador de desviaciones tenga algo que explicar.

ERRORES SEMBRADOS (solo en data/, uno o dos por regla, 10 a 12 en total)

- FX_INVERTED: tasa invertida en la hoja Tasas de la Empresa 5.
- FX_MISSING: una fila en una moneda que no está en supuestos.xlsx.
- BS_UNBALANCED: un balance que no cuadra en un mes.
- SUBTOTAL_MISMATCH: un subtotal de la Empresa 2 que no suma sus cuentas.
- DUPLICATE_ROW: una fila duplicada exacta.
- SIGN_INVERTED: un gasto con el signo contrario al del resto del archivo.
- ACCOUNT_UNMAPPED: una cuenta que no existe en el plan de cuentas de esa empresa.
- IC_ASYMMETRIC: una venta entre empresas cuyo monto no coincide con la compra del otro lado.
- IC_MISSING: una venta entre empresas que la contraparte no registró.
- KPI_MISMATCH: un ROIC de la hoja KPIs que no coincide con el que sale de los datos.
  Los errores deben ser sutiles y verosímiles, no absurdos.

VERDAD DE REFERENCIA (en data/\_truth/, que el motor nunca debe leer; solo las pruebas)

- answer_key.json: cada error con regla, archivo, hoja, fila, columna, valor correcto, valor
  sembrado y efecto en GTQ sobre ingresos y EBIT del grupo.
- clean/: los seis archivos sin errores, con la misma estructura.
- expected_consolidated.json: estado de resultados y balance consolidados en GTQ calculados
  desde los datos limpios, con eliminaciones entre empresas, más ROIC, ROCE y EVA.
- catalogo_grupo.json y el mapeo de cuentas locales a cuentas del grupo por empresa.

VERIFICACIÓN (el script debe fallar si algo no se cumple)

- En los datos limpios, el balance de cada empresa cuadra cada mes.
- En los datos limpios, cada operación entre empresas cuadra con su contraparte.
- El número de errores en answer_key.json coincide con los sembrados.
- Al final imprime un resumen: filas por archivo, errores por regla, ingresos y EBIT
  consolidados esperados.

Agrega data/README.md que describa los archivos como lo haría el organizador del reto, sin
mencionar dónde están los errores.
