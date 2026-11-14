// "Notify Me When Available" alerts for the signed-in person: GET returns them, PUT { on, alert } adds or
// removes one. Stored per username in Netlify Blobs next to the rest of the account (see me.mjs).
// The app keeps a copy on the device too, and checks the alerts against the streaming services when Home opens.
import { sessionUser } from '../lib/auth.mjs';

export const LIMIT = 100;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function cleanAlert(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind, id = String(raw.id ?? ''), region = raw.region;
  if ((kind !== 'movie' && kind !== 'tv') || !/^[1-9]\d{0,9}$/.test(id) || typeof region !== 'string' || !/^[A-Z]{2}$/.test(region)) return null;
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 300) : '';
  const at = Number.isFinite(raw.at) && raw.at > 0 ? Math.min(raw.at, Date.now()) : Date.now();
  return { key: `${kind}:${id}:${region}`, kind, id, name, region, at };
}

export function createHandler({ getStore }) {
  return async function handler(request) {
    const user = await sessionUser(request);
    if (!user) return json({ error: 'Sign-in required' }, 401);
    const store = getStore();
    const key = `alerts/${user}`;
    const stored = await store.get(key, { type: 'json' }).catch(() => null);
    const alerts = (Array.isArray(stored) ? stored : []).map(cleanAlert).filter(Boolean);

    if (request.method === 'GET') return json({ alerts });

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > 4000) return json({ error: 'Too large' }, 413);
      let incoming;
      try { incoming = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const alert = cleanAlert(incoming?.alert);
      if (!alert || typeof incoming.on !== 'boolean') return json({ error: 'Invalid alert' }, 400);
      const rest = alerts.filter(a => a.key !== alert.key);
      const next = incoming.on ? [alert, ...rest].slice(0, LIMIT) : rest;
      await store.setJSON(key, next);
      return json({ alerts: next });
    }

    return json({ error: 'Method not allowed' }, 405);
  };
}

export default async function watchAlerts(request) {
  const { getStore } = await import('@netlify/blobs');
  return createHandler({ getStore: () => getStore({ name: 'streambox-accounts', consistency: 'strong' }) })(request);
}

export const config = { path: '/api/watch-alerts' };
