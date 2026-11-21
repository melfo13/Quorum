# PulseGroup: handoff para Claude Code

Este documento resume todo lo decidido hasta ahora para que puedas construir el MVP sin contexto previo. Léelo completo antes de escribir código. Donde diga "pendiente", pregunta al equipo o resuélvelo mirando el dataset; no lo inventes.

## 1. Contexto

- **Evento:** hackatón Open2 Build & Pitch, track Accounting, "Consolidación multiempresa". Tiempo total: 10 horas.
- **Reto:** lograr que el presupuesto de un grupo se consolide solo, en una moneda y sin capturas manuales, y que cada cifra se explique sola.
- **Datos:** un grupo ficticio con seis empresas, tres monedas y errores sembrados a propósito. Los seis archivos pueden tener estructuras distintas. Colócalos en `/data` y no los modifiques.
- **Qué debe probar el demo:**
  1. Funciona con los datos entregados.
  2. Encuentra los errores sembrados.
  3. Un director entiende el resultado sin ayuda: cada cifra se rastrea hasta el registro que la originó.
- **Lo que el track rechaza:** un chatbot sobre un Excel y un tablero bonito con números imposibles de auditar.

## 2. El producto en una frase

Un consolidador que lee los seis presupuestos, frena los errores antes de que entren al número del grupo, elimina las ventas entre empresas, convierte a una moneda y deja cada cifra con su rastro hasta la celda de origen.

## 3. Principios (no negociables)

1. **Cero cálculos hechos por LLM.** Todo número sale de código determinista y probado.
2. **El LLM solo hace dos cosas:** proponer el mapeo de columnas y cuentas de cada archivo, y redactar frases a partir de cifras ya calculadas. Ambas tienen respaldo sin LLM (mapeos guardados en JSON y frases por plantilla).
3. **Linaje por construcción.** Nada se suma sin cargar sus IDs. Cada cifra consolidada es una lista de contribuciones que apuntan a una celda de origen. El panel de auditoría solo pinta esa lista.
4. **Cuarentena, no silencio.** Una fila con error no entra al consolidado y su efecto se muestra en dinero.
5. **Los totales deben cerrar.** El puente y el estado de resultados se verifican con aserciones; si no cierran, falla la prueba.

## 4. Decisiones ya tomadas

| Tema | Decisión | Motivo |
| :--- | :--- | :--- |
| Capa "Whoop" | Tres señales con anillos, cada una con una cifra real y fórmula visible | Los puntajes compuestos con pesos inventados no son auditables |
| Explicador de desviaciones | Puente determinista de la suma simple al consolidado; el LLM solo redacta | Es uno de los cinco dolores del reto y no puede depender del LLM |
| Validador | Tres severidades: bloquea, cuarentena, aviso; cada hallazgo muestra su efecto en el grupo | Prueba que el error se frena antes de entrar |
| KPIs reportados | Se recalculan y se comparan con los copiados a mano en los archivos | Es probable que un error sembrado sea un indicador copiado |
| Tasas de cambio | Una sola tabla de tasas del grupo; se muestra la tasa que traía cada empresa | El reto dice que no hay tasa oficial común |
| Formatos distintos | Mapeo declarativo por archivo (`SourceMapping`), propuesto por IA y aprobado por una persona | "Sin capturas manuales" con seis estructuras distintas |
| Stack | Un solo lenguaje: TypeScript | Menos costuras en 10 horas |

## 5. Stack sugerido

- Next.js (App Router) + React + TypeScript + Tailwind CSS.
- Motor contable en `lib/engine` como funciones puras, sin dependencias de React.
- Lectura de archivos: SheetJS (`xlsx`) para Excel y PapaParse para CSV.
- Pruebas: Vitest. Como mínimo, una cifra consolidada verificada contra un cálculo hecho a mano.
- Sin base de datos. Estado en memoria y mapeos en `/mappings/*.json`.
- LLM detrás de una ruta de API con salida estructurada (JSON schema) y respuesta guardada en caché.

Estructura propuesta:

