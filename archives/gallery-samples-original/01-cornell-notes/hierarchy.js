// Cornell Notes Notebook — HIERARCHY SCRIPT
// ---------------------------------------------------------------
// Subjects are generic ("Subject 1" ...) — rename each in the editor's tree.
// Each subject holds 100 note pages, split across two index pages (50 + 50).
//
// If you change firstPageCount away from 50, also update templates.js:
//   - subject grid  gridConfig.dataSliceCount  (notes shown on page 1)
//   - subject "Notes 51–100 →" chip  linkValue  (child index of the page-2 node)
const numSubjects = 8;
const firstPageCount = 50;   // notes on page 1
const secondPageCount = 50;  // notes on page 2  (100 per subject total)

const nodes = {};
const rootId = "root";

// Cover
nodes[rootId] = {
  id: rootId,
  parentId: null,
  type: "cover",
  title: "Cornell Notes",
  data: { subtitle: "A Cornell-method study notebook" },
  children: []
};

// Contents — fixed id "contents" so every page's Index/Cover chips can point at it
const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId,
  parentId: rootId,
  type: "subject_index",
  title: "Contents",
  data: {},
  children: []
};
nodes[rootId].children.push(contentsId);

const addNote = (parentId, n) => {
  const nId = createId("note");
  nodes[nId] = {
    id: nId,
    parentId: parentId,
    type: "note",
    title: "Note " + n,
    data: {},
    children: []
  };
  nodes[parentId].children.push(nId);
};

for (let i = 1; i <= numSubjects; i++) {
  // Subject = page 1 of the index (notes 1..firstPageCount)
  const sId = createId("subject");
  nodes[sId] = {
    id: sId,
    parentId: contentsId,
    type: "subject",
    title: "Subject " + i,   // rename me
    data: {},
    children: []
  };
  nodes[contentsId].children.push(sId);

  let n = 1;
  for (let k = 0; k < firstPageCount; k++) addNote(sId, n++);

  // Page 2 of the index (notes firstPageCount+1 .. total). Must be the child right
  // after the first-page notes so the "Notes 51–100 →" chip (child_index) lands on it.
  const mId = createId("more");
  nodes[mId] = {
    id: mId,
    parentId: sId,
    type: "subject_more",
    title: "Notes " + (firstPageCount + 1) + "–" + (firstPageCount + secondPageCount),
    data: {},
    children: []
  };
  nodes[sId].children.push(mId);

  for (let k = 0; k < secondPageCount; k++) addNote(mId, n++);
}

return { nodes, rootId };
