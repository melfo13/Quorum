import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset, runPipeline } from '@/lib/engine/pipeline';
import { NO_RESOLUTIONS } from '@/lib/engine/types';
import { money } from '@/lib/format';
import { answerQuestion } from './answer';
import { agentMode, agentModel, isDirect } from './config';
import { PRESETS, READING, presetById, templateAnswer } from './presets';
import { applyToResolutions, buildProposal, isCorrectable } from './proposals';
import { runAgent, type CreateMessage } from './run';
import { fakeMessage, simulatedModel } from './simulated';
import { TOOLS, figureOf, runTool } from './tools';
import type { AgentContext } from './types';
import { unverifiedFigures } from './verify';

// The agent tests run on a frozen copy of the original practice set, so they do not change when the
// team replaces data/: it carries one finding of every kind the agent handles.
const FIXTURE = path.join(__dirname, '__fixtures__', 'practice');
const ds = loadDataset(path.join(FIXTURE, 'data'), path.join(FIXTURE, 'mappings'));
const r = runPipeline(ds, NO_RESOLUTIONS);
const ctx: AgentContext = { r, mappings: ds.mappings };
const json = (name: string, input: Record<string, unknown> = {}) =>
  JSON.parse(runTool(ctx, name, input).content);
const find = (rule: string) => r.findings.find((f) => f.ruleId === rule && f.status === 'open')!;

/** A scripted model: one response per call, in order. */
const script = (...replies: ReturnType<typeof fakeMessage>[]): CreateMessage => {
  let i = 0;
  return async () => replies[Math.min(i++, replies.length - 1)];
};

describe('tools', () => {
  it('declare every field as required, as strict tool schemas need on every provider', () => {
    for (const t of TOOLS) {
      const schema = t.input_schema as { properties: Record<string, unknown>; required: string[] };
      expect(schema.required.sort(), t.name).toEqual(Object.keys(schema.properties).sort());
    }
  });

  it('read the text "null" as no filter, and refuse filters they do not know', () => {
    const all = json('listar_hallazgos', {
      empresa: 'null',
      regla: 'null',
      severidad: 'None',
      estado: 'abierto',
    });
    expect(all.total).toBe(r.findings.filter((f) => f.status === 'open').length);
    expect(runTool(ctx, 'listar_hallazgos', { regla: 'DUPLICADA' }).isError).toBe(true);
    expect(runTool(ctx, 'listar_hallazgos', { severidad: 'alta' }).isError).toBe(true);
    expect(json('ver_cifra', { cuenta: 'revenue', mes: 'null', empresa: 'null' }).periodo).toBe('año 2027');
  });

  it('treat null as no filter', () => {
    const all = json('listar_hallazgos', { empresa: null, regla: null, severidad: null, estado: null });
    expect(all.total).toBe(r.findings.filter((f) => f.status === 'open').length);
    const year = json('ver_cifra', { cuenta: 'revenue', mes: null, empresa: null });
    expect(year.periodo).toBe('año 2027');
  });

  it('report the group figures the screens show', () => {
    const s = json('resumen_grupo');
    expect(s.ingresos).toBe(money(r.pl.find((l) => l.id === 'revenue')!.consolidated));
    expect(s.eva).toBe(money(r.kpis.eva));
    expect(s.empresas).toHaveLength(6);
    // Who destroys value, by the same rule as the Summary screen.
    for (const e of s.empresas as { id: string; creaValor: boolean | null }[]) {
      const k = r.companyKpis[e.id];
      if (k?.capital) expect(e.creaValor).toBe(k.roic >= r.assumptions.wacc);
    }
  });

  it('list open findings by absolute effect on the group, largest first', () => {
    const list = json('listar_hallazgos').hallazgos as { id: string; estado: string }[];
    expect(list.length).toBe(r.findings.filter((f) => f.status === 'open').length);
    const cents = list.map((h) => Math.abs(r.findings.find((f) => f.id === h.id)!.groupImpact?.cents ?? 0));
    expect(cents).toEqual([...cents].sort((a, b) => b - a));
    expect(list.every((h) => h.estado === 'abierto')).toBe(true);
  });

  it('filter findings by company and refuse an unknown one', () => {
    const e3 = json('listar_hallazgos', { empresa: 'Empresa 3' }).hallazgos as { empresas: string[] }[];
    expect(e3.length).toBeGreaterThan(0);
    expect(e3.every((h) => h.empresas.includes('Empresa 3'))).toBe(true);
    expect(runTool(ctx, 'listar_hallazgos', { empresa: 'Empresa 9' }).isError).toBe(true);
  });

  it('break a figure down so it adds up to the income statement (AC2 sibling)', () => {
    for (const line of ['revenue', 'ebit', '4100']) {
      const fig = figureOf(ctx, line, null)!;
      expect(fig.consolidated).toBe(r.pl.find((l) => l.id === line)!.consolidated);
    }
    const march = figureOf(ctx, 'revenue', '2027-03', 'E3')!;
    expect(march.companies.map((c) => c.id)).toEqual(['E3']);
    expect(march.companies[0].rate).not.toBeNull();
  });

  it('give the bridge with the engine figures (AC2)', () => {
    for (const metric of ['revenue', 'ebit', 'eva'] as const) {
      const b = json('ver_puente', { metrica: metric });
      expect(b.sumaSimple).toBe(money(r.bridges[metric].simple));
      expect(b.consolidado).toBe(money(r.bridges[metric].consolidated));
      expect(b.pasos.map((p: { monto: string }) => p.monto)).toEqual(
        r.bridges[metric].steps.map((s) => money(s.cents, { sign: true })),
      );
    }
  });
});