```
/data                 archivos del reto, sin tocar
/mappings             un JSON por empresa (SourceMapping)
/lib/engine
  ingest.ts           lee archivo -> SourceCell[]
  map.ts              SourceCell[] + SourceMapping -> Fact[]
  validate.ts         reglas -> Finding[]
  fx.ts               conversión con tasas del grupo
  intercompany.ts     cruce y eliminaciones
  consolidate.ts      Fact[] + Adjustment[] -> Cell[]
  kpis.ts             ROIC, ROCE, EVA
  bridge.ts           puente suma simple -> consolidado
  explain.ts          frases por plantilla
  types.ts
/app
  /carga  /carga/[empresa]/mapeo  /resumen  /consolidado
```

## 6. Modelo de datos

```ts
type SourceCell = {            // inmutable; una celda leída del archivo
  id: string; file: string; sheet: string; row: number; column: string; raw: unknown;
};

type SourceMapping = {         // un JSON por empresa
  companyId: string; file: string; sheet: string; headerRow: number;
  shape: 'long' | 'wide';      // wide = un mes por columna
  columns: { account: string; description?: string; amount?: string;
             period?: string; counterparty?: string };
  periodColumns?: string[];    // solo en 'wide'
  currency: string; scale: 1 | 1000;
  expenseSign: 'negative' | 'positive';
  accountMap: Record<string, string>;   // cuenta local -> cuenta del grupo
  status: 'proposed' | 'approved';
};

type Fact = {                  // fila normalizada
  id: string; sourceCellId: string; companyId: string; period: string;
  statement: 'PL' | 'BS';
  localAccount: string; groupAccount: string | null;
  counterpartyId: string | null;         // null = tercero
  currency: string; amountLocal: number;
  status: 'clean' | 'quarantined';
};

type FxRate = { currency: string; period: string;
                rateType: 'avg' | 'closing'; rate: number; source: string };

type Finding = {
  id: string; ruleId: string;
  severity: 'block' | 'quarantine' | 'warning';
  sourceCellIds: string[]; factIds: string[];
  expected: string; actual: string;
  groupImpact: { metric: string; amount: number } | null;
  status: 'open' | 'resolved';
};

type IcMatch = { id: string; sellerFactIds: string[]; buyerFactIds: string[];
                 amountSeller: number; amountBuyer: number; diff: number;
                 status: 'matched' | 'asymmetric' | 'missing' };

type Adjustment = { id: string; type: 'IC_ELIM' | 'FX_FIX';
                    groupAccount: string; period: string; amount: number;
                    icMatchId?: string; reason: string };

type Contribution = { factId: string; amountLocal: number; rate: number; amountGroup: number };

type Cell = { groupAccount: string; period: string; value: number;
              contributions: Contribution[]; adjustmentIds: string[] };

type Kpi = { name: 'ROIC' | 'ROCE' | 'EVA'; value: number;
             formula: string; inputs: { label: string; value: number; cellRef?: string }[] };
```

## 7. Flujo del motor

1. **Leer.** Cada archivo se convierte en `SourceCell[]`. Nada se descarta.
2. **Perfilar y mapear.** Código detecta hoja, fila de encabezado, forma, unidad y signo. El LLM propone el `SourceMapping` a partir de encabezados y unas 10 filas de muestra. Una persona lo aprueba. Para el demo, los seis mapeos deben estar guardados en `/mappings` desde la primera hora.
3. **Normalizar.** `SourceCell[]` más `SourceMapping` produce `Fact[]`. En formato ancho, cada celda de mes es un `Fact` distinto y su origen incluye la columna.
4. **Total de control.** La suma leída fila por fila debe coincidir con el total que trae el archivo, si lo trae. Si no coincide, es un hallazgo.
5. **Validar.** Se corren las reglas de la sección 8 y se producen `Finding[]`. Las filas en cuarentena quedan fuera de los pasos siguientes.
6. **Convertir.** Resultados con tasa promedio, balance con tasa de cierre, siempre con la tabla de tasas del grupo. Si se usan dos tipos de tasa, hace falta una línea de diferencia de conversión en el patrimonio para que el balance cuadre.
7. **Eliminar ventas entre empresas.** Cruce por contraparte y cuenta. Se elimina el monto que cuadra entre las dos partes; la diferencia queda marcada como "sin conciliar" con una tolerancia configurable. Cada eliminación es un `Adjustment` visible.
8. **Consolidar.** Se suman contribuciones y ajustes en `Cell[]`.
9. **KPIs.** Se calculan con las fórmulas de la sección 9 y guardan sus insumos.
10. **Puente y frases.** Sección 10.

