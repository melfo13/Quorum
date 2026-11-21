/**
 * How the agent reaches a model, from the environment (.env.local):
 *
 *   ANTHROPIC_API_KEY    the key (x-api-key); without a key (and without PULSEGROUP_AGENT) answers come from templates
 *   ANTHROPIC_AUTH_TOKEN the key as Authorization: Bearer, for gateways that want it (Meta Model API)
 *   ANTHROPIC_BASE_URL   optional: an Anthropic-compatible gateway instead of api.anthropic.com
 *   PULSEGROUP_MODEL     optional: the model id (default claude-opus-5-5)
 *   PULSEGROUP_AGENT     optional: "simulado" runs the scripted model, no key needed
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AgentSetup } from './answer';
import { MODEL } from './run';

export type AgentMode = 'agente' | 'simulado' | 'plantilla';

type Env = Record<string, string | undefined>;

export function agentMode(env: Env = process.env): AgentMode {
  if (env.PULSEGROUP_AGENT === 'simulado') return 'simulado';
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return 'agente';
  return 'plantilla';
}

export const agentModel = (env: Env = process.env) => env.PULSEGROUP_MODEL?.trim() || MODEL;

/** Talking to api.anthropic.com itself, where the refusal fallback can be requested. */
export const isDirect = (env: Env = process.env) => !env.ANTHROPIC_BASE_URL;

export function agentSetup(env: Env = process.env): AgentSetup {
  const mode = agentMode(env);
  if (mode !== 'agente') return { kind: mode };
  // The SDK reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL itself.
  const client = new Anthropic();
  return {
    kind: 'agente',
    model: agentModel(env),
    direct: isDirect(env),
    create: (params) => client.beta.messages.create(params),
  };
}
