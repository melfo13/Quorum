/**
 * The agent writes a small markdown: paragraphs, "- " and "1. " lists, **bold** and links to app
 * paths. Anything else shows as text. Figures the check could not find get a dotted underline.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \\u00a0]');

function marked(text: string, unverified: RegExp | null, key: string): ReactNode[] {
  if (!unverified) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(unverified)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span
        key={`${key}-u${m.index}`}
        title="Esta cifra no salió de las herramientas"
        className="underline decoration-[#d97706] decoration-dotted decoration-2 underline-offset-[3px]"
      >
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(text: string, unverified: RegExp | null, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(/\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    if (m.index > last) out.push(...marked(text.slice(last, m.index), unverified, `${key}-${i++}`));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{marked(m[1], unverified, k)}</strong>);
    else if (m[3].startsWith('/'))
      out.push(
        <Link
          key={k}
          href={m[3]}
          className="font-medium underline decoration-control underline-offset-[3px] hover:decoration-ink"
        >
          {m[2]}
        </Link>,
      );
    else out.push(m[2]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...marked(text.slice(last), unverified, `${key}-${i}`));
  return out;
}

type Block = { kind: 'p' | 'ul' | 'ol'; lines: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      out.push({ kind: 'p', lines: [] });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const number = line.match(/^\d+[.)]\s+(.*)$/);
    const kind = bullet ? 'ul' : number ? 'ol' : 'p';
    const body = bullet?.[1] ?? number?.[1] ?? line.replace(/^#+\s*/, '');
    const prev = out.at(-1);
    if (prev && prev.kind === kind && (kind !== 'p' || prev.lines.length)) prev.lines.push(body);
    else out.push({ kind, lines: [body] });
  }
  return out.filter((b) => b.lines.length);
}

export function Markdown({ text, unverified = [] }: { text: string; unverified?: string[] }) {
  const re = unverified.length ? new RegExp(unverified.map(escape).join('|'), 'g') : null;
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {blocks(text).map((b, i) => {
        const k = `b${i}`;
        if (b.kind === 'p')
          return (
            <p key={k} className="m-0">
              {b.lines.flatMap((l, j) => [
                ...(j ? [<br key={`${k}-br${j}`} />] : []),
                ...inline(l, re, `${k}-${j}`),
              ])}
            </p>
          );
        const List = b.kind;
        return (
          <List
            key={k}
            className={`m-0 flex flex-col gap-1.5 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-muted`}
          >
            {b.lines.map((l, j) => (
              <li key={`${k}-${j}`}>{inline(l, re, `${k}-${j}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
