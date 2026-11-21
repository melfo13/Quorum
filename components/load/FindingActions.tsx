import { fixSign, mapAccount, resolveFinding } from '@/app/actions';
import { Button } from '@/components/ui/primitives';
import { suggestAccount } from '@/lib/agent/proposals';
import { ACCOUNTS } from '@/lib/engine/catalog';
import type { Finding, SourceMapping } from '@/lib/engine/types';

const STATEMENT = { PL: 'Estado de resultados', BS: 'Balance general' } as const;

/** Server-rendered controls for one finding. Every control is a form posting to a server action. */
export function FindingActions({ finding, mappings }: { finding: Finding; mappings: SourceMapping[] }) {
  const a = finding.action;
  if (a.kind === 'use-group-rate' || a.kind === 'exclude') {
    return (
      <form action={resolveFinding.bind(null, finding.id)}>
        <Button type="submit" variant="primary" size="sm">
          {a.label}
        </Button>
      </form>
    );
  }
  if (a.kind === 'fix-sign') {
    return (
      <form action={fixSign.bind(null, a.factIds)}>
        <Button type="submit" size="sm">
          {a.label}
        </Button>
      </form>
    );
  }
  if (a.kind === 'map-account') {
    const { companyId, localAccount } = a;
    const suggested = suggestAccount(
      mappings.find((m) => m.companyId === companyId),
      localAccount,
    );
    async function submit(form: FormData) {
      'use server';
      const group = String(form.get('group') ?? '');
      if (group) await mapAccount(companyId, localAccount, group);
    }
    const selectId = `map-${finding.id}`;
    return (
      <form action={submit} className="flex flex-wrap items-center justify-end gap-2">
        <label htmlFor={selectId} className="sr-only">
          Cuenta del grupo para {localAccount}
        </label>
        <select
          id={selectId}
          name="group"
          defaultValue={suggested}
          className="h-8 max-w-[200px] rounded-[10px] border border-control bg-surface px-2 text-ink"
        >
          {(['PL', 'BS'] as const).map((st) => (
            <optgroup key={st} label={STATEMENT[st]}>
              {ACCOUNTS.filter((x) => x.statement === st).map((x) => (
                <option key={x.code} value={x.code}>
                  {x.code} {x.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Button type="submit" size="sm">
          Mapear
        </Button>
      </form>
    );
  }
  return null;
}
