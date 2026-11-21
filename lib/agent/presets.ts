/**
 * The three fixed questions. Each one has the prompt the agent receives and a template answer built
 * by code from the same tool outputs, which is what shows when there is no model.
 */
import { RULE_NAMES } from '@/components/load/labels';
import { buildProposal, isCorrectable, suggestAccount } from './proposals';
import { findingView, findingsByImpact, runTool } from './tools';
import type { AgentContext, Proposal } from './types';

export type PresetId = 'cerrar' | 'puente' | 'empresas' | 'lectura';

export const PRESETS: { id: PresetId; label: string; prompt: string; tools: string[] }[] = [
  {
    id: 'cerrar',
    label: '¿Qué falta para cerrar el número del grupo?',
    prompt:
      '¿Qué falta para cerrar el número del grupo? Lista los hallazgos abiertos del mayor al menor efecto en el grupo. Para cada uno que la app pueda corregir, propón la corrección con proponer_correccion; para los demás, di que los tiene que corregir la empresa.',
    tools: ['listar_hallazgos'],
  },
  {
    id: 'puente',
    label: '¿Por qué el consolidado no es la suma simple?',
    prompt:
      '¿Por qué el consolidado no es la suma simple de los seis archivos? Explícalo para ingresos, EBIT y EVA con los componentes principales del puente.',
    tools: ['ver_puente'],
  },
  {
    id: 'empresas',
    label: '¿Qué le pido a cada empresa?',
    prompt:
      '¿Qué le pido a cada empresa? Escribe un mensaje corto por empresa con lo que tiene que corregir en su archivo: archivo, hoja, fila, qué se esperaba y qué se encontró. Incluye solo los hallazgos abiertos que la app no puede corregir.',
    tools: ['listar_hallazgos'],
  },
];

/**
 * The quick reading at the top of Consolidado. Not one of the sidebar's questions: the page asks it
 * by itself, so a board member gets the story before the table.
 */
export const READING: (typeof PRESETS)[number] = {
  id: 'lectura',
  label: 'Lectura rápida del consolidado',
  prompt:
    'Haz una lectura rápida del estado de resultados consolidado para la junta directiva, en 3 o 4 viñetas de una oración cada una, sin introducción ni cierre y sin enlaces: 1) el número: ingresos, EBIT con su margen y utilidad neta; 2) por qué el consolidado no es la suma simple de los archivos, con el puente de ingresos; 3) quién crea y quién destruye valor; 4) solo si hay hallazgos abiertos, qué falta antes de presentarlo.',
  tools: ['resumen_grupo', 'ver_puente'],
};

export const presetById = (id: string) => [...PRESETS, READING].find((p) => p.id === id);

/** "e1_presupuesto.xlsx, hoja Presupuesto, fila 121". A csv has no sheets. */
const placeText = (p: { archivo: string; hoja: string; fila: number }) =>
  /\.csv$/i.test(p.archivo) ? `${p.archivo}, fila ${p.fila}` : `${p.archivo}, hoja ${p.hoja}, fila ${p.fila}`;

/** The proposal the template makes for a correctable finding: its own action, with the mapping heuristic for accounts. */
export function templateProposal(ctx: AgentContext, findingId: string): Proposal | null {
  const f = ctx.r.findings.find((x) => x.id === findingId);
  if (!f || !isCorrectable(f)) return null;
  let groupAccount: string | undefined;
  let reason = `La app lo corrige con la acción del hallazgo: ${f.action.label.toLowerCase()}.`;
  if (f.action.kind === 'map-account') {
    groupAccount = suggestAccount(
      ctx.mappings.find((m) => m.companyId === f.companyIds[0]),
      f.action.localAccount,
    );
    if (!groupAccount) return null;
    reason = `Es la cuenta del grupo de las cuentas hermanas de ${f.action.localAccount} en el mismo plan.`;
  }
  if (f.action.kind === 'exclude')
    reason =
      'Dejarlo fuera saca solo lo afectado y deja entrar el resto; la corrección de fondo la hace la empresa.';
  const res = buildProposal(ctx, { findingId, groupAccount, reason });
  return res.ok ? res.proposal : null;
}

function closeTheNumber(ctx: AgentContext) {
  const open = findingsByImpact(ctx);
  if (!open.length)
    return { text: 'No queda ningún hallazgo abierto. El número del grupo está listo.', proposals: [] };
  const proposals: Proposal[] = [];
  const lines = open.map((f) => {
    const v = findingView(ctx, f);
    const p = templateProposal(ctx, f.id);
    if (p) proposals.push(p);
    const next = p
      ? `Propuesta: ${p.actionLabel.charAt(0).toLowerCase()}${p.actionLabel.slice(1)}.`
      : 'Lo corrige la empresa en su archivo.';
    return `- **${v.nombreRegla} · ${v.empresas.join(' y ')}.** ${v.efecto}. ${next} [Ver en Configuración](${v.enlace})`;
  });
  const fixable = open.filter(isCorrectable).length;
  const intro = `Hay ${open.length} hallazgos abiertos; ${fixable} se pueden corregir aquí y ${open.length - fixable} los tiene que corregir la empresa. Del mayor al menor efecto en el grupo:`;
  return { text: [intro, '', ...lines].join('\n'), proposals };
}

