# Reelwild

Type an animal name, get a finished 9:16 MP4 with a researched voiceover, matching
pictures and burned-in word-by-word captions. It installs on an iPhone from Safari
with "Add to Home Screen" and every service it uses is free.

```
animal-reel/
  app/       Vite + React + TypeScript + Tailwind PWA
  worker/    Cloudflare Worker that holds the API keys
```

## How it works

| Stage | Where it runs | Cost |
| --- | --- | --- |
| Research (Wikipedia REST + Wikidata) | the phone, direct | free, no key |
| Fact extraction | Gemini Flash-Lite via the Worker | ~500 calls/day free |
| Script writing | Gemini Flash via the Worker | ~20 calls/day free |
| Pictures | Pexels, Pixabay, Wikimedia Commons via the Worker | free tiers |
| Voice | Kokoro-82M in the browser | free, no limit |
| Captions, render, MP4 | the phone's canvas and WebCodecs | free |
| Storage | IndexedDB on the phone | free |

One reel costs two Gemini calls: research on the high-quota model and the script on
the good one. Rewriting a single line costs one more, on the high-quota model.

## Setting it up

### 1. Get the free keys

- **Gemini**: <https://aistudio.google.com/apikey>. Check the current model names and
  daily limits there; the Worker's defaults are `gemini-2.5-flash` and
  `gemini-2.5-flash-lite`, overridable in `wrangler.toml`.
- **Pexels**: <https://www.pexels.com/api/> (200 requests/hour, 20,000/month).
- **Pixabay**: <https://pixabay.com/api/docs/>.

### 2. Deploy the Worker

```bash
cd animal-reel/worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put PEXELS_API_KEY
npx wrangler secret put PIXABAY_API_KEY
npx wrangler secret put APP_TOKEN     # optional, any random string
npx wrangler deploy
```

Note the URL it prints, something like
`https://animal-reel-worker.<you>.workers.dev`.

Lock it to your own site once the app is deployed by setting `ALLOWED_ORIGINS` in
`wrangler.toml` to that origin instead of `*`.

### 3. Deploy the app

**GitHub Pages**: push to `main`. The workflow at
`.github/workflows/deploy-animal-reel.yml` builds and publishes it. Enable Pages
once under Settings, Pages, Source: GitHub Actions.

**Cloudflare Pages**: point a project at this repo with build command
`npm ci && npm run build`, build output `dist`, root directory `animal-reel/app`.

**Locally**:

```bash
cd animal-reel/app
npm install
npm run dev      # then open the printed LAN address on the phone
```

### 4. Install on the phone

Open the deployed URL in Safari, tap Share, then "Add to Home Screen". Open it,
go to Library, then the gear, and paste the Worker URL (and the app token if you
set one). Tap "Check the connection" to confirm the keys are in place.

## Using it

1. **Make**: type an animal, pick Alive / Extinct / Auto-detect, pick a style and a
   voice, tap Generate. Research and the script take a few seconds.
2. **Edit**: every line is editable. Each one shows the Wikipedia section and the
   exact quote behind it, so a claim can be checked before it is published. Swap the
   picture, rewrite the line, or re-speak just that line. Then render the voiceover:
   the first run downloads the voice model once, a few hundred megabytes, and caches
   it.
3. **Export**: pick music if you want it, tap Export, then "Save Video" in the share
   sheet. Copy the caption and credits block to paste with the post.

## Facts are checked, not trusted

Gemini has to return a verbatim quote from the fetched article for every fact it
offers. The app looks each quote up in the article text and marks the fact checked or
unverified. **Unverified facts are never sent to the script writer**, and the editor
shows the source next to every line so nothing goes out unexamined.

## Style presets

Four are built in: Documentary, Fast Facts, Creepy/Mystery and Prehistoric. The
Styles tab reads a reel you upload and turns its pacing, captions, motion, colour,
structure and voice into a saved preset you can edit. Only the style is copied.
The reference's clips, audio and script are never reused.

## Export paths

- **WebCodecs + Mediabunny**: H.264 video and AAC audio muxed to MP4, far faster than
  the reel is long. Needs iOS/Safari 26 or later for the AAC encoder.
- **MediaRecorder**: Safari records H.264/AAC natively but only in real time. The app
  detects which one works and says so before exporting.

Settings has an export self test that builds a three second reel from nothing and
encodes it, so a new phone can be checked before any quota is spent.

## When a free limit runs out

- **Gemini Flash (20/day)**: the app automatically finishes the script on Flash-Lite
  rather than losing the research. Turn "Script on Flash" off in Settings to stay on
  Flash-Lite all day.
- **Pexels (200/hour)**: searches are cached per query for a day. Turn on "Prefer
  Commons" to search Wikimedia first.
- **Nothing matched**: the app falls back to a generated illustration, labelled as one
  on the frame and in the credits.

## Credits

Pexels requires attribution and CC BY requires it, so the app tracks the photographer
and source for every picture used and gives you a block to paste. Wikimedia results
are filtered to CC0, public domain, CC BY and CC BY-SA only; anything else is skipped.
