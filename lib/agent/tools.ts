/**
 * The agent's tools. Each one reads the PipelineResult the screens already show and returns figures
 * formatted the way the screens write them, so the agent can quote them and the verifier can find
 * them. None of them changes anything: `proponer_correccion` only records a proposal.
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { RULE_NAMES } from '@/components/load/labels';
import { ACCOUNT, ACCOUNTS, PL_LINES, lineAccounts } from '@/lib/engine/catalog';
import type { BridgeMetric } from '@/lib/engine/bridge';
import { plain } from '@/lib/engine/explain';
import type { Finding, RuleId, Severity } from '@/lib/engine/types';
import { local, money, monthName, pct, rate } from '@/lib/format';
import { buildProposal, isCorrectable, suggestAccount } from './proposals';
import type { AgentContext, Proposal } from './types';

const RULES = Object.keys(RULE_NAMES) as RuleId[];
const METRICS: BridgeMetric[] = ['revenue', 'ebit', 'eva'];
const METRIC_NAME: Record<BridgeMetric, string> = { revenue: 'Ingresos', ebit: 'EBIT', eva: 'EVA' };
/**
 * Strict tool schemas list every field as required (Meta's Messages surface insists, Anthropic accepts
 * it); a field the model may leave out is nullable, and null means "no filter".
 */
const optionalString = (description: string) => ({ type: ['string', 'null'], description });
const optionalEnum = (values: string[], description: string) => ({
  anyOf: [{ type: 'string', enum: values }, { type: 'null' }],
  description,
});

const SEVERITY_NAME: Record<Severity, string> = {
  block: 'bloqueo',
  quarantine: 'cuarentena',
  warning: 'aviso',
};

