/**
 * Corrections the agent may propose. The only ones allowed are the action the finding already
 * carries, so the agent can never invent a change the Load screen would not offer.
 */
import { RULE_NAMES } from '@/components/load/labels';
import { ACCOUNT } from '@/lib/engine/catalog';
import type { Finding, Resolutions, SourceMapping } from '@/lib/engine/types';
import type { AgentContext, CorrectionKind, Proposal } from './types';

const CORRECTABLE = new Set<string>(['use-group-rate', 'fix-sign', 'map-account', 'exclude']);

export const isCorrectable = (f: Finding) => f.status === 'open' && CORRECTABLE.has(f.action.kind);

/** The group account a sibling local account maps to: the one sharing the longest code prefix. */
export function suggestAccount(mapping: SourceMapping | undefined, local: string): string | undefined {
  if (!mapping) return undefined;
  let best: { len: number; group: string } | undefined;
  for (const [code, group] of Object.entries(mapping.accountMap)) {
    let n = 0;
    while (n < code.length && n < local.length && code[n] === local[n]) n++;
    if (n > 0 && (!best || n > best.len)) best = { len: n, group };
  }
  return best?.group;
}

export type ProposalInput = { findingId: string; groupAccount?: string | null; reason: string };

export function buildProposal(
  ctx: AgentContext,
  input: ProposalInput,
): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  const f = ctx.r.findings.find((x) => x.id === input.findingId);
  if (!f) return { ok: false, error: `No existe el hallazgo ${input.findingId}.` };
  if (f.status !== 'open') return { ok: false, error: `El hallazgo ${f.id} ya está resuelto.` };
  if (!CORRECTABLE.has(f.action.kind))
    return {
      ok: false,
      error: `El hallazgo ${f.id} no se puede corregir en la app; lo tiene que corregir la empresa en su archivo.`,
    };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'Falta la razón de la propuesta.' };

  const company = ctx.r.companies.find((c) => c.id === f.companyIds[0])?.name ?? f.companyIds[0];
  const proposal: Proposal = {
    findingId: f.id,
    kind: f.action.kind as CorrectionKind,
    title: `${RULE_NAMES[f.ruleId]} · ${company}`,
    actionLabel: f.action.label,
    impact: f.impactText,
    reason,
  };
  if (f.action.kind === 'map-account') {
    const account = input.groupAccount ? ACCOUNT.get(input.groupAccount) : undefined;
    if (!account)
      return {
        ok: false,
        error: `La cuenta del grupo "${input.groupAccount ?? ''}" no está en el catálogo.`,
      };
    proposal.groupAccount = account.code;
    proposal.groupAccountName = account.name;
    proposal.actionLabel = `Mapear a ${account.code} ${account.name}`;
  }
  return { ok: true, proposal };
}

const add = (list: string[], ...items: string[]) => [...new Set([...list, ...items])];

/**
 * The decisions after applying a proposal: exactly what the finding's own button on the Load screen
 * records. Throws when the finding can no longer take it.
 */
export function applyToResolutions(
  ctx: AgentContext,
  res: Resolutions,
  findingId: string,
  groupAccount?: string,
): Resolutions {
  const check = buildProposal(ctx, { findingId, groupAccount, reason: 'aplicada' });
  if (!check.ok) throw new Error(check.error);
  const f = ctx.r.findings.find((x) => x.id === findingId)!;
  const a = f.action;
  if (a.kind === 'fix-sign') return { ...res, signFixes: add(res.signFixes, ...a.factIds) };
  if (a.kind === 'map-account')
    return {
      ...res,
      accountOverrides: {
        ...res.accountOverrides,
        [a.companyId]: {
          ...(res.accountOverrides[a.companyId] ?? {}),
          [a.localAccount]: check.proposal.groupAccount!,
        },
      },
    };
  return { ...res, resolved: add(res.resolved, findingId) };
}
