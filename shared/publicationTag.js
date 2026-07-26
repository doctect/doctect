// The precondition token for PATCH /api/projects/:id/publication, sent as an If-Match entity
// tag. It identifies a listing by BOTH the commit that was published and the moment it was
// published.
//
// The commit alone is not enough. POST /api/projects/:id/publish gates only on
// head_commit_id, never on the head having moved, so republishing an UNCHANGED commit
// rewrites published_description, published_tags, the thumbnails and published_at while
// leaving published_commit_id byte-identical. A dialog opened before such a republish would
// still hold a matching commit id, its save would be accepted, and the listing would end up
// with text from before the republish and previews from after it — the exact mixture the
// precondition exists to refuse.
//
// Residual, stated rather than hidden: SQLite's CURRENT_TIMESTAMP has whole-second
// resolution, so two publishes inside the same second are indistinguishable here. That is
// why published_at is a second factor and not the sole token.
//
// Lives in shared/ because the server builds this from a `projects` row and the client builds
// it from the gallery DTO. A format that drifted between the two would reject every edit.
//
// ENCODING, and it is not cosmetic. expectedHeadFromRequest requires an entity tag to match
// /^"([\x21\x23-\x7e]+)"$/ — a character class with no space and no double quote. SQLite hands
// back CURRENT_TIMESTAMP as the string "2026-07-26 06:10:02", whose space would make an
// unencoded composite fail that check as malformed on every SQLite deployment. Postgres has
// no setTypeParser override in server/db.js, so a TIMESTAMP column arrives as a Date and
// res.json serialises it with toISOString(); the Date branch below reproduces exactly that,
// so the server compares against the same text the client was handed.
// encodeURIComponent never emits a space or a quote, so both engines' formats fit the class.
//
// '~' separates the halves because encodeURIComponent leaves it unescaped while neither half
// can contain one: commit ids are UUIDs (hex and hyphens) and timestamps carry only digits,
// '-', ':', ' ', '.', 'T', 'Z' and '+'.
//
// DEPLOYMENT NOTE, Postgres only: on Postgres this token depends on the Node process's TZ, not
// only on what the row contains. published_at is declared TIMESTAMP — `timestamp without time
// zone` — so the wire text carries no offset, and pg's parser (postgres-date, registered for
// OID 1114 in pg-types/lib/textParsers.js) falls to `new Date(year, month, day, ...)`, the
// multi-argument constructor, which reads its components in the process's LOCAL zone.
// Verified by parsing the identical wire text '2026-07-26 06:10:02' under three zones:
//   TZ=UTC              -> 2026-07-26T06:10:02.000Z
//   TZ=America/New_York -> 2026-07-26T10:10:02.000Z
//   TZ=Asia/Kolkata     -> 2026-07-26T00:40:02.000Z
// So two app instances deployed with different TZ derive different tokens from one identical
// row: a GET served by one and a PATCH served by the other would 409 every edit. It fails
// CLOSED — an owner sees "reopen to edit the current version", never a corrupted listing — and
// TZ=UTC is the usual container default, so this is a note rather than a defect. It cannot
// arise on SQLite, where the driver returns the raw string and String() is the identity.
// Keep every instance on one TZ (UTC), or migrate these columns to a zone-aware, sub-second
// timestamp: TIMESTAMPTZ makes Postgres send an offset, which sends the parser down its UTC
// branch and removes the dependence entirely. That same migration is the one that would close
// the same-second residual above — though on SQLite it would also need CURRENT_TIMESTAMP
// replaced with a sub-second default, since the whole-second resolution is that default's
// format rather than the column's type.
export const publicationTag = (publishedCommitId, publishedAt) =>
    `${publishedCommitId}~${encodeURIComponent(
        publishedAt instanceof Date ? publishedAt.toISOString() : String(publishedAt),
    )}`;
