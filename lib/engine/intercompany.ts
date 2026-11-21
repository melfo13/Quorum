/**
 * Intercompany matching and eliminations.
 *
 * Every intercompany line leaves the group number in full: what matches is an IC_ELIM, the part
 * one side has and the other lacks is an IC_HOLD (shown as "sin conciliar"). Removing both sides
 * whole gives the right group figure even when the two books disagree; the finding says which
 * book is off. On the balance, the residual between receivable and payable goes to 3900 so the
 * consolidated balance still balances.
 */
import { ACCOUNT } from './catalog';
import type { Adjustment, Fact, Finding, IcMatch } from './types';
import { money, monthName } from '@/lib/format';

export type IcInput = {
  facts: Fact[]; // clean facts only
  centsOf: (f: Fact) => number;
  activeCompanies: Set<string>; // companies not held out entirely by a block
  companyName: (id: string) => string;
  placeOf: (f: Fact) => { file: string; sheet: string; row: number; column: string };
  toleranceCents: number;
  toleranceRelative: number;
};

export type IcResult = { matches: IcMatch[]; adjustments: Adjustment[]; findings: Finding[] };

export function matchIntercompany(input: IcInput): IcResult {
  const groups = new Map<string, { m: Omit<IcMatch, 'amountSeller' | 'amountBuyer' | 'diff' | 'status'>; s: Fact[]; b: Fact[] }>();
  for (const f of input.facts) {
    if (!f.counterpartyId || !f.groupAccount || f.counterpartyId === f.companyId) continue;
    const acc = ACCOUNT.get(f.groupAccount)!;
    const sellerSide = acc.kind === 'revenue' || acc.kind === 'asset';
    const buyerSide = acc.kind === 'cogs' || acc.kind === 'opex' || acc.kind === 'liability';
    if (!sellerSide && !buyerSide) continue;
    const seller = sellerSide ? f.companyId : f.counterpartyId;
    const buyer = sellerSide ? f.counterpartyId : f.companyId;
    const id = `${acc.statement}:${seller}>${buyer}:${f.period}`;
    if (!groups.has(id))
      groups.set(id, {
        m: {
          id,
          pairId: `${seller}>${buyer}`,
          statement: acc.statement,
          period: f.period,
          sellerId: seller,
          buyerId: buyer,
          sellerFactIds: [],
          buyerFactIds: [],
        },
        s: [],
        b: [],
      });
    const g = groups.get(id)!;
    (sellerSide ? g.s : g.b).push(f);
  }

  const matches: IcMatch[] = [];
  const adjustments: Adjustment[] = [];
  const findings: Finding[] = [];

  for (const { m, s, b } of [...groups.values()].sort((x, y) => x.m.id.localeCompare(y.m.id))) {
    // Seller side is positive (revenue, receivable). Buyer side: costs are negative, payables positive.
    const amountSeller = s.reduce((a, f) => a + input.centsOf(f), 0);
    const amountBuyer = b.reduce((a, f) => a + Math.abs(input.centsOf(f)), 0);
    const diff = amountSeller - amountBuyer;
    const both = input.activeCompanies.has(m.sellerId) && input.activeCompanies.has(m.buyerId);
    const tol = Math.max(input.toleranceCents, input.toleranceRelative * Math.max(amountSeller, amountBuyer));
    let status: IcMatch['status'] = 'matched';
    if (!both) status = 'pending';
    else if (!s.length || !b.length) status = 'missing';
    else if (Math.abs(diff) > tol) status = 'asymmetric';
    const match: IcMatch = {
      ...m,
      sellerFactIds: s.map((f) => f.id),
      buyerFactIds: b.map((f) => f.id),
      amountSeller,
      amountBuyer,
      diff,
      status,
    };
    matches.push(match);

    const matched = Math.min(amountSeller, amountBuyer);
    const label = `${input.companyName(m.sellerId)} → ${input.companyName(m.buyerId)}, ${monthName(m.period)}`;
    const post = (facts: Fact[], total: number, sign: 1 | -1) => {
      // Spread the eliminated amount over the side's accounts in proportion (usually one account).
      const byAccount = new Map<string, number>();
      for (const f of facts) byAccount.set(f.groupAccount!, (byAccount.get(f.groupAccount!) ?? 0) + Math.abs(input.centsOf(f)));
      for (const [account, cents] of byAccount) {
        const share = total === 0 ? 0 : cents / total;
        const elim = Math.round(matched * share);
        const holdCents = cents - elim;
        if (elim)
          adjustments.push({
            id: `IC_ELIM:${m.id}:${account}`,
            type: 'IC_ELIM',
            groupAccount: account,
            period: m.period,
            cents: sign * elim,
            icMatchId: m.id,
            reason: `Eliminación ${label}`,
          });
        if (holdCents)
          adjustments.push({
            id: `IC_HOLD:${m.id}:${account}`,
            type: 'IC_HOLD',
            groupAccount: account,
            period: m.period,
            cents: sign * holdCents,
            icMatchId: m.id,
            reason: `Sin conciliar ${label}`,
          });
      }
    };
    // Revenue and receivables come down; costs (negative) come up; payables come down.
    post(s, amountSeller, -1);
    const buyerIsCost = b.some((f) => ACCOUNT.get(f.groupAccount!)!.statement === 'PL');
    post(b, amountBuyer, buyerIsCost ? 1 : -1);
    if (m.statement === 'BS' && diff !== 0)
      adjustments.push({
        id: `IC_RESIDUAL:${m.id}`,
        type: 'IC_RESIDUAL',
        groupAccount: '3900',
        period: m.period,
        cents: -diff,
        icMatchId: m.id,
        reason: `Diferencia entre cuenta por cobrar y por pagar, ${label}`,
      });

    if (m.statement !== 'PL' || (status !== 'asymmetric' && status !== 'missing')) continue;
    const sideFacts = [...s, ...b];
    const id = `${status === 'missing' ? 'IC_MISSING' : 'IC_ASYMMETRIC'}:${m.id}`;
    const seller = input.companyName(m.sellerId);
    const buyer = input.companyName(m.buyerId);
    findings.push({
      id,
      ruleId: status === 'missing' ? 'IC_MISSING' : 'IC_ASYMMETRIC',
      severity: 'quarantine',
      companyIds: [m.sellerId, m.buyerId],
      places: sideFacts.map(input.placeOf),
      sourceCellIds: sideFacts.map((f) => f.sourceCellId),
      factIds: sideFacts.map((f) => f.id),
      expected:
        status === 'missing'
          ? `${!b.length ? buyer : seller} registra la ${!b.length ? 'compra' : 'venta'} de ${monthName(m.period)}`
          : `Venta y compra iguales`,
      actual:
        status === 'missing'
          ? `${!b.length ? `Venta de ${money(amountSeller, { compact: false })}` : `Compra de ${money(amountBuyer, { compact: false })}`} sin contraparte`
          : `Venta de ${money(amountSeller, { compact: false })}, compra de ${money(amountBuyer, { compact: false })}`,
      groupImpact: { metric: 'ebit', cents: Math.abs(diff) },
      impactText: `${money(Math.abs(diff), { compact: false })} sin conciliar, fuera del número`,
      action: { kind: 'none', label: 'Ver el par' },
      status: 'open',
    });
  }
  return { matches, adjustments, findings };
}
