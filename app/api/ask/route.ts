/**
 * POST /api/ask: one question to the data agent, about the visitor's data (their upload or the
 * example data, with their decisions applied). Body: { preset } or { question }, plus the earlier
 * turns as { history }.
 */
import { NextResponse } from 'next/server';
import { answerQuestion } from '@/lib/agent/answer';
import { agentMode, agentModel, agentSetup } from '@/lib/agent/config';
import { presetById, type PresetId } from '@/lib/agent/presets';
import type { AgentAnswer, Turn } from '@/lib/agent/types';
import { getDataset, getResolutions, getResult, getSource } from '@/lib/server/state';

export const dynamic = 'force-dynamic';

const MAX_QUESTION = 1000;
const MAX_TURNS = 12;

/**
 * The quick reading on Consolidado is the same question for the same data, asked on every visit: it
 * is kept per dataset, decisions and model, so only a change of any of them asks the model again.
 */
const readings = new Map<string, AgentAnswer>();
const READINGS_KEPT = 50;

function parseHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .filter(
      (t): t is Turn =>
        !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && !!t.text.trim(),
    )
    .map((t) => ({ role: t.role, text: t.text.slice(0, 8000) }))
    .slice(-MAX_TURNS);
  // The API wants the conversation to start with a question and alternate.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns.filter((t, i) => i === 0 || t.role !== turns[i - 1].role);
}

export async function POST(req: Request) {
  if ((await getSource()).kind === 'none')
    return NextResponse.json({ error: 'Todavía no hay presupuestos cargados.' }, { status: 409 });

  let body: { preset?: unknown; question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  const preset =
    typeof body.preset === 'string' && presetById(body.preset) ? (body.preset as PresetId) : undefined;
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  if (!preset && !question) return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 });

  const source = await getSource();
  const key =
    preset === 'lectura'
      ? JSON.stringify([source.kind === 'upload' ? source.id : source.kind, await getResolutions(), agentMode(), agentModel()])
      : null;
  const kept = key ? readings.get(key) : undefined;
  if (kept) return NextResponse.json(kept);

  const r = await getResult();
  const ctx = { r, mappings: getDataset().mappings };
  const answer = await answerQuestion({
    ctx,
    setup: agentSetup(),
    preset,
    question,
    history: parseHistory(body.history),
  });
  // Keep only answers worth repeating: a fallback after a failure should be retried next time.
  if (key && answer.mode === agentMode()) {
    if (readings.size >= READINGS_KEPT) readings.delete(readings.keys().next().value!);
    readings.set(key, answer);
  }
  return NextResponse.json(answer);
}
