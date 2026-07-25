// How many preview images one published listing can carry.
//
// This lives apart from services/thumbnailService (which re-exports it) because that module
// assigns pdf.js's worker URL at module scope: importing the cap from there is enough to pull
// pdfjs-dist into the importer's chunk, which would undo the listing editor's code split.
//
// The server enforces its own copy (server/routes/projects.js) -- it cannot trust this one --
// so the two have to be changed together.
export const MAX_PREVIEWS = 6;
