/**
 * Row-level rules. Each finding says where (file, sheet, row, column), what was expected, what
 * was found, and what it does to the group number. Blocks and quarantines put fact ids in
 * `heldBy`, which keeps those facts out of every later step.
 */
import { ACCOUNT, isExpense, isOperating } from './catalog';
import { RateTable, toCents } from './fx';
import type { ControlRow, MapResult } from './map';
import type { Fact, Finding, Resolutions, SourceMapping } from './types';
import { local, money, monthName, rate as fmtRate } from '@/lib/format';

export type CompanyInput = { mapping: SourceMapping; result: MapResult };

const place = (f: Fact) => {
  const [file, sheet, ref] = f.sourceCellId.split('!');
  const m = ref.match(/^([A-Z]+)(\d+)$/)!;
  return { file, sheet, row: Number(m[2]), column: m[1] };
};

function hold(facts: Fact[], findingId: string) {
  for (const f of facts) if (!f.heldBy.includes(findingId)) f.heldBy.push(findingId);
}

/** Group cents of a fact at the group's own rate; null when the currency has no rate. */
export function groupCents(f: Fact, rates: RateTable): number | null {
  const r = rates.get(f.currency, f.period, f.statement === 'BS' ? 'closing' : 'avg');
  return r ? toCents(f.amountLocal, r.rate) : null;
}

