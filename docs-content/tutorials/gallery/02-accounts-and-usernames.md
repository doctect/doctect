---
title: Accounts, Verification, and Usernames
difficulty: beginner
time: 8 min
summary: Sign up, verify your email, pick your public username — what each unlocks and how to change things later.
keywords: account, sign up, google, password, verification, username, handle, profile, settings
prerequisites: gallery/browsing-without-an-account
---

You've built projects, exported PDFs, and [toured the whole gallery](/docs/gallery/browsing-without-an-account) without ever signing in. So before this tutorial asks you to create an account, it owes you an honest answer to the obvious question: *what for?* The short version: an account is how your work gets a life beyond this browser — saved to the cloud, published for others, forked from others — and a **username** is the public name all of that happens under. This tutorial walks the whole path once: sign up, verify your email, understand why the username matters, and find the settings page where everything stays changeable later.

## Local-first, account-optional

PDF Architect is local-first. Your projects persist locally in IndexedDB through `LocalWorkspaceStore`, the editor and generator run in your browser, and PDFs render there — none of it touches an account, and none of that changes today. Signing up doesn't move, upload, or convert anything. Cloud storage remains explicit opt-in: **Save to cloud** adds a remote snapshot without replacing the local project.

What an account adds is precisely the actions that reach beyond your machine:

- **Save to the cloud** — named versions of a project, kept safe on the server as a permanent history you can restore from.
- **Publish to the gallery** — turn a project into a public page anyone can browse.
- **Fork** — the copy-with-a-memory of someone else's project (unlike the no-strings **Open in editor** from the last tutorial).
- **Propose changes** — send a fork's edits back to the original as a merge request.
- **Rate and review** — put your opinion of a published project where others can read it.

Notice what those five have in common: every one of them either stores something under your name or says something in public. That's the whole account boundary — and it's why each of them needs not just an account but a public username, which we'll get to shortly.

## Signing up

Click **Sign in** in the top-right of any page (the editor has it too), or go to `/login`. The page opens in sign-in mode; click **Sign Up** at the bottom to flip it to the **Create Account** form:

![The Create Account form with Name, Username, Email, and Password filled in, ready to submit](/docs-assets/gallery/signup-form.png "Four fields — and only one of them, Username, will ever be shown publicly")

Four fields, with very different audiences:

| Field | Who sees it |
| --- | --- |
| **Name** | Only you. It's never displayed publicly anywhere. |
| **Username** | Everyone — this is your public handle. There's a hint under the field, and a whole section on it below. |
| **Email** | Only you. Used to sign in and verify; never shown publicly. |
| **Password** | Nobody, ideally. |

> [!NOTE]
> The password rule is checked before anything is sent, and again by the server: **at least 12 characters**, using **at least 3 of** these 4 kinds — lowercase, uppercase, digits, symbols. Fall short and the form tells you exactly which condition failed ("Password must be at least 12 characters", "Password must use at least 3 of: lowercase, uppercase, digits, symbols"). A long passphrase with a capital letter and a digit sails through. The rule applies whenever a password is *set* — signing up, changing it, resetting it — never when signing in, so an existing password keeps working until you change it.

Prefer not to have a password at all? **Sign in with Google** below the form signs you up and in with one click. Google accounts skip the email-verification step entirely (Google already vouched for the address) — but they skip the username field too, which is exactly why the `/welcome` prompt in the username section below exists.

One thing you might run into: account signups are capped, and when the cap is reached the form is replaced by a small waitlist — leave your email and you'll hear when spots open. Everything from the earlier tutorials keeps working without an account in the meantime.

## Verify your inbox

Submit the form and you won't be signed in — not yet. You'll get this panel instead:

![The Verify your email panel, telling the user a verification link was sent to their address, with a Resend email button](/docs-assets/gallery/verify-email-panel.png "Signed up, not yet signed in — the account wakes up when you click the emailed link")

A [verification link](/docs/reference/email-verification) is on its way to your address, and the account stays dormant until you click it. There's no code to copy — the link is the whole ceremony. Click it and three things happen at once: the address is confirmed, you're **signed in automatically**, and you land back in the app with a green "Email verified — you're signed in" banner, continuing to wherever you were originally headed.

Until then, the account genuinely won't sign in — the same **Verify your email** panel appears if you try. Some fine print that's useful to know:

