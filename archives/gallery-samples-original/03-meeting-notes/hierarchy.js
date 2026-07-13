// Meeting Notes System — HIERARCHY SCRIPT
// Projects are generic ("Project 1" ...) — rename each in the editor's tree to your
// team, client, or workstream. Each project holds a stack of blank meeting pages.
const numProjects = 6;
const meetingsPerProject = 24;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Meeting Notes",
  data: { subtitle: "Projects, agendas & action items" },
  children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "projects_index",
  title: "Projects",
  data: {},
  children: []
};
nodes[rootId].children.push(contentsId);

for (let p = 1; p <= numProjects; p++) {
  const pId = createId("project");
  nodes[pId] = {
    id: pId, parentId: contentsId, type: "project",
    title: "Project " + p,   // rename me
    data: {},
    children: []
  };
  nodes[contentsId].children.push(pId);

  for (let m = 1; m <= meetingsPerProject; m++) {
    const mId = createId("meeting");
    nodes[mId] = {
      id: mId, parentId: pId, type: "meeting",
      title: "Meeting " + m,
      data: {},
      children: []
    };
    nodes[pId].children.push(mId);
  }
}

return { nodes, rootId };
