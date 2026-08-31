# LinguaLive

Real-time speech translation across **202 languages**, running entirely on your
own machine. Speak in one language, hear it in another.

Built on Meta's **NLLB-200** for translation, OpenAI's **Whisper** for speech
recognition, and a text-to-speech pipeline written for this project that layers
Meta's **MMS-TTS** over a from-scratch formant synthesiser.

---

## What it does

- **Batch mode** — record, then get the transcription, translation and spoken
  output in one round trip. End to end in about 7 seconds.
- **Live mode** — captions appear as you speak and settle when you pause, over a
  WebSocket carrying raw PCM.
- **202 languages** for translation, **106** for speech input, and **every one**
  of them for speech output.

## Speech coverage

Getting speech output for all 202 languages needed three backends, tried in
order until one succeeds:

| Backend | Languages | Notes |
|---|---|---|
| **MMS-TTS** (neural) | ~187 | Meta's VITS voices, ~145 MB each, cached on demand |
| **gTTS** | 68 | Covers the CJK languages MMS omits |
| **Formant synthesiser** | any | Written for this project. No weights, no network, no API key |

The last one is ours: a Klatt-style source-filter synthesiser in
[backend/app/tts/synth.py](backend/app/tts/synth.py) — glottal pulse generation,
three cascaded formant resonators, a pitch contour with declination and
phrase-final fall, and rule-based grapheme-to-phoneme conversion. It runs at
**17× real time** and sounds robotic but intelligible. It exists so that
synthesis can never fail outright: languages such as Tibetan, Santali, Shan and
Tamazight have no neural voice anywhere, and this speaks them.

A companion transliteration layer
([translit.py](backend/app/tts/translit.py)) maps Devanagari, Cyrillic, Greek,
Arabic, Hebrew, kana, Thai, Tibetan, Myanmar, Ol Chiki and Tifinagh onto Latin
so the synthesiser can pronounce them. Han ideographs are deliberately not
mapped — a character carries no reading without a per-language dictionary — so
those report honestly that no voice is available.

---

## Requirements

- Python 3.12+
- Node 18+
- ~4 GB free RAM, ~4 GB free disk for model weights
- FFmpeg is **not** required separately; PyAV bundles it

## Quick start

```bash
# 1. Backend dependencies
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate elsewhere
pip install -r backend/requirements.txt

# 2. Configuration (optional; the defaults work)
cp .env.example .env

# 3. Download weights (~2.9 GB, a few minutes)
python backend/scripts/download_models.py

# 4. Start the API
python backend/wsgi.py

# 5. In a second terminal, start the interface
cd web && npm install && npm run dev
```

Open <http://localhost:5173>.

Weights are written to `models/` beside this README — **on whatever drive the
project lives on**, never the system drive. Confirm with:

```bash
curl localhost:5000/api/health
```

---

## Verifying it works

```bash
# Unit tests: fast, no weights needed
cd backend && pytest -q                  # 236 tests, ~8s

# Integration tests: real models, opt-in
pytest -m integration -q                 # 13 tests, ~3min

# Whole stack against a running server
python backend/scripts/smoke_test.py     # 22 checks
```

---

## API

All endpoints are under `/api` and speak JSON.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Status, engine state, resident memory |
| `GET` | `/api/languages` | All 202 languages with per-capability flags |
| `GET` | `/api/languages/<code>` | One language, including external model codes |
| `POST` | `/api/transcribe` | Audio → text (multipart `audio`) |
| `POST` | `/api/translate` | Text → text (JSON or form) |
| `POST` | `/api/speak` | Text → audio |
| `POST` | `/api/pipeline` | Audio → transcription + translation + audio |
| `WS` | `/ws/stream` | Live streaming captions |

```bash
curl -X POST localhost:5000/api/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Good morning","source_lang":"en","target_lang":"hi"}'
# {"text":"सुप्रभात", ...}
```

Failures always return the same envelope, so clients handle one shape:

```json
{ "error": { "code": "capability_unsupported", "message": "...", "details": {} } }
```

### Language capabilities

`/api/languages` reports what each language can actually do:

```json
{ "code": "awa", "name": "Awadhi", "native_name": "अवधी",
  "can_translate": true, "can_transcribe": false, "can_speak": true,
  "has_neural_voice": true, "rtl": false }
```

NLLB covers 202 languages, Whisper 100 and gTTS 68 — they do **not** overlap
neatly. The interface greys out the microphone and speaker per language from
these flags, and the API returns a clean `422` rather than a `500` if a client
asks for something a model cannot do.

---

## Architecture

Inference sits behind an interface, so *where* models run is configuration
rather than a rewrite. That is what keeps the hosting decision cheap.

```
backend/app/
  config.py          env-validated settings; crashes at startup on bad config
  errors.py          typed exception hierarchy, each with an HTTP status
  languages.py       the 202-language registry — single source of truth
  audio.py           decoding and conditioning (float32, [-1,1], any container)
  api/               routes and request schemas
  realtime/          WebSocket streaming: VAD, session state machine
  engines/
    base.py          ASREngine · MTEngine · TTSEngine contracts
    registry.py      builds the configured engine set
    asr_faster_whisper.py   local Whisper via CTranslate2
    mt_nllb_local.py        local NLLB via transformers
    tts_mms.py / tts_gtts.py / tts_formant.py / tts_chain.py
    remote/          Hugging Face Inference API adapters
  tts/
    normalise.py     numbers, currency, abbreviations, URLs → spoken form
    translit.py      11 writing systems → Latin
    synth.py         the formant synthesiser
web/src/
  three/             the audio-reactive orb (GLSL vertex displacement)
  hooks/             useRecorder, useLiveStream
  lib/api.ts         typed API client
```

