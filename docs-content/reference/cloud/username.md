---
title: Username
summary: Your public handle — 3–30 characters of letters, numbers, and underscores — required before any cloud or gallery action that stores or says something in public.
aliases: handle, public name, change username, username
keywords: username, handle, public name, change username, 3-30 characters, underscore, letters numbers, welcome, profile, u slash, cloud save, publish, fork, review, propose
---

Your **username** is the entire public surface of your account — the "by …" on a gallery card, the author line linking to your [profile](/docs/reference/profile-page) at `/u/your_username`, the signature on reviews and merge requests, the "forked from" name on someone's fork. Your real name and email appear in none of these. The rule is **3–30 characters, letters, numbers, and underscores only** (`/^[a-zA-Z0-9_]{3,30}$/`) — no spaces, no hyphens; capitals are accepted but kept lowercase, so `Planner_Pro` and `planner_pro` are the same handle.

A username is **required before the five cloud/gallery actions that store or say something in public** — [cloud save](/docs/reference/cloud-save), publish, [fork](/docs/reference/fork), propose changes, and review — and the server enforces it, not just the buttons; without one, any of those requests is refused ("Set a public username…") and Google sign-ups, which skip the field, are routed to `/welcome`. You can **change it any time** in Account settings, and the change is immediate and total — but the **old `/u/` URL stops resolving** (it 404s, and the old handle is released for others to claim), so it's a real rename, not a redirect.

See [Your username](/docs/gallery/accounts-and-usernames#your-username).
