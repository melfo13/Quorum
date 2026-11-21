'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { Button, Pill, buttonClass, cx, type Tone } from '@/components/ui/primitives';
import type { UploadResult as Result, UploadStatus as Status } from '@/lib/server/upload';

const STATUS: Record<Status, { tone: Tone; text: string }> = {
  reconocido: { tone: 'positive', text: 'Reconocido' },
  supuestos: { tone: 'positive', text: 'Supuestos del grupo' },
  'elegir empresa': { tone: 'warning', text: 'Elige la empresa' },
  'formato distinto': { tone: 'negative', text: 'Formato distinto' },
  repetido: { tone: 'warning', text: 'Repetido' },
  'no se pudo leer': { tone: 'negative', text: 'No se pudo leer' },
};

/** Which company each pending file is: one select per file, a company can be picked only once. */
function AssignPending({ result, onDone }: { result: Result; onDone: (r: Result) => void }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = new Set(Object.values(choice).filter(Boolean));

  const assign = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/upload/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: result.id, assignments: choice }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'No se pudieron asignar las empresas.');
      else onDone(json as Result);
    } catch {
      setError('No se pudo conectar con la app.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-warn-border bg-warn-bg/40 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-base font-semibold">¿De qué empresa es cada archivo?</h3>
        <p className="m-0 text-sm text-muted">
          Estos archivos tienen la estructura de un presupuesto del grupo, pero su nombre no dice de qué empresa son.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {result.pending.map((p) => (
          <li key={p.name} className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`assign-${p.name}`} className="min-w-0 truncate font-mono text-xs">
              {p.name}
            </label>
            <select
              id={`assign-${p.name}`}
              value={choice[p.name] ?? ''}
              onChange={(e) => setChoice((c) => ({ ...c, [p.name]: e.target.value }))}
              className="h-8 rounded-[10px] border border-control bg-surface px-2 text-ink"
            >
              <option value="">Elegir empresa…</option>
              {p.companies.map((c) => (
                <option key={c.id} value={c.id} disabled={picked.has(c.id) && choice[p.name] !== c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={assign} disabled={busy || picked.size === 0}>
          {busy ? 'Asignando…' : 'Asignar empresas'}
        </Button>
        {error && <span className="text-sm text-negative">{error}</span>}
      </div>
    </div>
  );
}

const ACCEPT = /\.(xlsx|csv)$/i;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function Uploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const bad = picked.filter((f) => !ACCEPT.test(f.name));
    setError(bad.length ? `Solo se aceptan archivos .xlsx o .csv. Se omitió: ${bad.map((f) => f.name).join(', ')}.` : null);
    setResult(null);
    setFiles((prev) => {
      const byName = new Map(prev.map((f) => [f.name, f]));
      for (const f of picked.filter((x) => ACCEPT.test(x.name))) byName.set(f.name, f);
      return [...byName.values()];
    });
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  const send = async () => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    for (const f of files) body.append('files', f);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'No se pudieron subir los archivos.');
        return;
      }
      setResult(json as Result);
      setFiles([]);
      if (input.current) input.current.value = '';
      router.refresh();
    } catch {
      setError('No se pudo conectar con la app. Revisa que siga corriendo y vuelve a intentar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <label
        htmlFor="upload-files"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx(
          'flex min-h-[148px] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[16px] border border-dashed px-6 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
          over ? 'border-accent bg-accent-tint' : 'border-control bg-raised hover:border-[#9aa0a6]',
        )}
      >
        <span className="text-base font-medium">Arrastra los archivos aquí o haz clic para elegirlos</span>
        <span className="text-muted">.xlsx o .csv, hasta 10 MB cada uno</span>
        <input
          ref={input}
          id="upload-files"
          type="file"
          multiple
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={(e) => add(e.currentTarget.files)}
        />
      </label>

      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted">
            {files.length} {files.length === 1 ? 'archivo elegido' : 'archivos elegidos'}
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 border-b border-rule py-2 last:border-b-0">
                <span className="min-w-0 truncate font-mono text-xs">{f.name}</span>
                <span className="flex flex-none items-center gap-3">
                  <span className="text-xs text-muted tabular-nums">{kb(f.size)}</span>
                  <button
                    type="button"
                    className="cursor-pointer rounded-[4px] px-1 text-xs text-muted underline underline-offset-2 hover:text-ink"
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={send} disabled={!files.length || busy}>
          {busy ? 'Enviando…' : 'Enviar archivos'}
        </Button>
        {!files.length && !result && <span className="text-sm text-muted">Elige al menos un archivo para enviar.</span>}
      </div>

      {error && (
        <p role="alert" className="m-0 rounded-[10px] bg-neg-bg px-3 py-2 text-sm text-neg-ink">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-3 border-t border-border pt-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-base font-semibold">Resultado del envío</h2>
            <span className="text-muted">
              {result.recognised} de {result.recognised + result.missing.length} presupuestos reconocidos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Archivo</th>
                  <th scope="col">Empresa</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {result.files.map((f) => (
                  <tr key={f.name}>
                    <th scope="row" className="font-mono text-xs font-normal">
                      {f.name}
                    </th>
                    <td>{f.company ?? <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <Pill tone={STATUS[f.status].tone}>{STATUS[f.status].text}</Pill>
                        {f.detail && <span className="text-xs text-muted">{f.detail}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.pending.length > 0 && (
            <AssignPending
              result={result}
              onDone={(next) => {
                // Keep every row; the assigned files take their new status.
                const updated = new Map(next.files.map((f) => [f.name, f]));
                setResult({ ...next, files: result.files.map((f) => updated.get(f.name) ?? f) });
                router.refresh();
              }}
            />
          )}
          {result.missing.length > 0 && (
            <p className="m-0 text-sm text-muted">
              Faltan: {result.missing.map((m) => `${m.file} (${m.company})`).join(', ')}. La carga mostrará esas empresas como
              archivo faltante.
            </p>
          )}
          {result.recognised > 0 ? (
            <div>
              <Link href="/load" className={buttonClass('primary')}>
                Ver la carga
              </Link>
            </div>
          ) : result.pending.length ? null : (
            <p className="m-0 text-sm text-muted">
              Ningún archivo se reconoció, así que la app sigue con los datos anteriores. Cada presupuesto necesita la hoja y
              las columnas que indica su estado; revisa los archivos marcados como formato distinto y vuelve a enviarlos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
