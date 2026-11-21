/**
 * Every amount and percentage in an answer must come from what the tools returned in that turn. A
 * figure counts as found when a tool figure in the same currency agrees within the rounding both of
 * them show ("Q 139.7 M" covers "Q 140 M" and "Q 139,660,749").
 */

type Figure = { raw: string; kind: string; value: number; tolerance: number };

// −Q 1.5 M · Q 139,660,749 · USD 26,991 · MXN 73,700 · Q 1.5 millones · 8.2 %
const MONEY =
  /([−-])?\s?\b(Q|GTQ|USD|MXN|EUR)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s?(?:M\b|millones\b|mill\.))?/g;
const PERCENT = /([−-])?(\d+)(?:\.(\d+))?\s?%/g;

const half = (decimals: string | undefined) => 0.5 * 10 ** -(decimals?.length ?? 0);

/** The figures written in a text, with the rounding each one shows. */
export function figuresIn(text: string): Figure[] {
  const t = text.replace(/\u00a0/g, ' ');
  const out: Figure[] = [];
  for (const m of t.matchAll(MONEY)) {
    const scale = m[5] ? 1_000_000 : 1;
    const value = Number(`${m[3].replace(/,/g, '')}.${m[4] ?? '0'}`) * scale;
    out.push({ raw: m[0].trim(), kind: m[2] === 'GTQ' ? 'Q' : m[2], value, tolerance: half(m[4]) * scale });
  }
  for (const m of t.matchAll(PERCENT)) {
    const value = Number(`${m[2]}.${m[3] ?? '0'}`);
    out.push({ raw: m[0].trim(), kind: '%', value, tolerance: half(m[3]) });
  }
  return out;
}

/** The figures in `text` that none of the tool outputs supports. Signs are read from the words, so only size is compared. */
export function unverifiedFigures(text: string, toolOutputs: string[]): string[] {
  const known = toolOutputs.flatMap(figuresIn);
  const missing = figuresIn(text).filter(
    (f) =>
      !known.some(
        (k) => k.kind === f.kind && Math.abs(k.value - f.value) <= k.tolerance + f.tolerance + 1e-9,
      ),
  );
  return [...new Set(missing.map((f) => f.raw))];
}