- **The link expires after 1 hour.** Take longer and you'll just need a fresh one — nothing is lost.
- **Resend email** on the panel gets you a new link — but at most **one email per address every 5 minutes**. Clicking resend again inside that window won't send another copy; the one already in your inbox is still the valid one.
- **A refused sign-in re-sends the link too** (same 5-minute limit). So if you closed everything and lost the email, the recovery is pleasantly lazy: go back to `/login`, try to sign in, and check your inbox again.

> [!TIP]
> No email after a minute or two? Check spam first — then use **Resend email** once. Mash it five times and you've sent exactly the same one email you'd have sent clicking it once.

## Your username

Here's the part worth actually understanding, because it's the reason accounts are shaped the way they are.

Everything public in PDF Architect happens under a handle that *isn't* your real identity. When you publish, the gallery card says "by you" — your username. The author line on your project's page links to your public profile at `/u/your_username`, which shows your username, when you joined, and your published projects — nothing else. Reviews you write are signed with it. Merge requests you propose carry it. When someone forks your project, their copy's "forked from" line names it. Your real name and email appear in none of these places, ever — the username is the entire public surface of your account.

That's why the five account actions from the first section — cloud save, publish, fork, propose changes, review — **require a username before they work**, and the server enforces it, not just the buttons: without one, any of those requests is refused with "Set a public username before using cloud/gallery features." A publish with no author line, or an anonymous review, just isn't a thing the system can represent. Browsing, downloading, and opening projects in your editor stay username-free, exactly as in the last tutorial.

The rules are simple: [**3–30 characters, using letters, numbers, and underscores**](/docs/reference/username) — no spaces, no hyphens. Capitals are accepted but usernames are kept lowercase, so `Planner_Pro` and `planner_pro` are the same handle. It doesn't have to be your real name, and — worth internalizing early — **it isn't permanent**; you can change it any time in Account settings.

If you signed up with the email form, you already chose one — the form required it, so you may never see the prompt below. But sign in with Google (which never asks) and the app has a signed-in user with no public handle. The moment such an account heads for any of the five gated actions — the cloud menu shows **Set a username to use cloud features**, a project page shows **Set a username to fork** or **to review**, the account menu shows **Set username** — it's routed to the `/welcome` page:

![The Choose a username page mid-flow, with a username typed in and a green Available check under it](/docs-assets/gallery/welcome-username.png "The availability check runs as you type — green check, then Continue")

The form checks availability live as you type — "Checking availability…", then **✓ Available** or **✗ Already taken** — so there's no submit-and-hope. Click **Continue** and you're sent right back to whatever you were doing when the app interrupted you.

## Account settings

Once you're signed in, your username sits in the top-right of every page. Click it and the account menu opens: **My profile**, **Gallery**, **My projects**, **Account settings**, **Sign out**. The settings page (`/account`) is deliberately small:

![The Account settings page: signed-in email, the username form, and the change-password section](/docs-assets/gallery/account-settings.png "Everything changeable about your account, on one short page")

**Changing your username** is the same form with the same live availability check, ending in **Save changes**. The change is immediate and total: every gallery card, review, and merge request shows the new handle at once, and your profile moves to the new `/u/` address. The one real consequence: **the old profile URL stops existing** — anyone following an old `/u/old_name` link gets "User not found". Your projects, reviews, and history are all untouched; only the name on them changes. (The old handle also becomes available for others to claim, so it's a real release, not a redirect.)

**Changing your password** asks for the current one, the new one twice, and holds the new one to the same 12-character rule from signup. One deliberate side effect: when it succeeds, **every other session of your account is signed out**. If the reason you're changing it is "someone else might have it", that someone is now logged out everywhere — which is the point.

If you signed up with Google, there's no password section at all — there's no password on the account to change, and that's not an oversight but the shape of the account.

> [!NOTE]
> A recurring theme, stated once plainly: your **real name and email are never shown publicly**. The "Signed in as…" line on the settings page is visible only to you, the Name field from signup is displayed nowhere, and your public profile exposes exactly three things — username, join date, published projects. What the world can see of you is the username you chose, and you chose it knowing that.

## What you can do now

You have a verified account and a public handle, and you know where both are managed. Every locked door from the last tutorial — the "Sign in to fork", the "Sign in to review" — is now open. The next tutorials in this track walk through them one at a time, starting with saving a project to the cloud and publishing it to the gallery.
