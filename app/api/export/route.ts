/**
 * GET /api/export: the consolidated budget as an Excel workbook where every figure keeps its trail.
 * Any consolidated figure equals the SUMIF of the "Rastro" sheet plus its eliminations; the route
 * checks that before writing and refuses to ship a file that does not close.
 */
import { ACCOUNT, PL_LINES, lineAccounts } from '@/lib/engine/catalog';
import type { Adjustment } from '@/lib/engine/types';
import { writeXlsx, type CellValue } from '@/lib/engine/workbook';
import { getResult, getSource } from '@/lib/server/state';

export const dynamic = 'force-dynamic';

const q = (cents: number) => Math.round(cents) / 100;

const SEVERITY: Record<string, string> = { block: 'Bloqueo', quarantine: 'Cuarentena', warning: 'Aviso' };
const RULE: Record<string, string> = {
  FX_INVERTED: 'Tasa de cambio invertida',
  FX_MISSING: 'Moneda sin tasa del grupo',
  BS_UNBALANCED: 'Balance descuadrado',
  SUBTOTAL_MISMATCH: 'Subtotal no cuadra',
  DUPLICATE_ROW: 'Fila duplicada',
  SIGN_INVERTED: 'Signo invertido',
  ACCOUNT_UNMAPPED: 'Cuenta sin mapeo',
  IC_ASYMMETRIC: 'Venta entre empresas no cuadra',
  IC_MISSING: 'Venta entre empresas sin contraparte',
  KPI_MISMATCH: 'Indicador copiado no coincide',
};
const ADJ: Record<Adjustment['type'], string> = {
  IC_ELIM: 'Eliminación',
  IC_HOLD: 'Sin conciliar',
  IC_RESIDUAL: 'Diferencia en patrimonio',
};