## 8. Reglas del validador

| ID | Regla | Severidad | Cómo se detecta |
| :--- | :--- | :--- | :--- |
| FX_MISSING | Moneda sin tasa en la tabla del grupo | Bloquea | La moneda del archivo no existe en `FxRate` |
| FX_INVERTED | Tasa invertida o fuera de rango | Bloquea | La tasa del archivo difiere de la del grupo más que la tolerancia, o se parece a `1 / tasa del grupo` |
| BS_UNBALANCED | Activos distintos de pasivos más patrimonio | Bloquea | Por empresa y periodo |
| SUBTOTAL_MISMATCH | Subcuentas no suman su total | Cuarentena | Solo si el archivo trae filas de total |
| DUPLICATE_ROW | Fila duplicada exacta | Cuarentena | Misma cuenta, periodo, monto, contraparte y descripción |
| SIGN_INVERTED | Signo contrario al esperado | Cuarentena | Gasto con signo opuesto a `expenseSign` |
| ACCOUNT_UNMAPPED | Cuenta sin destino en el catálogo | Cuarentena | `groupAccount` nulo |
| IC_ASYMMETRIC | Venta y compra entre empresas no cuadran | Cuarentena | `IcMatch.diff` mayor que la tolerancia |
| IC_MISSING | Una parte no registró la operación | Cuarentena | Sin contraparte del otro lado |
| KPI_MISMATCH | Indicador reportado distinto del recalculado | Aviso | Se usa el recalculado |

Cada hallazgo debe decir archivo, hoja, fila, columna, regla, valor esperado, valor encontrado y efecto en el número del grupo. Un bloqueo se resuelve con una acción explícita, por ejemplo "usar la tasa del grupo".

La lista anterior es una hipótesis. En la primera hora, inspecciona los archivos y escribe la lista real de errores sembrados en `ERRORES.md`; esa lista es el marcador del equipo ante el jurado.

## 9. Fórmulas

- NOPAT = EBIT × (1 − tasa impositiva)
- Capital invertido = activos operativos − pasivos operativos sin costo (o deuda financiera + patrimonio)
- ROIC = NOPAT ÷ capital invertido
- ROCE = EBIT ÷ (activos totales − pasivos corrientes)
- EVA = NOPAT − (capital invertido × WACC)

Las tres señales del resumen:

| Señal | Cifra | Anillo |
| :--- | :--- | :--- |
| Confianza del número | filas limpias ÷ filas leídas, más pares entre empresas que cuadran | Relleno igual al porcentaje |
| Creación de valor | ROIC − WACC, en puntos | Relleno = ROIC ÷ (2 × WACC), con tope en 1; una marca a la mitad señala el WACC |
| Desviación | **Pendiente:** falta definir contra qué se compara (versión anterior, año previo o real) | Vacío hasta que haya base |

## 10. Puente y frases

El puente explica la diferencia entre sumar los seis archivos tal como vienen y el consolidado. Para una cifra dada (ingresos, EBIT o EVA):

1. Suma simple: todas las filas, con la tasa que traía cada archivo, sin eliminaciones.
2. Menos ventas entre empresas eliminadas.
3. Menos corrección de tasa de cambio.
4. Menos filas en cuarentena.
5. Igual al consolidado. Debe cerrar exacto; ponlo en una aserción.

Nota contable: eliminar una venta y su compra entre empresas baja ingresos y costos por igual, así que el EBIT casi no cambia. El puente más revelador es el de ingresos.

`explain.ts` arma la frase por plantilla con los tres mayores componentes del puente, cada uno con enlace a sus registros. El LLM puede pulirla, pero si falla se muestra la plantilla.

## 11. Pantallas

Hay wireframes de las cuatro pantallas en `wireframes/` (HTML con estilos en línea, portables a JSX). Las cifras que muestran son de ejemplo y no salen del dataset: no las copies al código.