export function validateRows(
  companies: CompanyInput[],
  rates: RateTable,
  res: Resolutions,
  tolerance: { fxRelative: number },
): Finding[] {
  const out: Finding[] = [];
  const resolved = (id: string) => res.resolved.includes(id);

  for (const { mapping, result } of companies) {
    const name = mapping.companyName;
    const facts = result.facts;
    const factById = new Map(facts.map((f) => [f.id, f]));

    // FX_MISSING: a row in a currency the group table does not carry.
    const missing = new Map<string, Fact[]>();
    for (const f of facts) if (!rates.has(f.currency)) missing.set(f.rowKey, [...(missing.get(f.rowKey) ?? []), f]);
    for (const [rowKey, fs] of missing) {
      const p = place(fs[0]);
      const id = `FX_MISSING:${rowKey}`;
      const amount = fs.reduce((a, f) => a + f.amountLocal, 0);
      hold(fs, id);
      out.push({
        id,
        ruleId: 'FX_MISSING',
        severity: 'block',
        companyIds: [mapping.companyId],
        places: [p],
        sourceCellIds: fs.map((f) => f.sourceCellId),
        factIds: fs.map((f) => f.id),
        expected: `Una moneda de la tabla de tasas del grupo`,
        actual: `${fs[0].currency}, sin tasa del grupo`,
        groupImpact: null,
        impactText: `${local(amount, fs[0].currency)} sin convertir, fuera del número`,
        action: { kind: 'exclude', label: 'Dejar fuera' },
        status: resolved(id) ? 'resolved' : 'open',
        resolutionText: resolved(id) ? 'Fila fuera hasta tener tasa' : undefined,
      });
    }

    // FX_INVERTED: the company's own rate is far from the group's, or close to its inverse.
    if (result.fileRates.size) {
      const bad: { period: string; file: number; group: number; inverted: boolean; row: number; cellId: string }[] = [];
      for (const [period, fr] of result.fileRates) {
        const g = rates.get(mapping.currency, period, 'avg');
        if (!g) continue;
        const off = Math.abs(fr.rate - g.rate) / g.rate;
        const inverted = Math.abs(fr.rate * g.rate - 1) < tolerance.fxRelative;
        if (off > tolerance.fxRelative || inverted)
          bad.push({ period, file: fr.rate, group: g.rate, inverted, row: fr.row, cellId: fr.cellId });
      }
      if (bad.length) {
        const id = `FX_INVERTED:${mapping.companyId}`;
        let revenue = 0;
        for (const f of facts) {
          const acc = f.groupAccount ? ACCOUNT.get(f.groupAccount) : undefined;
          const b = bad.find((x) => x.period === f.period);
          if (acc?.kind === 'revenue' && b) revenue += toCents(f.amountLocal, b.file) - toCents(f.amountLocal, b.group);
        }
        const isResolved = resolved(id);
        if (!isResolved) hold(facts, id);
        const first = bad[0];
        const [file, sheet] = first.cellId.split('!');
        out.push({
          id,
          ruleId: 'FX_INVERTED',
          severity: 'block',
          companyIds: [mapping.companyId],
          places: bad.slice(0, 1).map((b) => ({ file, sheet, row: b.row, column: b.cellId.split('!')[2].replace(/\d+/g, '') })),
          sourceCellIds: bad.map((b) => b.cellId),
          factIds: facts.map((f) => f.id),
          expected: `${fmtRate(first.group)} GTQ por ${mapping.currency}`,
          actual: `${fmtRate(first.file)}${first.inverted ? ', parece invertida' : ''} en ${bad.length} ${bad.length === 1 ? 'mes' : 'meses'}`,
          groupImpact: { metric: 'revenue', cents: revenue },
          impactText: `${revenue >= 0 ? 'Inflaba' : 'Reducía'} ingresos en ${money(Math.abs(revenue))}`,
          action: { kind: 'use-group-rate', label: 'Usar tasa del grupo' },
          status: isResolved ? 'resolved' : 'open',
          resolutionText: isResolved ? 'Tasa del grupo aplicada' : undefined,
        });
      }
    }

    // ACCOUNT_UNMAPPED: no destination in the group catalog. One finding per local account.
    const unmapped = new Map<string, Fact[]>();
    for (const f of facts) if (!f.groupAccount) unmapped.set(f.localAccount, [...(unmapped.get(f.localAccount) ?? []), f]);
    for (const [acct, fs] of unmapped) {
      const id = `ACCOUNT_UNMAPPED:${mapping.companyId}:${acct}`;
      hold(fs, id);
      const total = fs.reduce((a, f) => a + f.amountLocal, 0);
      out.push({
        id,
        ruleId: 'ACCOUNT_UNMAPPED',
        severity: 'quarantine',
        companyIds: [mapping.companyId],
        places: fs.slice(0, 3).map(place),
        sourceCellIds: fs.map((f) => f.sourceCellId),
        factIds: fs.map((f) => f.id),
        expected: `Una cuenta del plan de ${name}`,
        actual: `La cuenta ${acct} no está en el plan`,
        groupImpact: null,
        impactText: `${local(Math.abs(total), mapping.currency)} fuera del consolidado`,
        action: { kind: 'map-account', label: 'Mapear cuenta', companyId: mapping.companyId, localAccount: acct },
        status: 'open',
      });
    }
    for (const acct of Object.keys(res.accountOverrides[mapping.companyId] ?? {})) {
      if (mapping.accountMap[acct]) continue;
      const fs = facts.filter((f) => f.localAccount === acct);
      if (!fs.length) continue;
      const target = ACCOUNT.get(res.accountOverrides[mapping.companyId][acct]);
      out.push({
        id: `ACCOUNT_UNMAPPED:${mapping.companyId}:${acct}`,
        ruleId: 'ACCOUNT_UNMAPPED',
        severity: 'quarantine',
        companyIds: [mapping.companyId],
        places: fs.slice(0, 3).map(place),
        sourceCellIds: fs.map((f) => f.sourceCellId),
        factIds: fs.map((f) => f.id),
        expected: `Una cuenta del plan de ${name}`,
        actual: `La cuenta ${acct} no estaba en el plan`,
        groupImpact: null,
        impactText: `Entra como ${target?.name ?? 'cuenta del grupo'}`,
        action: { kind: 'none', label: '' },
        status: 'resolved',
        resolutionText: `Mapeada a ${target?.code} ${target?.name}`,
      });
    }

    // SIGN_INVERTED: an expense whose sign runs against the rest of the file.
    for (const f of facts) {
      const acc = f.groupAccount ? ACCOUNT.get(f.groupAccount) : undefined;
      if (!acc || !isExpense(acc)) continue;
      const fixed = res.signFixes.includes(f.id);
      if (fixed) {
        f.amountLocal = -f.amountLocal;
        f.signFixed = true;
      }
      if (!fixed && f.amountLocal <= 0) continue;
      const id = `SIGN_INVERTED:${f.id}`;
      const g = groupCents(f, rates) ?? 0;
      if (!fixed) hold([f], id);
      out.push({
        id,
        ruleId: 'SIGN_INVERTED',
        severity: 'quarantine',
        companyIds: [mapping.companyId],
        places: [place(f)],
        sourceCellIds: [f.sourceCellId],
        factIds: [f.id],
        expected: `Gasto con signo ${mapping.expenseSign === 'negative' ? 'negativo' : 'positivo'}, como el resto del archivo`,
        actual: `${f.localName || f.localAccount}, ${monthName(f.period)}: ${local(f.amountAsTyped, mapping.currency)}`,
        groupImpact: { metric: 'ebit', cents: 2 * Math.abs(g) },
        impactText: `Inflaba el EBIT en ${money(2 * Math.abs(g))}`,
        action: { kind: 'fix-sign', label: 'Corregir signo', factIds: [f.id] },
        status: fixed ? 'resolved' : 'open',
        resolutionText: fixed ? 'Signo corregido; la fila entra al número' : undefined,
      });
    }

    // DUPLICATE_ROW: the same row twice. The later copy stays out.
    const seen = new Map<string, number>();
    for (const r of result.rows) {
      const first = seen.get(r.signature);
      if (first === undefined) {
        seen.set(r.signature, r.row);
        continue;
      }
      const fs = r.factIds.map((id) => factById.get(id)!).filter(Boolean);
      const id = `DUPLICATE_ROW:${r.key}`;
      hold(fs, id);
      const rev = fs.reduce((a, f) => {
        const acc = f.groupAccount ? ACCOUNT.get(f.groupAccount) : undefined;
        return a + (acc && isOperating(acc) ? (groupCents(f, rates) ?? 0) : 0);
      }, 0);
      const isRevenue = fs.some((f) => f.groupAccount && ACCOUNT.get(f.groupAccount)?.kind === 'revenue');
      out.push({
        id,
        ruleId: 'DUPLICATE_ROW',
        severity: 'quarantine',
        companyIds: [mapping.companyId],
        places: [{ file: r.file, sheet: r.sheet, row: r.row }],
        sourceCellIds: fs.map((f) => f.sourceCellId),
        factIds: fs.map((f) => f.id),
        expected: 'Cada registro una sola vez',
        actual: `La fila ${r.row} repite la ${first}`,
        groupImpact: { metric: isRevenue ? 'revenue' : 'ebit', cents: rev },
        impactText: `Inflaba ${isRevenue ? 'ingresos' : 'el EBIT'} en ${money(Math.abs(rev))}`,
        action: { kind: 'none', label: 'Ver filas' },
        status: 'open',
      });
    }

    // SUBTOTAL_MISMATCH: control rows that the file carries.
    for (const c of result.controls) out.push(...controlFinding(c, mapping, result, factById));

    // BS_UNBALANCED: assets against liabilities plus equity, per period, in local currency.
    const byPeriod = new Map<string, Fact[]>();
    for (const f of facts) if (f.statement === 'BS') byPeriod.set(f.period, [...(byPeriod.get(f.period) ?? []), f]);
    for (const [period, fs] of byPeriod) {
      let assets = 0;
      let claims = 0;
      for (const f of fs) {
        const k = ACCOUNT.get(f.groupAccount!)!.kind;
        if (k === 'asset') assets += f.amountLocal;
        else claims += f.amountLocal;
      }
      const diff = Math.round((assets - claims) * 100) / 100;
      if (Math.abs(diff) < 1) continue;
      const id = `BS_UNBALANCED:${mapping.companyId}:${period}`;
      hold(fs, id);
      const closing = rates.get(mapping.currency, period, 'closing');
      const cents = closing ? toCents(diff, closing.rate) : 0;
      const isResolved = resolved(id);
      const sheet = fs[0].sourceCellId.split('!')[1];
      out.push({
        id,
        ruleId: 'BS_UNBALANCED',
        severity: 'block',
        companyIds: [mapping.companyId],
        places: [{ file: mapping.file, sheet, row: place(fs[0]).row, column: place(fs[0]).column }],
        sourceCellIds: fs.map((f) => f.sourceCellId),
        factIds: fs.map((f) => f.id),
        expected: `Activos iguales a pasivos más patrimonio en ${monthName(period)}`,
        actual: `Activos ${local(assets, mapping.currency)}, pasivos y patrimonio ${local(claims, mapping.currency)}`,
        groupImpact: { metric: 'balance', cents },
        impactText: `Descuadre de ${money(Math.abs(cents))} en ${monthName(period)}`,
        action: { kind: 'exclude', label: `Dejar fuera ${monthName(period)}` },
        status: isResolved ? 'resolved' : 'open',
        resolutionText: isResolved ? `Balance de ${monthName(period)} fuera del número` : undefined,
      });
    }
  }

  for (const c of companies) for (const f of c.result.facts) f.status = f.heldBy.length ? 'quarantined' : 'clean';
  return out;
}

