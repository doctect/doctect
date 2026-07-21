---
title: Ratings, Reviews, and Profiles
difficulty: beginner
time: 6 min
summary: Star ratings and written reviews — who can write what — plus public author profiles.
keywords: rating, stars, review, report, profile, author
prerequisites: gallery/accounts-and-usernames
---

Your project [has a public page](/docs/gallery/publishing) now, or you've at least browsed plenty of other people's. This tutorial is about the conversation that happens on those pages: the star ratings and written reviews at the bottom of [every project page](/docs/gallery/browsing-without-an-account#a-project-page), and the public profile every author gets. None of it is complicated, but the rules about *who* can write *what* are precise — and once you know them, everything about the reviews section makes sense at a glance.

The one-sentence summary, before the details: **anyone can read reviews, signed out included; writing one takes an account with a [username](/docs/gallery/accounts-and-usernames#your-username); and nobody can review their own project.**

## Rating a project

Scroll down any project page and you'll find the **Reviews** section. If you're signed in with a username — and the project isn't yours — it starts with a small form: **Rate this project**, a row of five stars, and an optional text box.

Click a star to set your rating, 1 to 5. The stars are the one required part: **Save review** stays disabled until you've picked a rating, while the text box is exactly what its placeholder says — "Share what you think (optional)". A rating with no words is a perfectly good review.

> [!NOTE]
> The star picker isn't a row of image buttons you can only click — it's a real, keyboard-accessible control. Press `kbd:Tab` and the whole row is a single stop; then the **arrow keys** set your rating — right or up for more stars, left or down for fewer. The choice registers as you arrow, no extra confirm step, and because it's built as a proper radio group, a screen reader announces it as "Rating" with each star read out as "1 star" through "5 stars".

What your stars feed is the project's **average rating**, and it's worth knowing how that number works: it isn't a stored total that could drift out of date — it's computed fresh from the reviews themselves every time anyone loads a card or page. Save, change, or delete your review and every average everywhere reflects it on the next load, rounded to one decimal and drawn as partially-filled stars (a 4.3 shows as four-and-a-bit). You'll see the same live number in four places: next to the project's title, in the Reviews heading, on its gallery card, and behind the gallery's **Top rated** row and sort. Until the first rating arrives, the page says "No ratings yet" and the card simply shows no stars.

## Writing, editing, deleting

The rules, in one list:

- **One review per person per project.** Your rating and your text are a single review, and you only ever have one. Come back later and the form reappears pre-filled under the heading **Your review** — change the stars, edit the words, click **Save review**, and it replaces what you wrote before. There's no pile-up of duplicates to manage.
- **Stars required, words optional.** 1 to 5 stars, plus up to 2,000 characters of text if you have something to say.
- **Reading is free; writing needs a username.** Signed out, the section shows every review plus a "Sign in to review" link. Signed in without a public handle yet, that link becomes "Set a username to review" — reviews are signed, so the [username rule](/docs/gallery/accounts-and-usernames#your-username) applies in full.
- **You can't review your own project.** On your own page the form simply isn't there — and this isn't just a hidden button: the server refuses the request outright ("You can't review your own project"), so there's no way to nudge your own average.
- **Delete any time.** Your review card comes with a **Delete review** button that removes stars and text together, and the averages update with the next load, same as always.

Each published review shows its author's username (linked to their profile), their stars, the text, and the date it was last saved — newest first.

![The reviews section on a project page: the pre-filled Your review form with four stars set, and the saved review below it signed by its author](/docs-assets/gallery/reviews-section.png "One review per person: the same review, editable in the form above and published in the list below")

One small rule that says something about the platform's priorities: while *writing* a review requires a username, *deleting* your own doesn't. An account that never picked a handle — say, a Google sign-in that never finished the welcome step — can still remove its own review. Cleaning up after yourself is never gated.

## Reporting

Every review card carries a small flag icon in its corner. If a review is spam or abusive, click it: you'll be asked for a reason ("Why are you reporting this review?"), and the report goes to the moderators — who can remove the review if it crosses the line. Reporting works signed out too, just like the project-level **Report** link [from the first gallery tutorial](/docs/gallery/browsing-without-an-account#a-project-page); both feed the same moderation queue.

Expectations, honestly set: reporting sends the review to a human, full stop. You'll get a "Thanks — the report was sent." confirmation and nothing visibly changes on the page — reports are input to moderation, not a public downvote.

## Author profiles

Usernames aren't just signatures — every one of them is a link. The "by atlas_designs" on a gallery card, the author line on a project page, the name on a review: all of them lead to that person's public profile at `/u/` followed by their username.

![The public profile page for atlas_designs: username, join date, and a grid of published project cards](/docs-assets/gallery/profile-page.png "A profile is exactly three things: the handle, the join date, and the published work")

A profile shows exactly three things: the **username**, the **join date**, and a grid of that author's **published projects** — each card a click into its project page. That's the entire list. No email, no real name, no private or unpublished work, no cloud saves; the [privacy boundary from the accounts tutorial](/docs/gallery/accounts-and-usernames#your-username) holds here, on the most public page an account has. An author who hasn't published yet just shows "No published projects yet.", and a username that doesn't exist — including an old handle after its owner renamed — gets "User not found".

Two consequences follow from "published projects only". First, [unpublishing a project](/docs/gallery/publishing#unpublishing) removes it from your profile along with the gallery, and its reviews go out of public view with the page — hidden, not deleted, so republishing later brings the page *and* its accumulated reviews back. Second, your profile is the public scoreboard your reviews feed: the ratings on those cards are the same live averages from the top of this tutorial, computed from what other people wrote about your work.

You now know the whole feedback loop: ratings that can't drift, one honest review per person, a report flag for the rest, and a profile page that collects what you've shipped. What's left in this track is the deepest form of feedback the gallery supports — taking someone's project, changing it, and offering the changes back. That's forking and merge requests, up next.
