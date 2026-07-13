// Novel / Manuscript Planner — HIERARCHY SCRIPT
// Manuscript spine (acts > chapters > scenes) plus a shared Characters bank and Locations
// bank. Every scene points to a POV character and a Setting location via REFERENCE nodes:
// the character/location sheet is written once and tapped into from any scene that uses it.
// Rename everything in the editor tree; re-point a scene's POV/Setting with the tree's
// "Link Existing Page (Reference)" action.
const bookTitle = "Working Title";
const acts = 3;
const chaptersPerAct = 6;
const scenesPerChapter = 5;
const numCharacters = 12;
const numLocations = 10;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: bookTitle, data: { subtitle: "outline · characters · locations" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "book_hub",
  title: bookTitle, data: {}, children: []
};
nodes[rootId].children.push(contentsId);

// three hub sections (fixed ids so the hub buttons can point at them)
const sectionNode = (id, title) => {
  nodes[id] = { id: id, parentId: contentsId, type: "section", title: title, data: {}, children: [] };
  nodes[contentsId].children.push(id);
};
sectionNode("manuscript", "Manuscript");
sectionNode("characters", "Characters");
sectionNode("locations", "Locations");

// Characters bank
const charIds = [];
for (let c = 1; c <= numCharacters; c++) {
  const id = createId("char");
  nodes[id] = { id: id, parentId: "characters", type: "character", title: "Character " + c, data: {}, children: [] };
  nodes["characters"].children.push(id);
  charIds.push({ id: id, title: "Character " + c });
}

// Locations bank
const locIds = [];
for (let l = 1; l <= numLocations; l++) {
  const id = createId("loc");
  nodes[id] = { id: id, parentId: "locations", type: "location", title: "Location " + l, data: {}, children: [] };
  nodes["locations"].children.push(id);
  locIds.push({ id: id, title: "Location " + l });
}

// Manuscript: acts > chapters > scenes, each scene referencing a character + a location
let sceneN = 0;
for (let a = 1; a <= acts; a++) {
  const aId = createId("act");
  nodes[aId] = { id: aId, parentId: "manuscript", type: "section", title: "Act " + a, data: {}, children: [] };
  nodes["manuscript"].children.push(aId);

  for (let ch = 1; ch <= chaptersPerAct; ch++) {
    const chId = createId("chap");
    nodes[chId] = { id: chId, parentId: aId, type: "chapter", title: "Chapter " + ch, data: {}, children: [] };
    nodes[aId].children.push(chId);

    for (let s = 1; s <= scenesPerChapter; s++) {
      const sId = createId("scene");
      nodes[sId] = { id: sId, parentId: chId, type: "scene", title: "Scene " + s, data: {}, children: [] };
      nodes[chId].children.push(sId);

      // POV character reference (child index 0) + Setting location reference (child index 1)
      const pov = charIds[sceneN % charIds.length];
      const setting = locIds[sceneN % locIds.length];
      const povRef = createId("povref");
      nodes[povRef] = { id: povRef, parentId: sId, referenceId: pov.id, type: "character", title: pov.title, data: {}, children: [] };
      nodes[sId].children.push(povRef);
      const setRef = createId("setref");
      nodes[setRef] = { id: setRef, parentId: sId, referenceId: setting.id, type: "location", title: setting.title, data: {}, children: [] };
      nodes[sId].children.push(setRef);
      sceneN++;
    }
  }
}

return { nodes, rootId };
