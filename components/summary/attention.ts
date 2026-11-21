/**
 * "Lo que necesita tu atención": at most four items, ranked, each computed from the run and pointing
 * at the screen where it is resolved. Nothing typed.
 */
import { ACCOUNT, isOperating } from '@/lib/engine/catalog';
import type { PipelineResult } from '@/lib/engine/pipeline';
import { money, pct } from '@/lib/format';

export type AttentionTone = 'negative' | 'warning' | 'neutral';
export type AttentionItem = { id: string; tone: AttentionTone; title: string; detail: string; action: string; href: string };

const listEs = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

/** Companies whose rows are all held out (a block keeps the whole file out). */
export function fullyHeld(r: PipelineResult): Set<string> {
  const total = new Map<string, number>();
  const held = new Map<string, number>();
  for (const f of r.facts) {
    total.set(f.companyId, (total.get(f.companyId) ?? 0) + 1);
    if (f.status === 'quarantined') held.set(f.companyId, (held.get(f.companyId) ?? 0) + 1);
  }
  return new Set([...total].filter(([id, n]) => n > 0 && held.get(id) === n).map(([id]) => id));
}

/** Operating figures per (company, group account), GTQ cents, from the clean contributions. */
function operating(r: PipelineResult) {
  const out = new Map<string, number>();
  for (const c of r.cells) {
    const acc = ACCOUNT.get(c.groupAccount);
    if (!acc || !isOperating(acc)) continue;
    for (const x of c.contributions) {
      const k = `${x.companyId}|${c.groupAccount}`;
      out.set(k, (out.get(k) ?? 0) + x.cents);
    }
  }
  return out;
}

export function attentionItems(r: PipelineResult, prev: PipelineResult | null): AttentionItem[] {
  const name = (id: string) => r.companies.find((c) => c.id === id)?.name ?? id;
  const items: AttentionItem[] = [];
  const held = fullyHeld(r);

  // a. Open blocks.
  const open = r.openBlocks.length;
  if (open) {
    const cos = [...new Set(r.openBlocks.flatMap((f) => f.companyIds))].map(name);
    items.push({
      id: 'blocks',
      tone: 'negative',
      title: `${open} ${open === 1 ? 'bloqueo detiene' : 'bloqueos detienen'} el número`,
      detail: listEs(cos),
      action: 'Resolver',
      href: '/load',
    });
  }

  // b. Companies that destroy value.
  const wacc = r.assumptions.wacc;
  const destroyers = Object.entries(r.companyKpis)
    .filter(([id, k]) => !held.has(id) && k.capital > 0 && k.roic < wacc)
    .sort((a, b) => a[1].roic - b[1].roic);
  if (destroyers.length) {
    const [id, k] = destroyers[0];
    const more = destroyers.length - 1;
    items.push({
      id: 'value',
      tone: 'warning',
      title: more ? `${name(id)} y ${more} más destruyen valor` : `${name(id)} destruye valor`,
      detail: `rinde ${pct(k.roic)}; el capital cuesta ${pct(wacc)}`,
      action: 'Ver empresa',
      href: `/companies?empresa=${id}`,
    });
  }

  // c. The largest change against the previous version, like for like.
  if (prev) {
    const skip = new Set([...held, ...fullyHeld(prev)]);
    const now = operating(r);
    const before = operating(prev);
    let best: { id: string; account: string; delta: number; up: boolean } | null = null;
    for (const k of new Set([...now.keys(), ...before.keys()])) {
      const [id, account] = k.split('|');
      if (skip.has(id)) continue;
      const a = Math.abs(now.get(k) ?? 0);
      const b = Math.abs(before.get(k) ?? 0);
      const delta = Math.abs(a - b);
      if (!best || delta > best.delta) best = { id, account, delta, up: a > b };
    }
    if (best && best.delta >= 100_000) {
      const acc = ACCOUNT.get(best.account)!;
      const pluralNoun = /s$/.test(acc.name.split(' ')[0]);
      const verb = best.up ? (pluralNoun ? 'subieron' : 'subió') : pluralNoun ? 'bajaron' : 'bajó';
      items.push({
        id: 'change',
        tone: 'neutral',
        title: `${acc.name} de ${name(best.id)} ${verb} ${money(best.delta)}`,
        detail: 'contra la versión anterior',
        action: 'Ver detalle',
        href: `/consolidated?line=${best.account}&company=${best.id}`,
      });
    }
  }

  // d. Intercompany differences nobody reconciled.
  const ic = r.findings.filter((f) => (f.ruleId === 'IC_ASYMMETRIC' || f.ruleId === 'IC_MISSING') && f.status === 'open');
  if (ic.length) {
    const cents = ic.reduce((a, f) => a + Math.abs(f.groupImpact?.cents ?? 0), 0);
    const cos = [...new Set(ic.flatMap((f) => f.companyIds))].map(name);
    items.push({
      id: 'ic',
      tone: 'warning',
      title: `${money(cents, { compact: cents >= 100_000_000 })} sin conciliar entre empresas`,
      detail: listEs(cos),
      action: ic.length === 1 ? 'Ver el par' : 'Ver los pares',
      href: `/load#${encodeURIComponent(ic[0].id)}`,
    });
  }

  return items.slice(0, 4);
}
