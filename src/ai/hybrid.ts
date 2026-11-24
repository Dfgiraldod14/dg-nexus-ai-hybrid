// =============================================================================
// Hybrid inference core — the ONLY place the app talks to Firebase AI Logic.
//
//   getAI() + GoogleAIBackend      -> Firebase AI Logic (Gemini Developer API)
//   getGenerativeModel({ mode })   -> hybrid routing (Gemini Nano on-device / Gemini in the cloud)
//   model.initializeDeviceModel()  -> downloads/warms Gemini Nano (needs a user gesture)
//   model.generateContent()        -> real runtime inference call
//   result.response.inferenceSource-> which side actually answered ('ON_DEVICE' | 'IN_CLOUD')
//
// Requests are protected by Firebase App Check (see src/firebase.ts).
// =============================================================================
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  type GenerativeModel,
} from 'firebase/ai';
import { app } from '../firebase';
import { policyFor, type RoutePolicy, type TaskKind } from './router';

export type InferenceSourceName = 'ON_DEVICE' | 'IN_CLOUD';

export interface HybridResult {
  text: string;
  source: InferenceSourceName;
  task: TaskKind;
  policy: RoutePolicy;
  latencyMs: number;
  /** Bytes of prompt that left the device (0 when answered on-device). */
  bytesSentToCloud: number;
  cloudModel: string;
}

export type HybridErrorCode = 'ON_DEVICE_UNAVAILABLE' | 'OFFLINE' | 'FAILED';

export class HybridError extends Error {
  constructor(
    public code: HybridErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const CLOUD_MODEL = (import.meta.env.VITE_CLOUD_MODEL as string | undefined) || 'gemini-2.5-flash';

// Firebase AI Logic instance (Gemini Developer API backend).
const ai = getAI(app, { backend: new GoogleAIBackend() });

const models = new Map<InferenceMode, GenerativeModel>();

function modelFor(mode: InferenceMode): GenerativeModel {
  let m = models.get(mode);
  if (!m) {
    m = getGenerativeModel(ai, {
      mode,
      // Cloud side of the hybrid pair.
      inCloudParams: { model: CLOUD_MODEL },
      // On-device side (Chrome Prompt API / Gemini Nano).
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en', 'es'] }],
          expectedOutputs: [{ type: 'text', languages: ['en', 'es'] }],
        },
      },
    });
    models.set(mode, m);
  }
  return m;
}

/**
 * Prepares Gemini Nano. MUST be called from a user gesture (button click).
 * Reports download progress in the 0..1 range.
 */
export async function enableOnDevice(onProgress: (fraction: number) => void): Promise<void> {
  const modes = [InferenceMode.ONLY_ON_DEVICE, InferenceMode.PREFER_ON_DEVICE];
  for (const mode of modes) {
    await modelFor(mode).initializeDeviceModel(onProgress);
  }
}

function resolveSource(mode: InferenceMode, response: unknown): InferenceSourceName {
  if (mode === InferenceMode.ONLY_ON_DEVICE) return 'ON_DEVICE';
  if (mode === InferenceMode.ONLY_IN_CLOUD) return 'IN_CLOUD';
  // PREFER_* modes: the SDK tells us who answered.
  const src = String((response as { inferenceSource?: unknown }).inferenceSource ?? '');
  return src.includes('ON_DEVICE') ? 'ON_DEVICE' : 'IN_CLOUD';
}

/** Runs one task through the hybrid router and reports exactly where it executed. */
export async function runHybrid(
  task: TaskKind,
  prompt: string,
  opts: { strictPrivacy: boolean },
): Promise<HybridResult> {
  const policy = policyFor(task, opts.strictPrivacy);

  if (policy.mode === InferenceMode.ONLY_IN_CLOUD && !navigator.onLine) {
    throw new HybridError(
      'OFFLINE',
      'You are offline. Cloud tasks are unavailable; on-device tasks still work.',
    );
  }

  const model = modelFor(policy.mode);
  const started = performance.now();
  try {
    const result = await model.generateContent(prompt);
    const source = resolveSource(policy.mode, result.response);
    return {
      text: result.response.text(),
      source,
      task,
      policy,
      latencyMs: Math.round(performance.now() - started),
      bytesSentToCloud: source === 'IN_CLOUD' ? new TextEncoder().encode(prompt).length : 0,
      cloudModel: CLOUD_MODEL,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (policy.mode === InferenceMode.ONLY_ON_DEVICE) {
      throw new HybridError(
        'ON_DEVICE_UNAVAILABLE',
        `Gemini Nano is not ready (${msg}). Click "Enable on-device AI" first. Nothing was sent to the cloud.`,
      );
    }
    throw new HybridError('FAILED', msg);
  }
}
