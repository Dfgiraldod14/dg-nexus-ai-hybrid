// Routing policy: which Firebase AI Logic inference mode each task uses, and why.
import { InferenceMode } from 'firebase/ai';

export type TaskKind =
  | 'parse-note' // private: extract amount/merchant/concept + classify
  | 'privacy-audit' // private: audit of what stays on the device
  | 'deep-analysis' // cloud: performance analysis
  | 'budget-sim' // cloud: budget simulation
  | 'anomalies'; // cloud: anomaly detection

export interface RoutePolicy {
  mode: InferenceMode;
  modeName: 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD';
  reason: string;
}

export const TASK_LABELS: Record<TaskKind, string> = {
  'parse-note': 'Receipt / note parsing + classification',
  'privacy-audit': 'Privacy audit',
  'deep-analysis': 'Deep performance analysis',
  'budget-sim': 'Budget simulation',
  anomalies: 'Anomaly detection',
};

/**
 * `strictPrivacy` mirrors the card's privacy-mode toggle.
 *  - Private tasks handle raw merchants/notes => ONLY_ON_DEVICE when strict (hard guarantee: throws
 *    instead of leaking), PREFER_ON_DEVICE otherwise (cloud fallback for reach).
 *  - The privacy audit ALWAYS runs ONLY_ON_DEVICE: it reads every raw record.
 *  - Heavy analytics ALWAYS run ONLY_IN_CLOUD and only ever receive anonymized aggregates.
 */
export function policyFor(task: TaskKind, strictPrivacy: boolean): RoutePolicy {
  switch (task) {
    case 'parse-note':
      return strictPrivacy
        ? {
            mode: InferenceMode.ONLY_ON_DEVICE,
            modeName: 'ONLY_ON_DEVICE',
            reason: 'Privacy mode ON: raw receipt text must never leave this device.',
          }
        : {
            mode: InferenceMode.PREFER_ON_DEVICE,
            modeName: 'PREFER_ON_DEVICE',
            reason: 'Privacy mode OFF: use Gemini Nano if available, otherwise fall back to the cloud.',
          };
    case 'privacy-audit':
      return {
        mode: InferenceMode.ONLY_ON_DEVICE,
        modeName: 'ONLY_ON_DEVICE',
        reason: 'The audit reads every raw record, so it is pinned to the device.',
      };
    case 'deep-analysis':
    case 'budget-sim':
    case 'anomalies':
      return {
        mode: InferenceMode.ONLY_IN_CLOUD,
        modeName: 'ONLY_IN_CLOUD',
        reason: 'Complex reasoning needs a larger model; only anonymized aggregates are sent.',
      };
  }
}

export type NanoAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

/** Reads Chrome's Prompt API availability (Gemini Nano). Purely informational for the UI. */
export async function getNanoAvailability(): Promise<NanoAvailability> {
  const LM = (self as unknown as { LanguageModel?: { availability: (o: unknown) => Promise<string> } })
    .LanguageModel;
  if (!LM) return 'unsupported';
  try {
    const a = await LM.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    return (['available', 'downloadable', 'downloading', 'unavailable'].includes(a)
      ? a
      : 'unavailable') as NanoAvailability;
  } catch {
    return 'unsupported';
  }
}