export async function GET() {
  if ((await getSource()).kind === 'none')
    return new Response('No hay presupuestos cargados. Sube los archivos en Configuración.', { status: 404 });

  const r = await getResult();
  const fy = r.fiscalYear;
  const ccy = r.assumptions.groupCurrency;
  const companyName = (id: string) => r.companies.find((c) => c.id === id)?.name ?? id;
  const factById = new Map(r.facts.map((f) => [f.id, f]));
  const adjById = new Map(r.adjustments.map((a) => [a.id, a]));
  const lineOfAccount = (code: string) =>
    PL_LINES.find((l) => l.accounts?.includes(code))?.label ?? ACCOUNT.get(code)?.name ?? code;

  // Rastro: one row per clean contribution.
  type Trail = { account: string; period: string; company: string; cells: CellValue[]; cents: number };
  const trail: Trail[] = [];
  for (const cell of r.cells) {
    const acc = ACCOUNT.get(cell.groupAccount);
    for (const c of cell.contributions) {
      const f = factById.get(c.factId);
      const [file, sheet, ref] = (f?.sourceCellId ?? '!!').split('!');
      const m = ref?.match(/^([A-Z]+)(\d+)$/);
      trail.push({
        account: cell.groupAccount,
        period: cell.period,
        company: c.companyId,
        cents: c.cents,
        cells: [
          `${cell.groupAccount} ${acc?.name ?? ''}`.trim(),
          acc?.statement === 'PL' ? lineOfAccount(cell.groupAccount) : `Balance · ${acc?.name ?? ''}`,
          cell.period,
          companyName(c.companyId),
          f?.currency ?? '',
          c.amountLocal,
          c.rate,
          q(c.cents),
          file ?? '',
          sheet ?? '',
          m ? Number(m[2]) : null,
          m ? m[1] : null,
          ref ?? '',
          f ? `${f.localAccount} ${f.localName}`.trim() : '',
        ],
      });
    }
  }
  trail.sort(
    (a, b) => a.account.localeCompare(b.account) || a.period.localeCompare(b.period) || a.company.localeCompare(b.company),
  );

  // Close check: for every P&L line, Rastro + eliminations = consolidated, to the cent.
  for (const line of PL_LINES) {
    const accounts = new Set(lineAccounts(line.id));
    const fromTrail = trail.filter((t) => accounts.has(t.account)).reduce((a, t) => a + t.cents, 0);
    const elims = r.cells
      .filter((c) => accounts.has(c.groupAccount))
      .flatMap((c) => c.adjustmentIds)
      .reduce((a, id) => a + (adjById.get(id)?.cents ?? 0), 0);
    const target = r.pl.find((l) => l.id === line.id)!.consolidated;
    if (fromTrail + elims !== target)
      return new Response(
        `El archivo no cierra en "${line.label}": rastro ${fromTrail} + eliminaciones ${elims} ≠ consolidado ${target} (centavos).`,
        { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
  }

  const companies = r.companies.map((c) => c.id);
  const statement: CellValue[][] = [
    [`Quórum · Estado de resultados consolidado ${fy} · ${ccy}`],
    ['Línea', 'Suma de empresas', 'Eliminaciones', 'Consolidado', ...companies.map(companyName)],
    ...PL_LINES.map((line) => {
      const fig = r.pl.find((l) => l.id === line.id)!;
      return [
        line.label,
        q(fig.companies),
        q(fig.eliminations),
        q(fig.consolidated),
        ...companies.map((id) => q(r.plByCompany[line.id]?.[id] ?? 0)),
      ];
    }),
  ];

  const rastro: CellValue[][] = [
    [`Quórum · Rastro de cada cifra hasta su celda de origen · ${ccy}. Cada cifra consolidada = suma de esta hoja + Eliminaciones.`],
    [
      'Cuenta del grupo',
      'Línea',
      'Periodo',
      'Empresa',
      'Moneda',
      'Monto local',
      'Tasa',
      ccy,
      'Archivo',
      'Hoja',
      'Fila',
      'Columna',
      'Celda',
      'Cuenta local',
    ],
    ...trail.map((t) => t.cells),
  ];

  const pairOf = (a: Adjustment) => {
    const m = r.matches.find((x) => x.id === a.icMatchId);
    return m ? `${companyName(m.sellerId)} → ${companyName(m.buyerId)}` : '';
  };
  const eliminaciones: CellValue[][] = [
    [`Quórum · Eliminaciones entre empresas · ${ccy}`],
    ['Tipo', 'Cuenta del grupo', 'Periodo', ccy, 'Motivo', 'Par'],
    ...[...r.adjustments]
      .sort((a, b) => a.groupAccount.localeCompare(b.groupAccount) || a.period.localeCompare(b.period))
      .map((a) => [
        ADJ[a.type],
        `${a.groupAccount} ${ACCOUNT.get(a.groupAccount)?.name ?? ''}`.trim(),
        a.period,
        q(a.cents),
        a.reason,
        pairOf(a),
      ]),
  ];

  const hallazgos: CellValue[][] = [
    ['Quórum · Hallazgos del validador'],
    ['Regla', 'Severidad', 'Estado', 'Empresa', 'Dónde', 'Esperado', 'Encontrado', 'Efecto en el grupo', 'Resolución'],
    ...r.findings.map((f) => {
      const p = f.places[0];
      const where = p ? [p.file, `hoja ${p.sheet}`, `fila ${p.row}`, p.column ? `columna ${p.column}` : null].filter(Boolean).join(' · ') : '';
      return [
        RULE[f.ruleId] ?? f.ruleId,
        SEVERITY[f.severity] ?? f.severity,
        f.status === 'resolved' ? 'Resuelto' : 'Abierto',
        f.companyIds.map(companyName).join(', '),
        where,
        f.expected,
        f.actual,
        f.impactText,
        f.resolutionText ?? '',
      ];
    }),
  ];

  const supuestos: CellValue[][] = [
    ['Quórum · Supuestos del grupo'],
    ['Parámetro', 'Valor'],
    ['Moneda del grupo', ccy],
    ['WACC', r.assumptions.wacc],
    ['Tasa impositiva', r.assumptions.taxRate],
    ['Ejercicio', fy],
    [],
    ['Moneda', 'Periodo', 'Tipo', `${ccy} por unidad`, 'Fuente'],
    ...r.assumptions.rates.map((x) => [x.currency, x.period, x.rateType === 'avg' ? 'Promedio' : 'Cierre', x.rate, x.source]),
  ];

  const buf = writeXlsx([
    { name: 'Estado de resultados', rows: statement },
    { name: 'Rastro', rows: rastro },
    { name: 'Eliminaciones', rows: eliminaciones },
    { name: 'Hallazgos', rows: hallazgos },
    { name: 'Supuestos', rows: supuestos },
  ]);

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="quorum-consolidado-${fy}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
