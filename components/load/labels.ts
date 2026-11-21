/** Textos de la pantalla Carga, a partir de los hallazgos que ya produjo el motor. */
import type { Finding, Place, RuleId } from '@/lib/engine/types';
import { money } from '@/lib/format';

export const RULE_NAMES: Record<RuleId, string> = {
  FX_MISSING: 'Moneda sin tasa del grupo',
  FX_INVERTED: 'Tasa de cambio invertida',
  BS_UNBALANCED: 'Balance descuadrado',
  SUBTOTAL_MISMATCH: 'Subtotal no cuadra',
  DUPLICATE_ROW: 'Fila duplicada',
  SIGN_INVERTED: 'Signo invertido',
  ACCOUNT_UNMAPPED: 'Cuenta sin mapeo',
  IC_ASYMMETRIC: 'Venta entre empresas no cuadra',
  IC_MISSING: 'Venta entre empresas sin contraparte',
  KPI_MISMATCH: 'Indicador copiado no coincide',
};

export type StatusView = { tone: 'positive' | 'negative' | 'neutral'; text: string };

export function statusOf(f: Finding): StatusView {
  if (f.status === 'resolved') return { tone: 'positive', text: f.severity === 'block' ? 'Bloqueo resuelto' : 'Resuelto' };
  if (f.severity === 'block') return { tone: 'negative', text: 'Bloqueo' };
  if (f.severity === 'quarantine') return { tone: 'negative', text: 'Cuarentena' };
  return { tone: 'neutral', text: 'Aviso' };
}

// Amounts use non-breaking spaces (lib/format), so match either kind of space.
const MONEY_TOKEN = /−?(?:Q|USD|MXN|EUR|GTQ)[ \u00a0][\d,.]+(?:[ \u00a0]M)?/;

/** The effect split into a figure (right-aligned) and the words around it. */
export function effectParts(f: Finding): { figure: string; words: string } {
  const capital = (s: string) => {
    const t = s
      .replace(/\s+/g, ' ')
      .replace(/\s+(?:by|en|de)\s*$/, '')
      .replace(/^[\s,.:]+|[\s,]+$/g, '')
      .trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  };
  if (f.groupImpact && f.groupImpact.metric === 'none') return { figure: 'Q 0', words: f.impactText };
  // Drop the amount together with the preposition that introduced it ("Descuadre de Q 142,822 en junio").
  const withLead = new RegExp(`(?:\\s+(?:by|de|en))?\\s*${MONEY_TOKEN.source}`);
  if (f.groupImpact) {
    const figure = money(Math.abs(f.groupImpact.cents));
    return { figure, words: capital(f.impactText.replace(withLead, ' ')) };
  }
  const token = f.impactText.match(MONEY_TOKEN)?.[0];
  if (!token) return { figure: '—', words: f.impactText };
  return { figure: token.replace(/^−/, ''), words: capital(f.impactText.replace(withLead, ' ')) };
}

/** "Empresa 5 · hoja Tasas · fila 2", una entrada por archivo que toca el hallazgo. */
export function whereText(places: Place[], companyOfFile: Record<string, string>, multiSheet: Record<string, boolean>): string {
  const firstPerFile = new Map<string, Place>();
  for (const p of places) if (!firstPerFile.has(p.file)) firstPerFile.set(p.file, p);
  return [...firstPerFile.values()]
    .map((p) => {
      const parts = [companyOfFile[p.file] ?? p.file];
      if (multiSheet[p.file]) parts.push(`hoja ${p.sheet}`);
      parts.push(`fila ${p.row}`);
      return parts.join(' · ');
    })
    .join(' y ');
}