function bridge(ctx: AgentContext) {
  const parts = (['revenue', 'ebit', 'eva'] as const).map((metric) => {
    const out = JSON.parse(runTool(ctx, 'ver_puente', { metrica: metric }).content) as {
      metrica: string;
      frase: string;
      pasos: { paso: string; monto: string; partes: { concepto: string; monto: string }[] }[];
    };
    const steps = out.pasos
      .filter((s) => s.monto !== 'Q\u00a00')
      .map(
        (s) =>
          `- ${s.paso}: ${s.monto}${s.partes[0] ? ` (la mayor parte: ${s.partes[0].concepto}, ${s.partes[0].monto})` : ''}`,
      );
    return [`**${out.metrica}.** ${out.frase}`, ...steps].join('\n');
  });
  return { text: [...parts, '[Ver el puente en Resumen](/summary#puente)'].join('\n\n'), proposals: [] };
}

function perCompany(ctx: AgentContext) {
  const pending = findingsByImpact(ctx, (f) => f.status === 'open' && !isCorrectable(f));
  if (!pending.length)
    return { text: 'Ninguna empresa tiene que corregir nada en su archivo.', proposals: [] };
  const blocks = ctx.r.companies
    .map((c) => {
      const mine = pending.filter((f) => f.companyIds.includes(c.id));
      if (!mine.length) return null;
      const items = mine.map((f) => {
        const v = findingView(ctx, f);
        const where =
          f.places
            .filter((p) => p.file === c.file)
            .map((p) => ({ archivo: p.file, hoja: p.sheet, fila: p.row }))[0] ?? v.donde[0];
        const loc = where ? placeText(where) : c.file;
        return `- ${RULE_NAMES[f.ruleId]} (${loc}). Se esperaba: ${v.esperado}. Se encontró: ${v.encontrado}.`;
      });
      return [`**${c.name}** · ${c.file}`, `Por favor revisen y envíen el archivo corregido:`, ...items].join(
        '\n',
      );
    })
    .filter(Boolean);
  return { text: blocks.join('\n\n'), proposals: [] };
}

const listEs = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

/** The quick reading by template: the same tools the agent reads, put into four sentences. */
function quickRead(ctx: AgentContext) {
  const s = JSON.parse(runTool(ctx, 'resumen_grupo', {}).content) as {
    ingresos: string;
    ebit: string;
    margenEbit: string;
    utilidadNeta: string;
    roic: string;
    wacc: string;
    creaValor: boolean;
    hallazgosAbiertos: { bloqueo: number; cuarentena: number; aviso: number };
    empresas: { nombre: string; creaValor: boolean | null }[];
  };
  const b = JSON.parse(runTool(ctx, 'ver_puente', { metrica: 'revenue' }).content) as { frase: string };
  const destroyers = s.empresas.filter((e) => e.creaValor === false).map((e) => e.nombre);
  const { bloqueo, cuarentena } = s.hallazgosAbiertos;
  const lines = [
    `- **El número:** ingresos ${s.ingresos}, EBIT ${s.ebit} (${s.margenEbit} de margen) y utilidad neta ${s.utilidadNeta}.`,
    `- **Contra la suma de los archivos:** ${b.frase}`,
    `- **Valor:** el grupo ${s.creaValor ? 'crea' : 'destruye'} valor: su capital rinde ${s.roic} y cuesta ${s.wacc}.${
      destroyers.length ? ` Destruyen valor ${listEs(destroyers)}.` : ' Todas las empresas rinden más de lo que cuesta su capital.'
    }`,
    bloqueo + cuarentena
      ? `- **Antes de presentarlo:** ${bloqueo} ${bloqueo === 1 ? 'bloqueo' : 'bloqueos'} y ${cuarentena} ${cuarentena === 1 ? 'hallazgo' : 'hallazgos'} en cuarentena dejan filas fuera del número.`
      : '- **Listo:** no hay hallazgos abiertos; el número se puede presentar a la junta directiva.',
  ];
  return { text: lines.join('\n'), proposals: [] };
}

export function templateAnswer(id: PresetId, ctx: AgentContext): { text: string; proposals: Proposal[] } {
  if (id === 'cerrar') return closeTheNumber(ctx);
  if (id === 'puente') return bridge(ctx);
  if (id === 'lectura') return quickRead(ctx);
  return perCompany(ctx);
}
