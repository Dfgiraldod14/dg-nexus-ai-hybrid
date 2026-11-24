// Prompts, parsers and the cloud "privacy firewall" (anonymized aggregates only).
import { runHybrid, type HybridResult } from './hybrid';
import { CATEGORIES, type Category, type NewTx, type Sensitivity, type Tx } from '../data/transactions';

// ---------------------------------------------------------------------------
// On-device tasks (raw private data)
// ---------------------------------------------------------------------------
export interface ParsedNote {
  tx: Omit<NewTx, 'classifiedBy' | 'ts'>;
  result: HybridResult;
}

export async function parseNote(text: string, strictPrivacy: boolean): Promise<ParsedNote> {
  const prompt = [
    'You are a private financial parser running on the user\'s device.',
    'Read the receipt or payment note and answer with ONLY one JSON object (no prose, no code fences) with these keys:',
    '"merchant" (string), "amount" (number; negative for spending, positive for income),',
    '"currency" (ISO 4217 code, default "USD"), "concept" (max 8 words),',
    `"category" (one of: ${CATEGORIES.join(', ')}),`,
    '"sensitivity" ("high" for health, legal, adult or political items; "medium" for income and salary; otherwise "low").',
    '',
    `Note: """${text}"""`,
  ].join('\n');

  const result = await runHybrid('parse-note', prompt, { strictPrivacy });
  const json = extractJson(result.text);
  if (!json) throw new Error('The model did not return valid JSON. Try rephrasing the note.');

  const amount = Number(json.amount);
  if (!Number.isFinite(amount)) throw new Error('Could not extract an amount from the note.');
  const category = (CATEGORIES as readonly string[]).includes(String(json.category))
    ? (String(json.category) as Category)
    : 'other';
  const sensitivity = (['low', 'medium', 'high'] as const).includes(json.sensitivity as Sensitivity)
    ? (json.sensitivity as Sensitivity)
    : 'low';

  return {
    result,
    tx: {
      merchant: String(json.merchant ?? 'Unknown').slice(0, 60),
      concept: String(json.concept ?? '').slice(0, 80),
      amount,
      currency: String(json.currency ?? 'USD').toUpperCase().slice(0, 3),
      category,
      sensitivity,
    },
  };
}

export async function privacyAudit(txs: Tx[]): Promise<HybridResult> {
  const lines = txs
    .slice(0, 40)
    .map((t) => `${t.merchant} | ${t.concept} | ${t.amount} ${t.currency} | ${t.category} | ${t.sensitivity}`)
    .join('\n');
  const prompt = [
    'You are a privacy auditor running locally on the user\'s device, so you may see raw records.',
    'Review these financial records and write a short audit (max 120 words, plain text, lines starting with "-"):',
    '- which kinds of records are sensitive and why,',
    '- which fields should never be uploaded to a cloud service,',
    '- one concrete habit to improve privacy.',
    'Do not repeat merchant names or amounts verbatim.',
    '',
    lines || '(no records)',
  ].join('\n');
  return runHybrid('privacy-audit', prompt, { strictPrivacy: true });
}

// ---------------------------------------------------------------------------
// Privacy firewall: what is allowed to go to the cloud
// ---------------------------------------------------------------------------
export interface CloudPayload {
  currency: string;
  windowDays: number;
  totals: { income: number; spending: number };
  byCategory: Array<{ category: string; spending: number; count: number }>;
  byMonth: Array<{ month: string; spending: number; income: number }>;
  largeTransactions: Array<{ category: string; amount: number; daysAgo: number }>;
  excludedHighSensitivityRecords: number;
}

/** No merchants, no concepts, no timestamps: only category-level aggregates. High-sensitivity records are excluded. */
export function buildCloudPayload(txs: Tx[]): CloudPayload {
  const now = Date.now();
  const safe = txs.filter((t) => t.sensitivity !== 'high');
  const byCat = new Map<string, { spending: number; count: number }>();
  const byMonth = new Map<string, { spending: number; income: number }>();
  let income = 0;
  let spending = 0;

  for (const t of safe) {
    const m = new Date(t.ts).toISOString().slice(0, 7);
    const mm = byMonth.get(m) ?? { spending: 0, income: 0 };
    if (t.amount >= 0) {
      income += t.amount;
      mm.income += t.amount;
    } else {
      spending += -t.amount;
      mm.spending += -t.amount;
      const c = byCat.get(t.category) ?? { spending: 0, count: 0 };
      c.spending += -t.amount;
      c.count += 1;
      byCat.set(t.category, c);
    }
    byMonth.set(m, mm);
  }

  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    currency: txs[0]?.currency ?? 'USD',
    windowDays: txs.length ? Math.ceil((now - Math.min(...txs.map((t) => t.ts))) / 86_400_000) : 0,
    totals: { income: r(income), spending: r(spending) },
    byCategory: [...byCat.entries()]
      .map(([category, v]) => ({ category, spending: r(v.spending), count: v.count }))
      .sort((a, b) => b.spending - a.spending),
    byMonth: [...byMonth.entries()]
      .map(([month, v]) => ({ month, spending: r(v.spending), income: r(v.income) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    largeTransactions: safe
      .filter((t) => t.amount < 0)
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 25)
      .map((t) => ({ category: t.category, amount: r(-t.amount), daysAgo: Math.floor((now - t.ts) / 86_400_000) })),
    excludedHighSensitivityRecords: txs.length - safe.length,
  };
}

// ---------------------------------------------------------------------------
// Cloud tasks (anonymized aggregates only)
// ---------------------------------------------------------------------------
export interface CloudRun {
  result: HybridResult;
  payload: string;
}

export async function deepAnalysis(txs: Tx[]): Promise<CloudRun> {
  const payload = JSON.stringify(buildCloudPayload(txs));
  const prompt = [
    'You are a senior financial analyst. The JSON below contains anonymized spending aggregates (no merchant names).',
    'Write a concise performance analysis (max 200 words, plain text, lines starting with "-"):',
    'savings rate, the 3 most important insights, and 2 concrete recommendations.',
    '',
    payload,
  ].join('\n');
  return { result: await runHybrid('deep-analysis', prompt, { strictPrivacy: false }), payload };
}

export async function budgetSimulation(txs: Tx[], scenario: string): Promise<CloudRun> {
  const payload = JSON.stringify({ scenario, data: buildCloudPayload(txs) });
  const prompt = [
    'You are a budgeting simulator. Using the anonymized aggregates, simulate the user\'s scenario.',
    'Answer in max 180 words, plain text, lines starting with "-":',
    'projected monthly spending/savings before vs after, risks, and one recommendation.',
    '',
    payload,
  ].join('\n');
  return { result: await runHybrid('budget-sim', prompt, { strictPrivacy: false }), payload };
}

export async function detectAnomalies(txs: Tx[]): Promise<CloudRun> {
  const payload = JSON.stringify(buildCloudPayload(txs));
  const prompt = [
    'You are a fraud and anomaly analyst. The JSON contains anonymized category aggregates and the largest transactions',
    '(category, amount, days ago). Flag unusual items versus typical spending in the same category.',
    'Answer in max 160 words, plain text, one line per anomaly starting with "-", with a one-clause reason and a severity (low/medium/high).',
    'If nothing is unusual, say so.',
    '',
    payload,
  ].join('\n');
  return { result: await runHybrid('anomalies', prompt, { strictPrivacy: false }), payload };
}

// ---------------------------------------------------------------------------
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
