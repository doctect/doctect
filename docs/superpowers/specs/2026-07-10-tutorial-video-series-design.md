# Tutorial Video Series (5 Episodes) — Design

**Date:** 2026-07-10
**Status:** Approved, ready for implementation planning

## Goal

Five narrated screen-recording tutorial episodes for YouTube, produced entirely from code:
scripted Playwright app drives + edge-tts narration, assembled with ffmpeg. Deliverables per
episode: `epN.mp4` (1080p h264 + AAC), `epN-transcript.md`, YouTube chapter timestamps.

## Production pipeline

Lives in `tutorial/` at the repo root (committed); rendered output in `tutorial-videos/`
(gitignored).

### Storyboards — `tutorial/episodes/epN.js`

An episode is an ordered array of scenes:

```js
{
  chapter: 'Creating your first project',   // optional: starts a YouTube chapter
  narration: 'Let\'s create a project from the 2026 Planner preset...',
  actions: async (page, ctx) => { /* playwright steps; end in a visually idle state */ },
}
```

- `narration` strings ARE the transcript — `epN-transcript.md` is generated from them.
- `ctx` carries shared state (created project ids, user creds, server log path for
  verification links).
- Title-card scenes render a styled HTML slide (episode title / chapter name) served from a
  `data:` URL or local file — no app interaction.

### Recorder — `tutorial/record.js`

- Boots throwaway servers per episode: API on 3001 with scratch SQLite
  (`SQLITE_PATH=/tmp/tutorial-epN-*.db`), NO `RESEND_API_KEY` and NO `DATABASE_URL`
  (console-fallback email; never touches Neon or Resend), vite on 5199 with
  `VITE_API_URL=http://localhost:3001/api/auth`.
- One continuous Chromium session per episode, viewport 1920×1080,
  `recordVideo: { size: { width: 1920, height: 1080 } }`.
- **Cursor overlay:** init script injects a pointer dot + click-ripple element driven by a
  small wrapper around `page.mouse` (raw Playwright video shows no cursor). Human-like
  movement: eased multi-step `mouse.move`.
- **Pacing = sync:** before recording, every scene's narration mp3 is generated and measured
  (ffprobe). During recording, a scene runs its actions, then idles until
  `max(actionTime, narrationDuration + 0.6s)` has elapsed since scene start. Scene start
  timestamps (relative to video start) are written to `epN-timing.json`.
- Scene failure: retry the whole episode (deterministic drives; cheap compared to debugging
  mid-video state).

### Narration — `tutorial/narrate.js`

- `edge-tts` (installed in a project-local venv `tutorial/.venv`; NOT a repo dependency),
  voice **en-US-JennyNeural**, one mp3 per scene: `tutorial-videos/epN/scene-K.mp3`.
- Rate/pitch defaults; tweakable per scene via optional `voiceRate` field.

### Assembly — `tutorial/assemble.js`

- Audio: each scene clip delayed to its recorded timestamp (`adelay`), mixed over silence the
  length of the video (`amix`), normalized (`loudnorm`).
- Mux with the episode's webm video → `epN.mp4` (libx264 CRF 20, AAC 192k).
- Emit `epN-chapters.txt` (YouTube `MM:SS Chapter` lines from chapter scenes) and
  `epN-transcript.md`.

## Episodes

| Ep | Title | ~Length | Content |
|----|-------|---------|---------|
| 1 | Getting Started | 8m | Landing tour, docs peek, create from 2026 Planner preset, hierarchy/canvas/properties orientation, edit a template, export PDF |
| 2 | Templates & Structure | 10m | Blank project, nodes+templates, data binding `{{title}}`, dynamic grid calendar (offset), smart linking (parent/child/specific), variants |
| 3 | Layers & Artwork | 8m | Layers panel (create/rename/color/reorder), hide/lock, overlap selection (click-cycle, Alt-click, right-click menu), SVG import, opacity watermark, grayscale preview + export |
| 4 | Cloud & Gallery | 8m | Sign-up + email verification (console-link flow), save to cloud, version history/restore, publish wizard, gallery browse/ratings/download |
| 5 | Collaboration | 7m | Fork from gallery (second user), edit, propose changes, owner notification email, review diff + preview, merge; conflicts in brief |

Episode 4/5 accounts are throwaway users on the scratch DB; the verification link is pulled
from the server console log — shown in the video as the real flow (narration explains that a
normal deployment sends a real email).

## Delivery order

1. Pipeline + **Episode 1** rendered → user reviews (voice, pacing, cursor, style).
2. Corrections applied → Episodes 2–5 rendered.
3. Transcripts are reviewable text before any render.

## Constraints & risks

- edge-tts requires network at narration time.
- Videos are deterministic scripted runs; timing jitter handled by generous waits + episode
  retry.
- `tutorial-videos/` and `tutorial/.venv` gitignored; `tutorial/` code committed.
- No real email/DB ever touched during recording (same fail-safe env stripping as e2e).
