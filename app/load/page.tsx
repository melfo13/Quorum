import type { Metadata } from 'next';
import { fixSign, resetDemo } from '@/app/actions';
import { ClearData } from '@/components/upload/ClearData';
import { FilesTable } from '@/components/load/FilesTable';
import { FindingActions } from '@/components/load/FindingActions';
import { FindingCluster } from '@/components/load/FindingCluster';
import { FindingRow, type FindingRowView } from '@/components/load/FindingRow';
import { Gate, type GateCell } from '@/components/load/Gate';
import { RULE_NAMES, effectParts, statusOf, whereText } from '@/components/load/labels';
import { Button, ButtonLink, Panel, TitleRow } from '@/components/ui/primitives';
import { ACCOUNT } from '@/lib/engine/catalog';
import { RateTable } from '@/lib/engine/fx';
import { groupCentsAt } from '@/lib/engine/pipeline';
import type { Finding, Severity } from '@/lib/engine/types';
import { int, money } from '@/lib/format';
import { getExcerpts } from '@/lib/server/excerpt';
import { EmptyState } from '@/components/ui/EmptyState';
import { getDataset, getResult, getSource } from '@/lib/server/state';

export const metadata: Metadata = { title: 'Configuración · Quórum' };

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;

/** An engine action label that already reads as "view something" becomes the toggle; anything else shows the rows. */
const toggleText = (label: string) => (/^(Ver|View) /.test(label) ? label : 'Ver filas');