Switch engines without touching code:

```bash
ENGINE_ASR=hf_inference   # call Hugging Face instead of loading Whisper locally
ENGINE_MT=hf_inference
TTS_CHAIN=gtts,formant    # skip MMS entirely
```

### Live streaming

The browser captures raw Float32 PCM through an `AudioWorklet`, downsamples to
16 kHz, and sends Int16 frames over the WebSocket.

It does **not** use `MediaRecorder` for this. Only the first chunk of a WebM
stream carries the container header, so later chunks cannot be decoded on their
own — streaming them yields exactly one usable chunk and then failures. Raw PCM
sidesteps that entirely and needs no server-side decode.

Server-side, an energy-based VAD with hysteresis and an adaptive noise floor
finds utterance boundaries. Partials are transcribe-only; translation runs once
at the boundary, because NLLB output churns badly on half-finished sentences.

---

## Performance

Measured on an 8-thread CPU, no GPU:

| Operation | Time |
|---|---|
| Transcribe 6.6 s of speech (Whisper small, int8) | ~6 s |
| Translate two sentences (NLLB, int8, beam 4) | **2.3 s** |
| Translate, unquantised fp32 | 11.1 s |
| Synthesise a sentence (MMS) | ~0.8 s |
| Synthesise a sentence (our formant synth) | ~0.06× real time |
| Full speech → speech pipeline | **~7 s** |

Dynamic int8 quantisation of NLLB is the single biggest win — a **5× speedup**
with no measurable quality loss. It is on by default on CPU (`NLLB_QUANTIZE`).

Beam width stays at 4 even for streaming. Dropping to 1–2 saves under a second
but measurably degrades output: at narrow beams this model rendered "brown fox"
into Hindi as an obscenity, which beam search at width 4 avoids.

---

## Configuration

Every setting is documented in [.env.example](.env.example). The most useful:

| Variable | Default | Purpose |
|---|---|---|
| `MODEL_CACHE_DIR` | `./models` | Keeps weights off the system drive |
| `WHISPER_MODEL` | `small` | `tiny`…`large-v3`. `large-v3` is ~5× slower |
| `NLLB_QUANTIZE` | `true` | The 5× CPU speedup |
| `ENGINE_ASR` / `ENGINE_MT` | local | Switch to `hf_inference` for remote |
| `TTS_CHAIN` | `mms,gtts,formant` | Keep `formant` last so speech never fails |
| `EAGER_LOAD_MODELS` | `false` | Set `true` in production |

---

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)**. The short version: with models loaded
this needs **~3 GB of RAM**, which does not fit any 512 MB free tier. The two
workable options are a Hugging Face Space (free, 16 GB) for the full stack, or
Cloudflare Pages plus remote inference for a genuinely free split deployment.

**Cloudflare Workers cannot run PyTorch**, so it is a frontend host here, not a
backend one.

---

## Troubleshooting

**Two servers on one port (Windows).** Werkzeug sets `SO_REUSEADDR`, so a second
`python backend/wsgi.py` binds port 5000 alongside a stale one and requests hit
whichever answers first — including one running old code. Check with:

```bash
netstat -ano | grep ":5000 " | grep LISTENING
```

More than one line means kill them all and start once.

**The IDE reports `Cannot find module 'torch'`.** It is using the system Python.
[.vscode/settings.json](.vscode/settings.json) points it at `.venv`; reload the
window.

**`UnicodeEncodeError` in the console.** Windows terminals default to cp1252,
which cannot encode most of these 202 languages. The logger forces UTF-8, but
for your own scripts set `PYTHONIOENCODING=utf-8`.

**Transcription returns nothing.** Check the audio is real speech. Clipped or
distorted input (peak pinned at 1.0, RMS above ~0.3) transcribes to silence —
healthy speech sits around RMS 0.05–0.15 with gaps between words.

**First request is slow.** Models load lazily. The first translation includes a
~25 s load; subsequent ones are ~2 s. Set `EAGER_LOAD_MODELS=true` to pay it at
startup instead.

---

## Licensing

Verified against the model cards on the Hugging Face Hub:

| Component | Licence | Commercial use |
|---|---|---|
| NLLB-200-distilled-600M | **CC-BY-NC-4.0** | No |
| MMS-TTS voices | **CC-BY-NC-4.0** | No |
| Whisper (via faster-whisper) | MIT | Yes |
| gTTS | MIT (wrapper); Google's terms apply to the service | See Google's terms |
| The formant synthesiser and all code here | This project | Yours |

**The stack as configured is non-commercial**, because NLLB and MMS are the two
models doing the most work. That is fine for a personal or portfolio project,
which is what this is built for.

If that ever changes, the engine abstraction is where you would swap: MADLAD-400
or OPUS-MT (Apache-2.0) for translation, Piper (MIT) for synthesis, Whisper
unchanged. Expect materially narrower language coverage — no permissively
licensed model matches NLLB's 202.

## Previous work

The original scripts are preserved in [legacy/](legacy/) — eleven variants of the
same Flask app plus three Jinja templates. They are superseded but kept for
reference. The defects they shared, and how each is addressed, are catalogued in
the commit history and the module docstrings.