describe('proposals (AC5)', () => {
  it('accept the action a correctable finding carries', () => {
    for (const rule of ['FX_INVERTED', 'SIGN_INVERTED', 'BS_UNBALANCED']) {
      const res = buildProposal(ctx, { findingId: find(rule).id, reason: 'porque sí' });
      expect(res.ok).toBe(true);
    }
  });

  it('refuse findings the app cannot correct, unknown ids, missing reasons and accounts outside the catalog', () => {
    expect(buildProposal(ctx, { findingId: find('DUPLICATE_ROW').id, reason: 'x' }).ok).toBe(false);
    expect(buildProposal(ctx, { findingId: 'NO_EXISTE', reason: 'x' }).ok).toBe(false);
    expect(buildProposal(ctx, { findingId: find('FX_INVERTED').id, reason: '  ' }).ok).toBe(false);
    expect(
      buildProposal(ctx, { findingId: find('ACCOUNT_UNMAPPED').id, groupAccount: '9999', reason: 'x' }).ok,
    ).toBe(false);
    expect(
      buildProposal(ctx, { findingId: find('ACCOUNT_UNMAPPED').id, groupAccount: '6500', reason: 'x' }).ok,
    ).toBe(true);
  });

  it('change the engine exactly as the finding button on the Load screen does', () => {
    const fx = find('FX_INVERTED');
    const viaAgent = runPipeline(ds, applyToResolutions(ctx, NO_RESOLUTIONS, fx.id));
    const viaLoad = runPipeline(ds, { ...NO_RESOLUTIONS, resolved: [fx.id] });
    expect(viaAgent.pl).toEqual(viaLoad.pl);

    const sign = find('SIGN_INVERTED');
    const a = runPipeline(ds, applyToResolutions(ctx, NO_RESOLUTIONS, sign.id));
    const b = runPipeline(ds, {
      ...NO_RESOLUTIONS,
      signFixes: sign.action.kind === 'fix-sign' ? sign.action.factIds : [],
    });
    expect(a.pl).toEqual(b.pl);

    const unmapped = find('ACCOUNT_UNMAPPED');
    const m = runPipeline(ds, applyToResolutions(ctx, NO_RESOLUTIONS, unmapped.id, '6500'));
    expect(m.findings.find((f) => f.id === unmapped.id)?.status).toBe('resolved');
  });

  it('cannot be applied to a finding the app cannot correct', () => {
    expect(() => applyToResolutions(ctx, NO_RESOLUTIONS, find('IC_ASYMMETRIC').id)).toThrow();
  });
});