function controlFinding(
  c: ControlRow,
  mapping: SourceMapping,
  result: MapResult,
  factById: Map<string, Fact>,
): Finding[] {
  const rows = new Set(c.coveredRowKeys);
  const covered = result.rows.filter((r) => rows.has(r.key)).flatMap((r) => r.factIds.map((id) => factById.get(id)!));
  const summed = Math.round(covered.reduce((a, f) => a + f.amountAsTyped, 0) * 100) / 100;
  const diff = Math.round((c.stated - summed) * 100) / 100;
  if (Math.abs(diff) < Math.max(1, mapping.scale)) return [];
  return [
    {
      id: `SUBTOTAL_MISMATCH:${c.file}!${c.sheet}!${c.row}`,
      ruleId: 'SUBTOTAL_MISMATCH',
      // A warning, not a quarantine: the engine sums the accounts and never the file's subtotal,
      // so holding the accounts back would remove correct rows.
      severity: 'warning',
      companyIds: [mapping.companyId],
      places: [{ file: c.file, sheet: c.sheet, row: c.row, column: c.column }],
      sourceCellIds: covered.map((f) => f.sourceCellId),
      factIds: covered.map((f) => f.id),
      expected: `${c.label}: ${local(summed, mapping.currency)}, la suma de sus ${covered.length} cuentas`,
      actual: `${local(c.stated, mapping.currency)} escrito en el archivo`,
      groupImpact: { metric: 'none', cents: 0 },
      impactText: `Ninguno: se suman las cuentas. Diferencia de ${local(Math.abs(diff), mapping.currency)}`,
      action: { kind: 'none', label: 'Ver cuentas' },
      status: 'open',
    },
  ];
}
