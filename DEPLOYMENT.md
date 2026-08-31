# Deployment

Read this before picking a host. The memory figure below rules out most free
tiers, and knowing that up front saves a wasted afternoon.

## The constraint

Measured on this machine with all models loaded and warm:

| Component | Resident memory |
|---|---|
| Flask + dependencies, no models | ~195 MB |
| \+ Whisper `small` (CTranslate2 int8) | ~700 MB |
| \+ NLLB-600M (int8 dynamic quantised) | **~2.8–3.0 GB** |
| \+ one MMS voice cached | ~3.0 GB |

Reproduce it yourself at any time:

```bash
curl localhost:5000/api/health | python -c "import sys,json; print(json.load(sys.stdin)['memory'])"
```

**This does not fit in a 512 MB free tier.** Not with smaller models either:
NLLB-600M is the smallest NLLB that covers 202 languages, and it is ~600 MB even
at int8 before PyTorch's own overhead.

So there are two honest options, and the engine abstraction exists so that
choosing between them is a config change rather than a rewrite.

---

## Option A — one container, models included

Best when you want a single deployable and can pay for ~4 GB of RAM.

| Host | Free tier fits? | Notes |
|---|---|---|
| **Hugging Face Spaces** | **Yes** — 16 GB RAM, 2 vCPU | The only genuinely free host that fits. Sleeps after 48h idle. |
| Railway | No free tier; ~$5/mo Hobby | Trial credit runs out fast with 4 GB. Good DX. |
| Fly.io | No — free VMs are 256 MB | A 4 GB machine is a few dollars a month. |
| Render | No — free is 512 MB | Needs the 4 GB Standard instance. |
| Cloudflare Workers | **Never** — cannot run PyTorch | Use Pages for the frontend only. |

### Deploying

```bash
docker build -t lingualive .
docker run -p 8000:8000 -v lingualive-models:/app/models lingualive
```

The volume matters. Without it, every cold start re-downloads ~2.9 GB of
weights. `EAGER_LOAD_MODELS=true` is set in the image so the container is not
declared healthy until the models are actually resident — that is why the
healthcheck allows a 180 second start period.

**Railway:** `railway up`. It reads `railway.json`, builds the Dockerfile, and
health-checks `/api/health`. Attach a volume at `/app/models` before the first
deploy.

---

## Option B — split: static frontend, remote inference

Best when you want the UI on a genuinely free, always-on CDN and are willing to
let someone else host the models.

```
Cloudflare Pages (free, always on)      Hugging Face
  └── React SPA  ──fetch──▶  Flask API ──▶ Inference API
                             (~200 MB)     NLLB + Whisper
```

Set on the API service:

```bash
ENGINE_ASR=hf_inference
ENGINE_MT=hf_inference
HF_TOKEN=hf_...          # required; startup fails without it
```

Resident memory drops to roughly 200 MB because PyTorch never loads a model,
which does fit a 512 MB tier. The trade is HF's free-tier rate limits and
cold starts on their side. The models are identical, so language coverage does
not change.

### Frontend on Cloudflare Pages

```bash
cd web
npm run build
npx wrangler pages deploy dist --project-name lingualive
```

Set `VITE_API_BASE=https://your-api.example.com` at build time so the SPA calls
the right origin, and add that origin to `CORS_ORIGINS` on the backend.

Cloudflare Pages serves the SPA free and always-on, so the interface loads
instantly even while an API on a sleeping tier is waking up.

---

## Recommendation

Deploy the backend to a **Hugging Face Space** (free, 16 GB, fits Option A
comfortably) and the frontend to **Cloudflare Pages** (free, always on). That is
the only combination that is both genuinely free and runs the real models.

If you would rather keep everything on one host and can spend ~$5/month, Railway
with a 4 GB instance and a mounted volume is the least fuss.

---

## Pre-deploy checklist

```bash
# 1. Tests pass
cd backend && pytest -q

# 2. The image builds and the container becomes healthy
docker build -t lingualive .
docker run -d -p 8000:8000 -v lingualive-models:/app/models --name lg lingualive
docker logs -f lg          # wait for "Application ready"

# 3. Smoke-test the running container
python backend/scripts/smoke_test.py --base-url http://localhost:8000

# 4. Frontend builds clean
cd web && npm run typecheck && npm run build
```

## Production settings

```bash
ENVIRONMENT=production
LOG_FORMAT=json               # structured logs for aggregation
EAGER_LOAD_MODELS=true        # do not make the first user wait
CORS_ORIGINS=https://your-frontend.pages.dev
```

Never set `FLASK_DEBUG`. `wsgi.py` hardcodes `debug=False` precisely so the
interactive debugger console can never be exposed.

## Scaling

Run **one worker**. The models are held in process memory, so a second worker
doubles RSS without doubling throughput. Add threads (`--threads 4`) for
concurrency, or a second service behind a load balancer if you need more.