describe('figure check (AC6)', () => {
  const tool = [JSON.stringify({ a: 'Q\u00a0139.7\u00a0M', b: 'USD 26,991', c: '8.2 %' })];

  it('accepts figures the tools returned, at their rounding or coarser', () => {
    expect(
      unverifiedFigures('Inflaba Q 139.7 M, unos Q 140 M; USD 26,991 y 8.2 %; −Q 139.7 M', tool),
    ).toEqual([]);
  });

  it('flags a figure no tool returned', () => {
    expect(unverifiedFigures('La diferencia es Q 12.4 M y el margen 9.1 %', tool)).toEqual([
      'Q 12.4 M',
      '9.1 %',
    ]);
  });

  it('ignores years, rows and counts', () => {
    expect(unverifiedFigures('En 2027, fila 121, hay 10 hallazgos', [])).toEqual([]);
  });
});

describe('templates (no model)', () => {
  it('question 1 lists every open finding by effect, with a proposal for each correctable one (AC1)', () => {
    const t = templateAnswer('cerrar', ctx);
    const open = r.findings.filter((f) => f.status === 'open');
    expect(t.text.match(/^- /gm)).toHaveLength(open.length);
    expect(t.proposals.map((p) => p.findingId).sort()).toEqual(
      open
        .filter(isCorrectable)
        .map((f) => f.id)
        .sort(),
    );
    expect(t.text).toContain('/load#');
  });

  it('question 2 quotes the bridge sentences (AC2)', () => {
    const t = templateAnswer('puente', ctx);
    for (const m of ['revenue', 'ebit', 'eva'] as const)
      expect(t.text).toContain(r.sentences[m].map((s) => s.text).join(''));
  });

  it('question 3 groups only what the company must fix, with file, sheet and row (AC3)', () => {
    const t = templateAnswer('empresas', ctx);
    expect(t.text).toContain('**Empresa 1**');
    expect(t.text).toContain('hoja Presupuesto, fila 121');
    expect(t.text).not.toMatch(/Tasa de cambio invertida|Signo invertido|Cuenta sin mapeo/);
    expect(t.proposals).toEqual([]);
  });
});

