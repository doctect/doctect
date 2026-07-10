# Tutorial Video Series Implementation Plan

> **For agentic workers:** This plan is executed INLINE (superpowers:executing-plans) by the session controller — tasks are tightly coupled around one evolving media harness and the review gates are subjective (voice, pacing, visual feel). Steps use checkbox syntax for tracking.

**Goal:** Five narrated 1080p tutorial episodes (mp4 + transcript + YouTube chapters), produced by scripted Playwright drives + edge-tts narration + ffmpeg assembly.

**Architecture:** `tutorial/` (committed) holds storyboards + three scripts (narrate / record / assemble); `tutorial-videos/` (gitignored) holds rendered output. Sync is achieved by pacing the recording to pre-measured narration durations — no video cutting.

**Tech Stack:** Playwright (recordVideo), edge-tts (`tutorial/.venv`, en-US-JennyNeural), ffmpeg 8 (adelay/amix/loudnorm, libx264+AAC).

**Spec:** `docs/superpowers/specs/2026-07-10-tutorial-video-series-design.md`

## Global Constraints

- Recording servers: scratch SQLite, `RESEND_API_KEY` and `DATABASE_URL` force-unset (never Neon, never real email), API 3001 + vite 5199 (`VITE_API_URL=http://localhost:3001/api/auth`, `TRUSTED_ORIGINS`/`CLIENT_URL=http://localhost:5199`).
- Output video: 1920×1080, libx264 CRF 20, AAC 192k. Voice: `en-US-JennyNeural`.
- `tutorial-videos/` and `tutorial/.venv` in `.gitignore` before anything renders.
- User review gate after Episode 1 — no E2–E5 renders before feedback.

---

### Task 1: Toolchain + narration script + voice sample

- [ ] `python3 -m venv tutorial/.venv && tutorial/.venv/bin/pip install edge-tts`
- [ ] Add `tutorial-videos/` + `tutorial/.venv/` to `.gitignore`.
- [ ] `tutorial/narrate.js`: reads an episode storyboard, for each scene runs `tutorial/.venv/bin/edge-tts --voice en-US-JennyNeural --text ... --write-media sceneK.mp3` (supports optional per-scene `voiceRate` via `--rate`), measures duration via `ffprobe -show_entries format=duration`, writes `epN-audio.json` `[ { scene, file, duration } ]`.
- [ ] Generate a 2-sentence voice sample (`sample.mp3`) — goes to the user together with E1.
- [ ] Commit `tutorial/narrate.js` + gitignore.

### Task 2: Recorder harness

- [ ] `tutorial/lib/servers.js`: start/stop API + vite with the constraint env; expose the API log path (verification links for E4/E5).
- [ ] `tutorial/lib/cursor.js`: init-script injecting a cursor dot + click ripple (fixed-position divs, high z); `humanMove(page, x, y)` eased multi-step `mouse.move` wrapper, `humanClick` with ripple trigger.
- [ ] `tutorial/lib/slides.js`: title-card renderer — navigates to a `data:text/html` styled slide (episode/chapter title, brand colors) for intro/chapter scenes.
- [ ] `tutorial/record.js`: loads storyboard + `epN-audio.json`; launches Chromium (1920×1080, recordVideo into `tutorial-videos/epN/`); per scene: log start timestamp, run `actions(page, ctx)`, idle until `max(elapsed, narrationDuration + 0.6s)`; writes `epN-timing.json`; saves video.
- [ ] Smoke-run: 3-scene throwaway storyboard (title card → landing page → docs page) renders a synced draft; verify cursor visible, pacing correct, A/V aligned after Task 3 assembly.
- [ ] Commit harness.

### Task 3: Assembly script

- [ ] `tutorial/assemble.js`: builds the ffmpeg filtergraph — each scene mp3 `adelay=<startMs>`, `amix` over an `anullsrc` bed of video length, `loudnorm`, mux with the webm → `epN.mp4`; emits `epN-transcript.md` (chapter headings + narration paragraphs) and `epN-chapters.txt` (`MM:SS Title`).
- [ ] Verify on the Task-2 smoke episode: audio starts exactly at scene boundaries (spot-check with ffprobe/ear), file plays in a browser `<video>`.
- [ ] Commit.

### Task 4: Episode 1 — Getting Started (~8 min)

- [ ] `tutorial/episodes/ep1.js` storyboard: intro card → landing tour (hero, gallery CTA, docs link) → create project from "2026 Planner" preset → orientation chapter (hierarchy sidebar, canvas pan/zoom, properties column) → edit a template (select element, change fill, see it on other pages) → export chapter (grayscale toggle off, Export PDF, show the downloaded file count) → outro card (what's next in the series).
- [ ] Render: narrate → record → assemble. Watch the full episode (spot-check screenshots at chapter boundaries + listen to two transitions).
- [ ] **Deliver `ep1.mp4` + `ep1-transcript.md` + `sample.mp3` to the user. STOP — review gate.** Feedback on voice/pacing/cursor/content applies to all subsequent episodes.

### Task 5–8: Episodes 2–5 (after E1 approval)

Per episode: storyboard → transcript to user if content-sensitive → render → spot-check → deliver.

- [ ] E2 Templates & Structure: blank project; add nodes; assign templates; `{{title}}` binding shown live; dynamic grid calendar with `dayOfWeekNum` offset; link targets (parent/child index/specific); variant duplicate + resize.
- [ ] E3 Layers & Artwork: preset project; layers panel tour (create/rename/color/reorder, hide/lock); overlap selection (click-cycle, Alt-click, right-click select-under); Import SVG (crossed-swords fixture); opacity watermark; grayscale preview + export.
- [ ] E4 Cloud & Gallery: sign-up (policy-compliant password), verification via console link (narrated as "check your inbox" flow), save to cloud, history + restore, publish wizard (thumbnails, tags), gallery browse/rate/download-zip.
- [ ] E5 Collaboration: user B forks user A's published project, edits, proposes changes; show owner-notification email (console log excerpt as an overlay slide); owner reviews structured diff + preview, merges; brief conflicted-MR explanation.
- [ ] Deliver all four + transcripts + chapters.

### Task 9: Wrap-up

- [ ] Commit all storyboards; final ledger update; summary with per-episode runtimes and file sizes.

## Self-review notes

- Spec coverage: pipeline (T1–3), five episodes (T4–8), E1 gate honored (T4 stop), fail-safe env in constraints, deliverables per episode in T4/T8.
- Inline execution deliberately chosen; plan is a roadmap with exact commands where they matter, not transcription code.
