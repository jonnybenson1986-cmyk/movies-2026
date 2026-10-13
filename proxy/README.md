# StreamBox stream proxy

A tiny, dependency-free Node server that lets the StreamBox web app play channels a browser can't load on its own:

| Problem | What the proxy does |
|---|---|
| The stream's server sends no CORS headers (most common failure) | Adds them |
| The stream is plain `http://` and the app is on `https://` (browsers block that) | Serves it back over your https proxy |
| The channel needs a specific `User-Agent` or `Referer` (browsers can't set those) | Sends the values from the playlist |

It does **not** get around region locks. A channel that's blocked in the proxy's country is still blocked, and it doesn't touch DRM or paid streams.

## Run it

```bash
node proxy/server.mjs                          # http://localhost:8787
ALLOWED_ORIGINS=https://your-site.netlify.app PROXY_TOKEN=pick-a-secret node proxy/server.mjs
```

| Variable | Meaning |
|---|---|
| `PORT` | default `8787` |
| `ALLOWED_ORIGINS` | comma-separated site origins allowed to use the proxy |
| `PROXY_TOKEN` | optional secret. Requests must carry `?k=<token>`, and StreamBox adds it for you |
| `MAX_CONNECTIONS` | concurrent upstream requests, default `60` |
| `ALLOW_PRIVATE=1` | **development only**: allow loopback/private upstream addresses |

Then in StreamBox: **Settings → Stream proxy**, paste the proxy's **https** URL (and the token), and Save. StreamBox checks `/health`, and from then on every channel is playable in the app. It tries the direct route first and uses the proxy only when needed.

### Quickest try-out (desktop)
```bash
npm run proxy            # or: node proxy/server.mjs
```
In StreamBox: **Settings → Stream proxy → This computer → Save**. An https site may call a proxy on `localhost`, so this works with the deployed Netlify site too, in the same browser.

### Using it from your phone
The proxy has to be reachable from the internet over https. Easiest options:

- **Docker on any host** (VPS, Fly.io, Render, Railway): `docker build -t streambox-proxy ./proxy` and run it with the variables above. Most hosts give you https automatically.
- **Your own computer, temporarily:** run it locally and expose it with a tunnel such as `cloudflared tunnel --url http://localhost:8787`. Fine for a demo, but your computer must stay on.

Video is a lot of traffic: every second you watch passes through the proxy. Check your host's bandwidth allowance and acceptable-use rules. Don't use serverless functions (Netlify/Vercel), which cap response size and time and generally disallow this kind of use.

## Security
- **SSRF protection:** the proxy refuses private, loopback, link-local and cloud-metadata addresses, checked at connect time (so DNS tricks don't work), including after redirects and for IPv6.
- Only `http`/`https` URLs, at most 5 redirects, 15 s upstream timeout, 5 MB manifest limit, concurrency cap.
- With no `PROXY_TOKEN` or `ALLOWED_ORIGINS` set the proxy is open to anyone who finds it, and it warns you at startup. **Set at least one before exposing it.**
