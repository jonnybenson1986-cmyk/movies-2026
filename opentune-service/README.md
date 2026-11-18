# StreamBox OpenTune search service

This is a small, separate Python backend for StreamBox's planned OpenTune-first music catalogue.

- Search: `GET /api/search?q=artist%20song`
- Health: `GET /api/health`
- Search results include YouTube video IDs and artwork metadata.
- Playback must use YouTube's official embedded player in StreamBox. This service does not download, extract, proxy, or re-host audio.
- Audius and the existing legal music sources remain available as fallbacks.

## Deploy free on Render

1. In Render, create a new **Blueprint** and select the StreamBox GitHub repository.
2. Render detects `opentune-service/render.yaml`.
3. Set `ALLOWED_ORIGINS` to the exact HTTPS origin of your StreamBox site (for example, your Netlify production domain). Do not include a path or trailing slash.
4. Deploy. Render will provide an HTTPS service URL.
5. Check `https://YOUR-SERVICE.onrender.com/api/health`.

The free instance may sleep when idle and take longer to answer its first request. Free instance filesystems are not persistent, so this search-only service deliberately stores no user accounts, likes, or history. StreamBox can keep personal favourites and history locally.

## Local test

```sh
cd opentune-service
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Then open `http://localhost:8000/api/search?q=Daft%20Punk`.
