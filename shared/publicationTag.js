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
export const publicationTag = (publishedCommitId, publishedAt) =>
    `${publishedCommitId}~${encodeURIComponent(
        publishedAt instanceof Date ? publishedAt.toISOString() : String(publishedAt),
    )}`;