1. **Carga** (`/carga`). Pregunta que responde: ¿qué no puede entrar al número del grupo? Tabla de archivos (empresa, archivo, formato detectado, moneda, filas, estado, enlace al mapeo) y tabla de hallazgos (regla, estado, dónde, esperado y encontrado, efecto en el grupo, acción). Acción principal: Consolidar.
2. **Mapeo** (`/carga/[empresa]/mapeo`). Pregunta: ¿se leyó bien este archivo? Estructura detectada, tabla de columnas con selector de campo del grupo, tabla de cuentas, total de control y un ejemplo de cómo queda una celda con su origen. Acción principal: Aprobar mapeo.
3. **Resumen** (`/resumen`). Pregunta: ¿está sano el grupo y se puede confiar en el número? Tres señales con anillos, EVA, ROIC y ROCE con su fórmula, y el puente con su frase.
4. **Consolidado** (`/consolidado`). Pregunta: ¿de dónde sale esta cifra? Estado de resultados (suma de empresas, eliminaciones, consolidado) con cada cifra clickeable. El panel lateral muestra fórmula, desglose por empresa con moneda local, tasa y monto convertido, eliminaciones y registros de origen.

Estilo visual (acromático, tipo libro contable):

- Fondo `#f9fafb`, tarjetas `#ffffff`, bordes `#e8e8e8`, bordes de controles `#d1d5db`.
- Texto `#111111`, secundario `#5f6368`. Sin color en la interfaz; el color queda para estados.
- Estados: positivo `#dcfae5` con texto `#04250e`, negativo `#ffedea` con texto `#831c1e`, neutro `#f1f3f4`.
- Tipografía Geist; Geist Mono solo para nombres de archivo y filas. Cifras con `tabular-nums` y alineadas a la derecha.
- Tamaños: título 24, título de tarjeta 16, cuerpo 14, etiquetas 12, cifra de KPI 26 y cifra principal 34.
- Barra superior de 48 px, columna centrada de 1208 px, controles de 32 a 36 px, radio de 6 a 8 px, sin sombras ni degradados.
- Anillos de 132 px con trazo de 5 px y la cifra al centro.

Opcional: el equipo quiere usar Taste Skill (https://www.tasteskill.dev/). Se instala con `npx skills add Leonxlnx/taste-skill`; usa su modo de pantallas de aplicación.

## 12. Orden de trabajo

Construye primero una cifra de punta a punta y luego amplía.

| Bloque | Entregable | Listo cuando |
| :--- | :--- | :--- |
| 1. Datos | `ERRORES.md`, seis `SourceMapping` en `/mappings`, respuestas a la sección 13 | Los seis archivos se leen a `Fact[]` y el total de control coincide |
| 2. Una cifra completa | Ingresos consolidados con conversión, eliminaciones y panel de auditoría | Una prueba compara el valor con un cálculo hecho a mano |
| 3. Resto del motor | Todas las reglas, estado de resultados completo, KPIs | Cada error de `ERRORES.md` tiene su hallazgo |
| 4. Interfaz | Carga, Mapeo, Consolidado | El flujo se recorre desde archivos crudos |
| 5. Resumen | Anillos, puente y frase | El puente cierra exacto |
| 6. Cierre | Respaldo precargado, guion de 3 minutos | El demo corre sin red |

## 13. Preguntas abiertas (resolver con el dataset)

1. ¿Contra qué se mide la desviación: otra versión, año previo o real?
2. ¿Los archivos traen balance, o solo estado de resultados? ROIC y ROCE necesitan balance.
3. ¿Vienen el WACC y la tasa impositiva, o hay que fijarlos como supuestos visibles?
4. ¿Viene una tabla de tasas, o cada archivo trae la suya?
5. ¿Cómo se identifica una operación entre empresas: columna de contraparte, cuenta especial o descripción?
6. ¿Cuál es la moneda del grupo? Los wireframes suponen GTQ.

## 14. Guion del demo

1. Subir los seis archivos crudos.
2. Mostrar los hallazgos con su efecto en dinero y resolver un bloqueo en vivo.
3. Abrir el resumen: tres anillos y la frase del puente.
4. Cerrar con un clic en una cifra hasta llegar al archivo y la fila que traía el error.

Ten siempre un estado precargado por si falla la carga o la red.

## 15. Primer mensaje sugerido para Claude Code

> Lee `PULSEGROUP_HANDOFF.md` completo. Luego inspecciona los archivos de `/data` y, antes de escribir código de producto, entrégame: (1) `ERRORES.md` con los errores sembrados que encuentres, con archivo y fila; (2) un `SourceMapping` propuesto por archivo en `/mappings`; (3) respuestas a las preguntas de la sección 13. Después arma el proyecto con la estructura de la sección 5 y construye el bloque 2.
