import type { InferenceSourceName } from '../ai/hybrid';

export function badgeHtml(source: InferenceSourceName, latencyMs?: number): string {
  const ms = latencyMs !== undefined ? ` · ${latencyMs} ms` : '';
  return source === 'ON_DEVICE'
    ? `<span class="badge on">⚡ On-Device: Gemini Nano${ms}</span>`
    : `<span class="badge cloud">☁ Cloud: Firebase AI Logic${ms}</span>`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
