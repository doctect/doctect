---
title: Generator Provenance
summary: Applying saves both scripts with the project — they travel through saves and forks, and become public on publish.
aliases: saved scripts, generator source, publish scripts warning, provenance
keywords: provenance, saved scripts, generator source, current saved source, fork, publish, public, warning, travel
---

Applying a generated project stores **both scripts, verbatim**, plus a timestamp, *with* the project as its generator provenance. They travel everywhere the project does — local saves, downloaded project files, cloud saves, and forks of your published work. Reopen the modal in such a project and the **Preset:** selector offers **Current saved source**, marked "Saved Generator" in the toolbar. Two rules keep it safe: opening source never *runs* it (nothing executes until you press [Preview](/docs/reference/generator-preview)), and there is **no reverse sync** — hand edits on the canvas are never written back to the scripts.

Provenance travels through **publishing** too: publish to the gallery and both scripts become **public**, readable by anyone and carried into every fork. The publish wizard warns in exactly these terms and tells you to review them for secrets, private comments, or identifying information. **Comments count** — a stray `// TODO: ask Sam about the client's rates` ships to the world with the design.

See [Scripts travel with the project](/docs/generator/generator-basics#scripts-travel-with-the-project).
