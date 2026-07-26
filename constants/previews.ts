// How many preview images one published listing can carry.
//
// It lives here, apart from services/thumbnailService, so a module that needs only the number
// does not also take on that module's module-scope pdf.js worker assignment to get it. In this
// build that costs nothing either way: pdfjs is already in the single `index` chunk every route
// loads, and PreviewPagePicker -- the only importer of this cap -- is in that chunk too, via
// PublishModal. So this is import hygiene, not a measured saving.
//
// The server enforces its own copy (server/routes/projects.js) -- it cannot trust this one --
// so the two have to be changed together.
export const MAX_PREVIEWS = 6;
