/**
 * The data agent's shapes. The agent reads a PipelineResult that is already computed; it never reads
 * the source files and never computes a figure. Spec: docs/specs/agente-datos.md.
 */
import type { PipelineResult } from '@/lib/engine/pipeline';
import type { SourceMapping } from '@/lib/engine/types';

export type AgentContext = { r: PipelineResult; mappings: SourceMapping[] };

/** The corrections the app can make itself. Everything else goes back to the company. */
export type CorrectionKind = 'use-group-rate' | 'fix-sign' | 'map-account' | 'exclude';

/** A correction the agent proposes. Nothing changes until a person applies it. */
export type Proposal = {
  findingId: string;
  kind: CorrectionKind;
  /** "Tasa de cambio invertida · Empresa 5" */
  title: string;
  /** The button text, the same one the Load screen uses. */
  actionLabel: string;
  /** What the finding does to the group, as the engine wrote it. */
  impact: string;
  reason: string;
  groupAccount?: string;
  groupAccountName?: string;
};

/**
 * agente: Claude answered. simulado: a scripted model drove the same loop (no key needed).
 * plantilla: no model, the answer is built by code. no-disponible: a free question without a model.
 */
export type AnswerMode = 'agente' | 'simulado' | 'plantilla' | 'no-disponible';

export type AgentAnswer = {
  mode: AnswerMode;
  /** Restricted markdown: paragraphs, "- " lists, **bold**, [text](/app-path). */
  text: string;
  proposals: Proposal[];
  /** Figures in the text that no tool returned in this turn. */
  unverified: string[];
  /** Tools the agent called, in order. */
  toolCalls: string[];
  note?: string;
};

/** One turn of the conversation as the screen keeps it: the question, or the answer's text. */
export type Turn = { role: 'user' | 'assistant'; text: string };
