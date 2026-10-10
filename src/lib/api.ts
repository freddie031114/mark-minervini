import type { Settings, Tag, Trade } from './types';

export class ApiError extends Error {
  constructor(message: string, public fields?: Record<string, string>, public details?: string[]) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof Blob) {
    init.body = body;
    init.headers = { 'Content-Type': body.type || 'image/png' };
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, data.fields, data.details);
  return data as T;
}

export type TradeInput = Partial<Omit<Trade, 'id' | 'screenshots' | 'created_at' | 'updated_at' | 'is_demo'>>;

export const api = {
  trades: () => req<Trade[]>('GET', '/api/trades'),
  createTrade: (t: TradeInput) => req<Trade>('POST', '/api/trades', t),
  updateTrade: (id: number, t: TradeInput) => req<Trade>('PUT', `/api/trades/${id}`, t),
  closeTrade: (id: number, t: TradeInput) => req<Trade>('POST', `/api/trades/${id}/close`, t),
  deleteTrade: (id: number) => req('DELETE', `/api/trades/${id}`),
  addShot: (id: number, blob: Blob, label: string, caption: string) =>
    req('POST', `/api/trades/${id}/screenshots?label=${encodeURIComponent(label)}&caption=${encodeURIComponent(caption)}`, blob),
  deleteShot: (id: number) => req('DELETE', `/api/screenshots/${id}`),
  tags: () => req<Tag[]>('GET', '/api/tags'),
  addTag: (name: string) => req<Tag[]>('POST', '/api/tags', { name }),
  renameTag: (id: number, name: string) => req<Tag[]>('PUT', `/api/tags/${id}`, { name }),
  deleteTag: (id: number) => req<Tag[]>('DELETE', `/api/tags/${id}`),
  settings: () => req<Settings>('GET', '/api/settings'),
  saveSettings: (s: Partial<Settings>) => req<Settings>('PUT', '/api/settings', s),
  info: () => req<{ dataDir: string; driver: string }>('GET', '/api/info'),
  importJson: (data: unknown) => req<{ trades: number; missingScreenshots: number }>('POST', '/api/import', data),
  loadDemo: () => req<{ count: number }>('POST', '/api/demo/load'),
  clearDemo: () => req('POST', '/api/demo/clear'),
};