describe('agent loop', () => {
  it('reads the consolidated statement in four points, from the same tools, all figures checked', async () => {
    const t = templateAnswer('lectura', ctx);
    expect(t.text.match(/^- /gm)).toHaveLength(4);
    expect(t.text).toContain(r.sentences.revenue.map((x) => x.text).join(''));
    expect(presetById('lectura')).toBe(READING);
    expect(PRESETS.map((p) => p.id)).not.toContain('lectura');
    const a = await runAgent({
      ctx,
      question: READING.prompt,
      create: simulatedModel(ctx),
      mode: 'simulado',
    });
    expect(a.toolCalls).toEqual(['resumen_grupo', 'ver_puente']);
    expect(a.unverified).toEqual([]);
  });

  it('runs a fixed question through tools and proposals with the simulator, all figures verified', async () => {
    const a = await runAgent({
      ctx,
      question: PRESETS[0].prompt,
      create: simulatedModel(ctx),
      mode: 'simulado',
    });
    expect(a.toolCalls[0]).toBe('listar_hallazgos');
    expect(a.toolCalls).toContain('proponer_correccion');
    expect(a.proposals.length).toBe(r.findings.filter(isCorrectable).length);
    expect(a.unverified).toEqual([]);
  });

  it('answers a free question with tools in the simulator (AC4 path)', async () => {
    const a = await runAgent({
      ctx,
      question: '¿Cuánto vende el grupo?',
      create: simulatedModel(ctx),
      mode: 'simulado',
    });
    expect(a.toolCalls).toEqual(['resumen_grupo']);
    expect(a.unverified).toEqual([]);
  });

  it('asks once for a fix when a figure is invented, then reports it as unverified (AC6)', async () => {
    let calls = 0;
    const create: CreateMessage = async (p) => {
      calls++;
      if (calls === 1) return fakeMessage([{ type: 'tool_use', name: 'resumen_grupo', input: {} }]);
      if (calls === 2) return fakeMessage([{ type: 'text', text: 'El grupo vende Q 999.9 M.' }]);
      const last = p.messages.at(-1)!;
      expect(typeof last.content === 'string' && last.content).toContain('Q 999.9 M');
      return fakeMessage([{ type: 'text', text: 'Sigue siendo Q 999.9 M.' }]);
    };
    const a = await runAgent({ ctx, question: '¿Cuánto vende?', create, mode: 'agente' });
    expect(calls).toBe(3);
    expect(a.unverified).toEqual(['Q 999.9 M']);
  });

  it('keeps an invalid proposal off the screen and tells the model why (AC5)', async () => {
    const dup = find('DUPLICATE_ROW').id;
    let error = '';
    const create: CreateMessage = async (p) => {
      const last = p.messages.at(-1)!;
      if (typeof last.content !== 'string') {
        const res = last.content.find((b) => b.type === 'tool_result');
        if (res && res.type === 'tool_result') {
          error = String(res.content);
          return fakeMessage([{ type: 'text', text: 'Ese lo corrige la empresa.' }]);
        }
      }
      return fakeMessage([
        { type: 'tool_use', name: 'proponer_correccion', input: { hallazgo: dup, razon: 'x' } },
      ]);
    };
    const a = await runAgent({ ctx, question: 'Corrige el duplicado', create, mode: 'agente' });
    expect(a.proposals).toEqual([]);
    expect(error).toContain('no se puede corregir en la app');
  });

  it('falls back to the template when the model refuses or the API fails (AC7)', async () => {
    const refuse = await answerQuestion({
      ctx,
      setup: { kind: 'agente', create: script(fakeMessage([], 'refusal')) },
      preset: 'puente',
    });
    expect(refuse.mode).toBe('plantilla');
    expect(refuse.note).toContain('no quiso');
    const down = await answerQuestion({
      ctx,
      setup: {
        kind: 'agente',
        create: async () => {
          throw new Error('network');
        },
      },
      question: '¿Cuánto vende?',
    });
    expect(down.mode).toBe('no-disponible');
  });

  it('sends the model it is given, and leaves the Anthropic-only fallback out through a gateway', async () => {
    const seen: Record<string, unknown>[] = [];
    const create: CreateMessage = async (p) => {
      seen.push(p as unknown as Record<string, unknown>);
      return fakeMessage([{ type: 'text', text: 'Hola.' }]);
    };
    await runAgent({ ctx, question: 'hola', create, mode: 'agente' });
    await runAgent({
      ctx,
      question: 'hola',
      create,
      mode: 'agente',
      model: 'muse-spark-1.3-contributor',
      direct: false,
    });
    expect(seen[0]).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
    });
    // Through a gateway (Meta rejects unknown fields): only the fields every Messages surface takes.
    expect(seen[1].model).toBe('muse-spark-1.3-contributor');
    expect(Object.keys(seen[1]).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'output_config',
      'system',
      'tools',
    ]);
  });

  it('reads its setup from the environment', () => {
    expect(agentMode({})).toBe('plantilla');
    expect(agentMode({ ANTHROPIC_API_KEY: 'k' })).toBe('agente');
    expect(agentMode({ ANTHROPIC_AUTH_TOKEN: 'k' })).toBe('agente');
    expect(agentMode({ ANTHROPIC_AUTH_TOKEN: '' })).toBe('plantilla');
    expect(agentMode({ ANTHROPIC_API_KEY: 'k', PULSEGROUP_AGENT: 'simulado' })).toBe('simulado');
    expect(agentModel({})).toBe('claude-opus-5-5');
    expect(agentModel({ PULSEGROUP_MODEL: 'claude-sonnet-5-5' })).toBe('claude-sonnet-5-5');
    expect(isDirect({ ANTHROPIC_BASE_URL: 'https://gateway.example' })).toBe(false);
  });

  it('without a key answers fixed questions by template and free ones with a notice (AC7)', async () => {
    const fixed = await answerQuestion({ ctx, setup: { kind: 'plantilla' }, preset: 'cerrar' });
    expect(fixed.mode).toBe('plantilla');
    expect(fixed.proposals.length).toBeGreaterThan(0);
    const free = await answerQuestion({ ctx, setup: { kind: 'plantilla' }, question: 'hola' });
    expect(free.mode).toBe('no-disponible');
  });
});
