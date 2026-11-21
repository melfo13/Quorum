# Agente sobre la data procesada

Estado: **aprobada e implementada**. Probada con el modelo simulado; falta la prueba con Claude (AC4 depende del modelo real).

## Intención

Quien revisa el presupuesto del grupo quiere preguntarle a la app por la data ya consolidada, en
lenguaje normal, y que la respuesta le diga qué está mal, por qué el número es el que es y qué hacer.
El agente nunca lee los xlsx ni calcula cifras: consulta el resultado que ya produjo el motor
(`runPipeline`) y responde con esas cifras. Cuando un error se puede corregir dentro de la app, el
agente propone la corrección y la persona la aprueba con un clic.

## Contrato observable

### Sidebar "Agente", en todas las pantallas

- El botón **Agente** de la barra superior abre una columna a la derecha. Empuja la página (la hace
  más angosta, no la tapa), se ensancha arrastrando su borde o con el botón de ampliar, y la
  conversación sigue al cambiar de pantalla. En teléfono se abre a pantalla completa.
- Tres preguntas fijas como botones:
  1. **¿Qué falta para cerrar el número del grupo?** Hallazgos abiertos, ordenados por impacto en el
     grupo, cada uno con su propuesta de corrección cuando existe.
  2. **¿Por qué el consolidado no es la suma simple?** El puente de ingresos, EBIT y EVA con sus
     componentes principales.
  3. **¿Qué le pido a cada empresa?** Un mensaje por empresa con lo que tiene que corregir en su
     archivo: archivo, hoja, fila, valor esperado y valor encontrado.
- Un campo de texto para preguntas libres ("¿cuánto vende la Empresa 3 en marzo?", "¿qué empresa
  tiene más ventas entre compañías sin conciliar?"). La conversación sigue mientras la pestaña esté
  abierta y empieza de nuevo si cambia la data cargada.
- Si no hay data cargada, el sidebar lo dice y enlaza a Carga.

### Herramientas del agente (solo lectura, sobre la data del visitante)

| Herramienta           | Devuelve                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `resumen_grupo`       | Ingresos, EBIT, EVA, ROIC, ROCE del grupo; hallazgos por severidad; estado de cada empresa                         |
| `listar_hallazgos`    | Hallazgos con filtros (empresa, regla, severidad, estado): lugar, esperado, encontrado, impacto, acción disponible |
| `ver_puente`          | Pasos del puente para una métrica, con sus partes                                                                  |
| `ver_cifra`           | Una cuenta del grupo (y mes opcional): aporte por empresa con monto local, tasa y monto convertido, eliminaciones  |
| `catalogo_cuentas`    | Plan de cuentas del grupo, para proponer mapeos                                                                    |
| `proponer_correccion` | Registra una propuesta; **no la aplica**                                                                           |

### Correcciones

- `proponer_correccion` solo acepta la acción que el hallazgo ya permite (`use-group-rate`,
  `fix-sign`, `map-account`, `exclude`). Para `map-account`, la cuenta propuesta tiene que existir en
  el catálogo. Cualquier otra cosa se rechaza y el agente recibe el error.
- La propuesta se muestra en la respuesta como tarjeta con la razón y dos botones: **Aplicar** llama a
  la server action que ya existe (`resolveFinding`, `fixSign`, `mapAccount`); **Descartar** no hace
  nada. Al aplicar, el motor recalcula y la corrección se ve en `/load`, `/summary` y `/consolidated`.
- Los hallazgos que la app no puede corregir (`DUPLICATE_ROW`, `SUBTOTAL_MISMATCH`, `IC_ASYMMETRIC`,
  `IC_MISSING`, `KPI_MISMATCH`) solo se explican y entran en la pregunta 3.

### Cifras verificadas

Cada monto y porcentaje de la respuesta tiene que aparecer en lo que devolvieron las herramientas en
esa conversación. Un verificador determinista lo revisa antes de mostrar la respuesta. Si una cifra no
cuadra, se pide una corrección al modelo una vez; si sigue sin cuadrar, la respuesta se muestra con la
cifra marcada como no verificada.

### Sin LLM

Sin `ANTHROPIC_API_KEY` o si la API falla: las preguntas 1 y 2 se responden con plantilla (como hoy
`explain.ts`), la 3 con una lista por empresa armada por código, y las preguntas libres muestran que el
agente no está disponible. El resto de la app funciona igual.

## Criterios de aceptación

- **AC1** La pregunta 1 lista los hallazgos abiertos ordenados por impacto absoluto, con enlace a
  `/load`, y trae propuesta para cada hallazgo corregible.
- **AC2** Las cifras de la pregunta 2 coinciden al centavo con `buildBridge` para las tres métricas.
- **AC3** La pregunta 3 agrupa por empresa solo los hallazgos que la app no puede corregir, con
  archivo, hoja, fila, esperado y encontrado.
- **AC4** Una pregunta libre sobre la data se responde usando herramientas. Una pregunta fuera de la
  data ("¿qué tasa tendrá el dólar en 2028?") recibe un "no lo puedo responder con esta data".
- **AC5** Aplicar una propuesta cambia el resultado del motor igual que usar el botón del hallazgo en
  `/load`. Una propuesta inválida (acción que el hallazgo no permite, cuenta fuera del catálogo) nunca
  llega a la pantalla. El agente no puede cambiar la data por sí solo.
- **AC6** Una respuesta con una cifra que no salió de las herramientas no se muestra como verificada.
- **AC7** Sin API key la app arranca, las preguntas 1 a 3 responden con plantilla y las libres muestran
  el aviso.
- **AC8** Pruebas sin red para: cada herramienta contra `data/_truth`, el validador de propuestas y el
  verificador de cifras. `pnpm test` y `pnpm run lint` pasan.

## Fuera de alcance

- Editar los xlsx o csv de origen.
- Proponer un `SourceMapping` completo de un archivo nuevo (solo cuentas sueltas sin mapear).
- Guardar conversaciones entre visitas.
- Respuesta en streaming (se puede agregar después; el MVP muestra un indicador de espera).

## Decisiones técnicas

- **Modelo:** `claude-opus-5-5` por defecto (`PULSEGROUP_MODEL` lo cambia), esfuerzo `medium`, con
  `fallbacks: "default"` para que una negativa del modelo se reintente en otro. Con
  `ANTHROPIC_BASE_URL` (un gateway compatible con la API de Anthropic) no se envía `fallbacks`,
  porque es una beta de api.anthropic.com que un gateway puede rechazar.
- **Dónde corre el bucle:** en la ruta `POST /api/ask` de Next.js, con un bucle propio sobre el SDK. Las
  herramientas leen el `PipelineResult` en memoria del mismo request, así que no hace falta un
  sandbox. La alternativa sería Managed Agents (Anthropic aloja el bucle), pero las herramientas
  tendrían que volver a nuestro servidor en cada llamada y el demo sería más lento.
- **Qué sale de la máquina:** cifras ya procesadas y textos de hallazgos, nunca los archivos.
- **SDK:** la red del evento no llega a npm. `@anthropic-ai/sdk` 0.129.0 está en la caché local de
  npm; se copia a `vendor/` igual que `@types/react`.
- **Key:** `ANTHROPIC_API_KEY` en `.env.local`, que ya está en `.gitignore`.
