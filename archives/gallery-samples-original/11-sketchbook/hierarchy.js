// Sketchbook / Art Portfolio — HIERARCHY SCRIPT
// The sketchbook is organised by paper surface: a section each for dot, square-grid, ruled, and
// blank pages, plus a Gallery for cataloguing finished pieces. Rename sections and pages freely.
const surfaces = [
  { name: "Dot Grid", type: "page_dot" },
  { name: "Square Grid", type: "page_grid" },
  { name: "Ruled", type: "page_lined" },
  { name: "Blank", type: "page_blank" }
];
const pagesPerSurface = 16;
const galleryPieces = 12;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Sketchbook", data: { subtitle: "sketch · study · collect" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "section",
  title: "Sketchbook", data: {}, children: []
};
nodes[rootId].children.push(contentsId);

const addChild = (parentId, id, type, title) => {
  nodes[id] = { id: id, parentId: parentId, type: type, title: title, data: {}, children: [] };
  nodes[parentId].children.push(id);
};

// one section per surface, filled with pages of that surface type
surfaces.forEach((s) => {
  const secId = createId("surface");
  addChild(contentsId, secId, "section", s.name);
  for (let p = 1; p <= pagesPerSurface; p++) addChild(secId, createId("page"), s.type, "Page " + p);
});

// gallery of finished pieces
const galId = createId("gallery");
addChild(contentsId, galId, "section", "Gallery");
for (let g = 1; g <= galleryPieces; g++) addChild(galId, createId("piece"), "gallery", "Piece " + g);

return { nodes, rootId };
