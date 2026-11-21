import { ManagerPanel, Switcher } from '@/components/companies/ManagerPanel';
import { valueByCompany } from '@/components/companies/model';
import { GroupGraph } from '@/components/companies/GroupGraph';
import { ValueTable } from '@/components/companies/ValueTable';
import { Panel, TitleRow } from '@/components/ui/primitives';
import { money, pct } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { getResult, getSource } from '@/lib/server/state';

export const metadata = { title: 'Empresas · Quórum' };

type Search = Promise<{ empresa?: string }>;

export default async function CompaniesPage({ searchParams }: { searchParams: Search }) {
  if ((await getSource()).kind === 'none') return <EmptyState title="Empresas" question="¿Qué empresas crean valor y cuáles lo destruyen?" />;

  const q = await searchParams;
  const r = await getResult();
  const g = valueByCompany(r);
  const name = (id: string) => r.companies.find((c) => c.id === id)?.name ?? id;
  const selected = g.companies.find((c) => c.id === q.empresa) ?? g.weakest ?? g.companies[0];

  const creating = g.measurable.filter((c) => c.creates).length;
  // Revenue eliminated between companies: what the graph's arrows add up to.
  const icCents = -(r.pl.find((l) => l.id === 'revenue')?.eliminations ?? 0);
  const held = g.companies.filter((c) => c.held);
  const worst = g.destroyers.sort((a, b) => a.evaGtq - b.evaGtq)[0];
  const parts = [
    `${creating} de ${g.measurable.length} empresas ${held.length ? 'medibles ' : ''}crean valor.`,
    worst
      ? `${worst.name} rinde ${pct(worst.roic)}, ${Math.abs(worst.spread * 100).toFixed(1)} puntos bajo el WACC, y resta ${money(Math.abs(worst.evaGtq))} de EVA al grupo.`
      : `Todas superan el WACC de ${pct(g.wacc)}.`,
    held.length ? `${held.map((c) => c.name).join(', ')} sigue retenida por un bloqueo.` : '',
  ];

  return (
    <>
      <TitleRow title="Empresas" sub={parts.filter(Boolean).join(' ')} />
      <Panel
        title="¿Cómo se relaciona el grupo?"
        aside={
          icCents
            ? `${money(icCents)} de ventas entre empresas se eliminan al consolidar`
            : 'Sin ventas entre empresas que eliminar'
        }
      >
        <GroupGraph companies={g.companies} matches={r.matches} wacc={g.wacc} selected={selected?.id} />
      </Panel>
      <ValueTable g={g} selected={selected?.id} />
      {selected && (
        <div className="flex flex-col gap-3">
          <Switcher g={g} selected={selected.id} />
          <ManagerPanel c={selected} g={g} name={name} />
        </div>
      )}
    </>
  );
}