export const TOOLS: BetaTool[] = [
  {
    name: 'resumen_grupo',
    description:
      'Las cifras principales del grupo ya consolidado (ingresos, EBIT, utilidad neta, EVA, ROIC, ROCE, WACC), cuántos hallazgos siguen abiertos por severidad, y de cada empresa su estado, sus ingresos al grupo, su ROIC y si crea valor (ROIC mayor o igual al WACC del grupo). Úsala para empezar casi cualquier pregunta general.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'listar_hallazgos',
    description:
      'Los errores que el motor encontró en los archivos, ordenados por su efecto en el número del grupo (el mayor primero). Cada hallazgo trae dónde está (archivo, hoja, fila), qué se esperaba, qué se encontró, su efecto, y si la app lo puede corregir (corregibleEnApp). Sin filtros devuelve los abiertos.',
    input_schema: {
      type: 'object',
      properties: {
        empresa: optionalString(
          'El id o el nombre de una empresa, como los da resumen_grupo; null para todas.',
        ),
        regla: optionalEnum(RULES, 'Una regla; null para todas.'),
        severidad: optionalEnum(['bloqueo', 'cuarentena', 'aviso'], 'null para todas.'),
        estado: optionalEnum(['abierto', 'resuelto', 'todos'], 'null es abierto.'),
      },
      required: ['empresa', 'regla', 'severidad', 'estado'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'ver_puente',
    description:
      'El puente de la suma simple de los seis archivos al consolidado, para ingresos, EBIT o EVA: cuánto quitan las ventas entre empresas, la corrección de tasas de cambio y las filas con error, con el detalle de cada paso.',
    input_schema: {
      type: 'object',
      properties: { metrica: { type: 'string', enum: METRICS } },
      required: ['metrica'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'ver_cifra',
    description: `Una cifra del consolidado y de dónde sale: el aporte de cada empresa en su moneda, la tasa, el monto en quetzales y las eliminaciones. "cuenta" es una línea del estado de resultados (${PL_LINES.map((l) => `${l.id} = ${l.label}`).join(', ')}) o una cuenta del catálogo. Sin mes, el año completo (o el cierre de diciembre para cuentas de balance).`,
    input_schema: {
      type: 'object',
      properties: {
        cuenta: { type: 'string' },
        mes: optionalString('YYYY-MM, por ejemplo 2027-03; null para el año.'),
        empresa: optionalString(
          'El id o el nombre de una empresa, como los da resumen_grupo; null para todas.',
        ),
      },
      required: ['cuenta', 'mes', 'empresa'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'catalogo_cuentas',
    description:
      'El plan de cuentas del grupo. Úsalo para elegir la cuenta del grupo al proponer el mapeo de una cuenta local.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'proponer_correccion',
    description:
      'Propone a la persona corregir un hallazgo con la acción que la app ya permite. No aplica nada: la persona ve la propuesta con su razón y decide. Solo sirve para hallazgos abiertos con corregibleEnApp = true. Para "map-account" hace falta cuentaGrupo, una cuenta del catálogo.',
    input_schema: {
      type: 'object',
      properties: {
        hallazgo: { type: 'string', description: 'El id del hallazgo, tal como lo da listar_hallazgos.' },
        cuentaGrupo: optionalString('Solo para map-account: el código de la cuenta del grupo; si no, null.'),
        razon: { type: 'string', description: 'Una o dos frases: por qué esta corrección es la correcta.' },
      },
      required: ['hallazgo', 'cuentaGrupo', 'razon'],
      additionalProperties: false,
    },
    strict: true,
  },
];

// ---------------------------------------------------------------- helpers

function companyId(ctx: AgentContext, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const s = ref.trim().toLowerCase();
  return ctx.r.companies.find((c) => c.id.toLowerCase() === s || c.name.toLowerCase() === s)?.id;
}

const companyList = (ctx: AgentContext) => ctx.r.companies.map((c) => c.id).join(', ');

const companyName = (ctx: AgentContext, id: string) => ctx.r.companies.find((c) => c.id === id)?.name ?? id;

const impactOf = (f: Finding) => Math.abs(f.groupImpact?.cents ?? 0);

/** Open findings first in the engine's order; the agent's lists go by effect on the group. */
export function findingsByImpact(
  ctx: AgentContext,
  filter: (f: Finding) => boolean = (f) => f.status === 'open',
) {
  return ctx.r.findings.filter(filter).sort((a, b) => impactOf(b) - impactOf(a));
}

export function findingView(ctx: AgentContext, f: Finding) {
  const mapping =
    f.action.kind === 'map-account' ? ctx.mappings.find((m) => m.companyId === f.companyIds[0]) : undefined;
  const suggested =
    f.action.kind === 'map-account' ? suggestAccount(mapping, f.action.localAccount) : undefined;
  const localFact =
    f.action.kind === 'map-account' ? ctx.r.facts.find((x) => f.factIds.includes(x.id)) : undefined;
  return {
    id: f.id,
    regla: f.ruleId,
    nombreRegla: RULE_NAMES[f.ruleId],
    severidad: SEVERITY_NAME[f.severity],
    estado: f.status === 'open' ? 'abierto' : 'resuelto',
    empresas: f.companyIds.map((id) => companyName(ctx, id)),
    donde: f.places.slice(0, 3).map((p) => ({
      archivo: p.file,
      hoja: p.sheet,
      fila: p.row,
      ...(p.column ? { columna: p.column } : {}),
    })),
    esperado: f.expected,
    encontrado: f.actual,
    efecto: f.impactText,
    impactoEnGrupo:
      f.groupImpact && f.groupImpact.metric !== 'none' ? money(Math.abs(f.groupImpact.cents)) : null,
    corregibleEnApp: isCorrectable(f),
    accion: isCorrectable(f) ? { tipo: f.action.kind, boton: f.action.label } : null,
    ...(f.action.kind === 'map-account'
      ? {
          cuentaLocal: f.action.localAccount,
          nombreCuentaLocal: localFact?.localName ?? null,
          sugerencia: suggested ? `${suggested} ${ACCOUNT.get(suggested)?.name ?? ''}`.trim() : null,
        }
      : {}),
    enlace: `/load#${encodeURIComponent(f.id)}`,
  };
}

export type FigureBreakdown = {
  accounts: string[];
  period: string | null;
  companies: { id: string; currency: string; amountLocal: number; cents: number; rate: number | null }[];
  eliminations: number;
  consolidated: number;
};

/** A consolidated figure from the engine's cells: what each company brings and what is eliminated. */
export function figureOf(
  ctx: AgentContext,
  account: string,
  period: string | null,
  company?: string,
): FigureBreakdown | null {
  const accounts = lineAccounts(account);
  if (!accounts.length) return null;
  const balance = accounts.every((a) => ACCOUNT.get(a)?.statement === 'BS');
  const when = period ?? (balance ? ctx.r.closingPeriod : null);
  const set = new Set(accounts);
  const adj = new Map(ctx.r.adjustments.map((a) => [a.id, a.cents]));
  const per = new Map<string, FigureBreakdown['companies'][number]>();
  let eliminations = 0;
  for (const c of ctx.r.cells) {
    if (!set.has(c.groupAccount) || (when && c.period !== when)) continue;
    if (!company) eliminations += c.adjustmentIds.reduce((a, id) => a + (adj.get(id) ?? 0), 0);
    for (const x of c.contributions) {
      if (company && x.companyId !== company) continue;
      const currency = ctx.r.companies.find((k) => k.id === x.companyId)?.currency ?? '';
      const row = per.get(x.companyId) ?? {
        id: x.companyId,
        currency,
        amountLocal: 0,
        cents: 0,
        rate: x.rate,
      };
      row.amountLocal += x.amountLocal;
      row.cents += x.cents;
      if (row.rate !== x.rate) row.rate = null; // several rates over the year
      per.set(x.companyId, row);
    }
  }
  const companies = [...per.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sum = companies.reduce((a, x) => a + x.cents, 0);
  return { accounts, period: when, companies, eliminations, consolidated: sum + eliminations };
}

const lineLabel = (id: string) => PL_LINES.find((l) => l.id === id)?.label ?? ACCOUNT.get(id)?.name ?? id;

// ---------------------------------------------------------------- run

export type ToolOutcome = { content: string; isError?: boolean; proposal?: Proposal };

const ok = (value: unknown): ToolOutcome => ({ content: JSON.stringify(value) });
const fail = (message: string): ToolOutcome => ({ content: message, isError: true });

/** A string argument, or undefined when absent. Some models write null as the text "null". */
const NULL_LIKE = new Set(['', 'null', 'none', 'undefined', 'nil']);
const str = (v: unknown) =>
  typeof v === 'string' && !NULL_LIKE.has(v.trim().toLowerCase()) ? v.trim() : undefined;

export function runTool(ctx: AgentContext, name: string, input: Record<string, unknown>): ToolOutcome {
  const { r } = ctx;
  switch (name) {
    case 'resumen_grupo': {
      const line = (id: string) => r.pl.find((l) => l.id === id)!.consolidated;
      const open = r.findings.filter((f) => f.status === 'open');
      const count = (s: Severity) => open.filter((f) => f.severity === s).length;
      const revenue = line('revenue');
      return ok({
        ejercicio: r.fiscalYear,
        moneda: r.assumptions.groupCurrency,
        ingresos: money(revenue),
        ebit: money(line('ebit')),
        margenEbit: pct(revenue ? line('ebit') / revenue : 0),
        utilidadNeta: money(line('net')),
        eva: money(r.kpis.eva),
        roic: pct(r.kpis.roic),
        roce: pct(r.kpis.roce),
        wacc: pct(r.assumptions.wacc),
        creaValor: r.kpis.roic >= r.assumptions.wacc,
        sumaSimpleIngresos: money(r.bridges.revenue.simple),
        hallazgosAbiertos: {
          bloqueo: count('block'),
          cuarentena: count('quarantine'),
          aviso: count('warning'),
        },
        filasLimpias: `${r.confidence.rowsClean} de ${r.confidence.rowsRead}`,
        empresas: r.companies.map((c) => ({
          id: c.id,
          nombre: c.name,
          archivo: c.file,
          moneda: c.currency,
          estado: c.state.text,
          ingresosAlGrupo: money(r.plByCompany.revenue?.[c.id] ?? 0),
          // Same rule as the Summary screen: capital that earns less than the group's WACC destroys value.
          roic: r.companyKpis[c.id]?.capital ? pct(r.companyKpis[c.id].roic) : null,
          creaValor: r.companyKpis[c.id]?.capital ? r.companyKpis[c.id].roic >= r.assumptions.wacc : null,
        })),
      });
    }
    case 'listar_hallazgos': {
      const company = companyId(ctx, str(input.empresa));
      if (str(input.empresa) && !company)
        return fail(`No conozco la empresa "${input.empresa}". Las empresas son: ${companyList(ctx)}.`);
      const estado = str(input.estado) ?? 'abierto';
      const severidad = str(input.severidad);
      const regla = str(input.regla);
      // An unknown filter is an error, never an empty list: an empty list reads as "nothing to fix".
      if (!['abierto', 'resuelto', 'todos'].includes(estado))
        return fail('estado tiene que ser abierto, resuelto o todos.');
      if (severidad && !Object.values(SEVERITY_NAME).includes(severidad))
        return fail('severidad tiene que ser bloqueo, cuarentena o aviso.');
      if (regla && !RULES.includes(regla as RuleId))
        return fail(`regla tiene que ser una de: ${RULES.join(', ')}.`);
      const list = findingsByImpact(
        ctx,
        (f) =>
          (estado === 'todos' || (estado === 'abierto' ? f.status === 'open' : f.status === 'resolved')) &&
          (!company || f.companyIds.includes(company)) &&
          (!severidad || SEVERITY_NAME[f.severity] === severidad) &&
          (!regla || f.ruleId === regla),
      );
      return ok({ total: list.length, hallazgos: list.map((f) => findingView(ctx, f)) });
    }
    case 'ver_puente': {
      const metric = str(input.metrica) as BridgeMetric | undefined;
      if (!metric || !METRICS.includes(metric)) return fail('metrica tiene que ser revenue, ebit o eva.');
      const b = r.bridges[metric];
      return ok({
        metrica: METRIC_NAME[metric],
        sumaSimple: money(b.simple),
        consolidado: money(b.consolidated),
        diferencia: money(b.consolidated - b.simple, { sign: true }),
        frase: plain(r.sentences[metric]),
        pasos: b.steps.map((s) => ({
          paso: s.label,
          monto: money(s.cents, { sign: true }),
          partes: s.parts
            .slice(0, 6)
            .map((p) => ({ concepto: p.label, monto: money(p.cents, { sign: true }), enlace: p.href })),
        })),
        enlace: '/summary#puente',
      });
    }
    case 'ver_cifra': {
      const account = str(input.cuenta);
      const period = str(input.mes) ?? null;
      if (!account) return fail('Falta la cuenta.');
      if (period && !/^\d{4}-\d{2}$/.test(period)) return fail('mes tiene que ser YYYY-MM.');
      if (period && !period.startsWith(String(r.fiscalYear)))
        return fail(`Solo hay datos de ${r.fiscalYear}.`);
      const company = companyId(ctx, str(input.empresa));
      if (str(input.empresa) && !company)
        return fail(`No conozco la empresa "${input.empresa}". Las empresas son: ${companyList(ctx)}.`);
      const fig = figureOf(ctx, account, period, company);
      if (!fig)
        return fail(
          `No conozco la cuenta "${account}". Líneas válidas: ${PL_LINES.map((l) => l.id).join(', ')}; o un código de catalogo_cuentas.`,
        );
      return ok({
        cuenta: account,
        nombre: lineLabel(account),
        periodo: fig.period ? `${monthName(fig.period)} ${fig.period.slice(0, 4)}` : `año ${r.fiscalYear}`,
        consolidado: company ? null : money(fig.consolidated),
        sumaEmpresas: money(fig.companies.reduce((a, x) => a + x.cents, 0)),
        eliminaciones: company ? null : money(fig.eliminations),
        porEmpresa: fig.companies.map((x) => ({
          empresa: companyName(ctx, x.id),
          montoLocal: local(x.amountLocal, x.currency),
          tasa: x.rate === null ? 'varias, una por mes' : rate(x.rate),
          enQuetzales: money(x.cents),
        })),
        enlace: `/consolidated?line=${encodeURIComponent(account)}`,
      });
    }
    case 'catalogo_cuentas':
      return ok({
        cuentas: ACCOUNTS.map((a) => ({
          codigo: a.code,
          nombre: a.name,
          estado: a.statement === 'PL' ? 'resultados' : 'balance',
          tipo: a.kind,
        })),
      });
    case 'proponer_correccion': {
      const res = buildProposal(ctx, {
        findingId: str(input.hallazgo) ?? '',
        groupAccount: str(input.cuentaGrupo),
        reason: str(input.razon) ?? '',
      });
      if (!res.ok) return fail(res.error);
      return {
        content: JSON.stringify({
          propuesta: 'registrada',
          titulo: res.proposal.title,
          boton: res.proposal.actionLabel,
        }),
        proposal: res.proposal,
      };
    }
    default:
      return fail(`No existe la herramienta ${name}.`);
  }
}
