// The signed-in person's saved data: GET returns it, PUT saves changes (My List, Continue Watching,
// where they are up to). Stored per username in Netlify Blobs. The gate has already checked the sign-in
// before this runs, and it is checked again here because this is where private data is read and written.
import { sessionUser } from '../lib/auth.mjs';
import { LIMITS, EMPTY, cleanData, mergeData } from '../lib/account-data.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function createHandler({ getStore }) {
  return async function handler(request) {
    const user = await sessionUser(request);
    if (!user) return json({ error: 'Sign-in required' }, 401);

    const store = getStore();
    const key = `user/${user}`;
    const stored = (await store.get(key, { type: 'json' }).catch(() => null)) || EMPTY();

    if (request.method === 'GET') return json({ user, data: { ...EMPTY(), ...stored } });

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > LIMITS.bytes) return json({ error: 'Too large' }, 413);
      let incoming;
      try { incoming = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const merged = mergeData(stored, cleanData(incoming));
      await store.setJSON(key, merged);
      return json({ user, data: merged });
    }

    return json({ error: 'Method not allowed' }, 405);
  };
}

export default async function me(request) {
  const { getStore } = await import('@netlify/blobs');   // only needed when running on Netlify
  return createHandler({ getStore: () => getStore({ name: 'streambox-accounts', consistency: 'strong' }) })(request);
}

export const config = { path: '/api/me' };
