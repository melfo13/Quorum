/**
 * Sentences built from figures that are already computed. A template, never a model: the LLM may
 * polish this later, and when it fails the template is what shows.
 */
import type { Bridge, BridgeMetric } from './bridge';
import { money } from '@/lib/format';

export type Segment = { text: string; href?: string };

const SUBJECT: Record<BridgeMetric, string> = { revenue: 'Los ingresos del grupo', ebit: 'El EBIT del grupo', eva: 'El EVA del grupo' };

/** "Group revenue is Q 203.8 M, Q 44.2 M less than the simple sum. The difference comes from …" */
export function bridgeSentence(b: Bridge): Segment[] {
  const diff = b.consolidated - b.simple;
  const out: Segment[] = [
    {
      text: `${SUBJECT[b.metric]} ${b.metric === 'revenue' ? 'son' : 'es'} ${money(b.consolidated)}`,
    },
  ];
  if (Math.abs(diff) < 100_000) {
    out.push({ text: ', igual que la suma simple de las seis empresas.' });
    return out;
  }
  out.push({
    text: `, ${money(Math.abs(diff))} ${diff < 0 ? 'menos' : 'más'} que la suma simple de las seis empresas. La diferencia viene de `,
  });
  // One phrase per step, in plain words. A step's parts stay in the bridge itself, so the sentence
  // never names the same company twice (its rate and the rows that rate holds back).
  const companiesIn = (labels: string[]) => [...new Set(labels.flatMap((l) => l.match(/Empresa \d+/g) ?? []))];
  const parts = b.steps
    .map((s) => {
      if (s.id === 'ic') return { label: 'ventas entre empresas', cents: s.cents, href: '/consolidated?line=4100' };
      if (s.id === 'fx') {
        const cos = companiesIn(s.parts.map((p) => p.label));
        return {
          label: cos.length === 1 ? `la tasa de cambio de ${cos[0]}` : 'la corrección de tasas de cambio',
          cents: s.cents,
          href: s.parts[0]?.href ?? '/consolidated',
        };
      }
      return { label: 'filas con error o bloqueadas', cents: s.cents, href: '/load' };
    })
    .filter((p) => Math.abs(p.cents) >= 100_000)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
    .slice(0, 3);
  parts.forEach((p, i) => {
    if (i > 0) out.push({ text: i === parts.length - 1 ? ' y ' : ', ' });
    out.push({ text: p.label, href: p.href });
    out.push({ text: ` (${money(p.cents, { sign: true })})` });
  });
  out.push({ text: '.' });
  return out;
}

export const plain = (segments: Segment[]) => segments.map((s) => s.text).join('');