export default async function LoadPage() {
  if ((await getSource()).kind === 'none') return <EmptyState title="Configuración" question="Sube los presupuestos del grupo y revisa qué no puede entrar al número." />;

  const r = await getResult();
  const ds = getDataset();
  const source = await getSource();
  const sourceLabel =
    source.kind === 'upload'
      ? `Archivos subidos · ${source.files.length} ${source.files.length === 1 ? 'archivo' : 'archivos'} · ${source.uploadedAt.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : 'Datos de ejemplo';
  const companyOfFile = Object.fromEntries(r.companies.map((c) => [c.file, c.name]));
  const multiSheet = Object.fromEntries(r.companies.map((c) => [c.file, (ds.workbooks.get(c.file)?.sheets.length ?? 1) > 1]));
  const nameOf = (id: string) => r.companies.find((c) => c.id === id)?.name ?? id;

  const filesRead = r.companies.filter((c) => !c.missing).length;
  const held = r.confidence.rowsRead - r.confidence.rowsClean;
  const blocks = r.openBlocks.length;
  const blockedCompanies = [...new Set(r.openBlocks.flatMap((f) => f.companyIds))].map(nameOf);
  const sub = [
    `${filesRead} de ${r.companies.length} archivos leídos.`,
    blocks
      ? `${blocks} ${blocks === 1 ? 'bloqueo abierto detiene' : 'bloqueos abiertos detienen'} filas de ${list(blockedCompanies)}.`
      : 'No hay bloqueos abiertos.',
    held
      ? `${int(held)} ${held === 1 ? 'fila queda' : 'filas quedan'} fuera del número del grupo hasta que alguien ${held === 1 ? 'la corrija' : 'las corrija'}.`
      : 'Todas las filas entraron al número del grupo.',
  ].join(' ');

  const view = (f: Finding): FindingRowView => {
    const { figure, words } = effectParts(f);
    return {
      id: f.id,
      rule: RULE_NAMES[f.ruleId],
      status: statusOf(f),
      where: whereText(f.places, companyOfFile, multiSheet),
      found: f.actual,
      expected: f.expected,
      figure,
      words,
      resolved: f.status === 'resolved',
      resolutionText: f.resolutionText,
      toggleLabel: f.action.kind === 'none' ? toggleText(f.action.label) : undefined,
      wideAction: f.action.kind === 'map-account' && f.status === 'open',
    };
  };

  const head = 'px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted border-b border-border';

  // The gate: what is held out right now, in money, by the severity of the finding that holds it.
  const rates = new RateTable(r.assumptions.groupCurrency, r.assumptions.rates);
  const findingById = new Map(r.findings.map((f) => [f.id, f]));
  const heldBy: Record<Severity, { rows: Set<string>; revenue: number }> = {
    block: { rows: new Set(), revenue: 0 },
    quarantine: { rows: new Set(), revenue: 0 },
    warning: { rows: new Set(), revenue: 0 },
  };
  let revenueHeld = 0;
  for (const f of r.facts) {
    if (f.status !== 'quarantined') continue;
    const sev = findingById.get(f.heldBy[0])?.severity ?? 'quarantine';
    heldBy[sev].rows.add(f.rowKey);
    const isRevenue = f.groupAccount ? ACCOUNT.get(f.groupAccount)?.kind === 'revenue' : false;
    if (isRevenue) {
      const c = groupCentsAt(f, rates) ?? 0;
      heldBy[sev].revenue += c;
      revenueHeld += c;
    }
  }
  const icOpen = r.findings.filter((f) => f.ruleId.startsWith('IC_') && f.status === 'open');
  const icCents = icOpen.reduce((s, f) => s + Math.abs(f.groupImpact?.cents ?? 0), 0);
  const blockRows = heldBy.block.rows.size;
  const quarantineRows = heldBy.quarantine.rows.size;
  const gate: GateCell[] = [
    {
      key: 'revenue',
      label: 'Ingresos fuera del número ahora',
      figure: money(revenueHeld),
      detail: held ? `${int(held)} ${held === 1 ? 'fila detenida' : 'filas detenidas'} en la entrada; nada de eso está en el número del grupo` : 'Nada detenido. Todas las filas entraron.',
      tone: revenueHeld ? 'ink' : 'positive',
    },
    {
      key: 'blocks',
      label: blocks === 1 ? 'Bloqueo antes de consolidar' : 'Bloqueos antes de consolidar',
      figure: int(blocks),
      detail: blocks
        ? `${int(blockRows)} filas y ${money(heldBy.block.revenue)} de ingresos esperan una decisión`
        : 'Ninguno. Los seis archivos se pueden consolidar.',
      tone: blocks ? 'negative' : 'positive',
    },
    {
      key: 'quarantine',
      label: 'Filas en cuarentena',
      figure: int(quarantineRows),
      detail: quarantineRows ? `${money(heldBy.quarantine.revenue)} de ingresos; el resto de cada archivo sí entra` : 'Ninguna detenida.',
    },
    {
      key: 'ic',
      label: 'Entre empresas sin conciliar',
      figure: money(icCents, { compact: icCents >= 100_000_000 }),
      detail: icOpen.length ? `${icOpen.length} ${icOpen.length === 1 ? 'par no cuadra' : 'pares no cuadran'}; fuera hasta conciliar` : 'Todos los pares cuadran.',
    },
  ];

  // Findings grouped by what they do to the group number.
  const GROUPS: { key: string; title: string; note: string; pick: (f: Finding) => boolean }[] = [
    { key: 'block', title: 'Bloqueos', note: 'Detienen la consolidación hasta que alguien actúe', pick: (f) => f.status === 'open' && f.severity === 'block' },
    { key: 'quarantine', title: 'Cuarentena', note: 'Filas fuera del número; el resto del archivo sí entra', pick: (f) => f.status === 'open' && f.severity === 'quarantine' },
    { key: 'warning', title: 'Avisos', note: 'No detienen nada; se muestran para revisión', pick: (f) => f.status === 'open' && f.severity === 'warning' },
    { key: 'resolved', title: 'Resueltos', note: 'Atendidos en esta sesión', pick: (f) => f.status === 'resolved' },
  ];
  const groups = GROUPS.map((g) => ({ ...g, items: r.findings.filter(g.pick) })).filter((g) => g.items.length);

  // The same sign error in one company and one account is one problem: it is listed once, with the
  // total effect and one action, and its rows stay inside. Every other finding keeps its own row.
  const factById = new Map(r.facts.map((x) => [x.id, x]));
  type Entry = { kind: 'one'; f: Finding } | { kind: 'many'; key: string; items: Finding[] };
  const clustered = (items: Finding[]): Entry[] => {
    const out: Entry[] = [];
    const byKey = new Map<string, Extract<Entry, { kind: 'many' }>>();
    for (const f of items) {
      const fact = f.action.kind === 'fix-sign' && f.status === 'open' ? factById.get(f.factIds[0]) : undefined;
      if (!fact) {
        out.push({ kind: 'one', f });
        continue;
      }
      const key = `${f.ruleId}|${f.companyIds[0]}|${fact.localAccount}`;
      let e = byKey.get(key);
      if (!e) {
        e = { kind: 'many', key, items: [] };
        byKey.set(key, e);
        out.push(e);
      }
      e.items.push(f);
    }
    return out.map((e) => (e.kind === 'many' && e.items.length === 1 ? { kind: 'one', f: e.items[0] } : e));
  };
  const clusterView = (items: Finding[]) => {
    const first = items[0];
    const fact = factById.get(first.factIds[0]);
    const n = items.length;
    const cents = items.reduce((a, f) => a + Math.abs(f.groupImpact?.cents ?? 0), 0);
    return {
      id: `grupo:${first.ruleId}:${first.companyIds[0]}:${fact?.localAccount ?? ''}`,
      rule: RULE_NAMES[first.ruleId],
      status: statusOf(first),
      where: `${nameOf(first.companyIds[0])} · ${n} filas`,
      found: `${fact?.localName || fact?.localAccount}: signo al revés en ${n === 12 ? 'los 12 meses' : `${n} meses`}`,
      expected: first.expected,
      figure: money(cents),
      words: effectParts(first).words,
      count: n,
      childIds: items.map((f) => f.id),
    };
  };

  return (
    <>
      <TitleRow
        title="Configuración"
        sub={
          <span className="flex max-w-[620px] flex-col gap-1">
            <span>{sub}</span>
            <span className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
              <span>{sourceLabel}</span>
              <ClearData label={source.kind === 'upload' ? 'Quitar archivos' : 'Quitar datos de ejemplo'} />
            </span>
          </span>
        }
        actions={
          <>
            <ButtonLink href="/load/upload">Subir archivos</ButtonLink>
            <form action={resetDemo}>
              <Button type="submit">Deshacer decisiones</Button>
            </form>
            <div className="flex items-center gap-3">
              {blocks ? (
                <>
                  <span className="text-muted">
                    Resuelve {blocks === 1 ? 'el bloqueo' : `los ${blocks} bloqueos`} primero
                  </span>
                  <Button variant="primary" disabled>
                    Consolidar
                  </Button>
                </>
              ) : (
                <ButtonLink href="/summary" variant="primary">
                  Consolidar
                </ButtonLink>
              )}
            </div>
          </>
        }
      />

      <Gate cells={gate} />

      <Panel
        title="Hallazgos"
        aside={`${int(r.confidence.rowsRead)} filas leídas · ${int(r.confidence.rowsClean)} limpias · ${r.findings.length} ${r.findings.length === 1 ? 'hallazgo' : 'hallazgos'}`}
      >
        {r.findings.length === 0 ? (
          <p className="m-0 rounded-[16px] border border-dashed border-control px-4 py-2.5 text-muted">
            Sin hallazgos. Todas las filas de los seis archivos entraron al número del grupo.
          </p>
        ) : (
          <table className="w-full border-collapse @max-4xl/main:block">
            <thead className="@max-4xl/main:hidden">
              <tr>
                <th scope="col" className={head}>
                  Regla
                </th>
                <th scope="col" className={head}>
                  Estado
                </th>
                <th scope="col" className={head}>
                  Dónde
                </th>
                <th scope="col" className={head}>
                  Encontrado y esperado
                </th>
                <th scope="col" className={`${head} text-right`}>
                  Efecto en el grupo
                </th>
                <th scope="col" className={`${head} text-right`}>
                  Acción
                </th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key} className="@max-4xl/main:block">
                <tr className="@max-4xl/main:block">
                  <th
                    scope="colgroup"
                    colSpan={6}
                    className="border-b border-border bg-raised px-3 py-2 text-left font-normal @max-4xl/main:block @max-4xl/main:rounded-[10px] @max-4xl/main:border-0"
                  >
                    <span className="font-semibold">{g.title}</span>
                    <span className="ml-2 rounded-full bg-surface px-1.5 text-xs font-medium tabular-nums ring-1 ring-inset ring-border">
                      {g.items.length}
                    </span>
                    <span className="ml-3 text-xs text-muted">{g.note}</span>
                  </th>
                </tr>
                {clustered(g.items).map((e) =>
                  e.kind === 'one' ? (
                    <FindingRow
                      key={e.f.id}
                      f={view(e.f)}
                      excerpts={getExcerpts(ds, e.f.sourceCellIds, { max: 2 })}
                      action={<FindingActions finding={e.f} mappings={ds.mappings} />}
                    />
                  ) : (
                    <FindingCluster
                      key={e.key}
                      v={clusterView(e.items)}
                      action={
                        <form action={fixSign.bind(null, e.items.flatMap((f) => (f.action.kind === 'fix-sign' ? f.action.factIds : [])))}>
                          <Button type="submit" size="sm">
                            Corregir los {e.items.length} signos
                          </Button>
                        </form>
                      }
                    >
                      {e.items.map((f) => (
                        <FindingRow
                          key={f.id}
                          f={view(f)}
                          excerpts={getExcerpts(ds, f.sourceCellIds, { max: 2 })}
                          action={<FindingActions finding={f} mappings={ds.mappings} />}
                        />
                      ))}
                    </FindingCluster>
                  ),
                )}
              </tbody>
            ))}
          </table>
        )}
      </Panel>

      <Panel title="Archivos" aside={`${filesRead} archivos · las tasas del grupo vienen de ${r.assumptions.source}`}>
        <FilesTable companies={r.companies} />
      </Panel>
    </>
  );
}
