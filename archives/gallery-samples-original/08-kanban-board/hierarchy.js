// Project Kanban Board — HIERARCHY SCRIPT
// Each board is one page with three writable columns (To-Do / Doing / Done) plus a Backlog
// page to park tasks. You move a task by crossing it out in one column and rewriting it in the
// next — so there are no fixed task nodes to pin a task to a single column. Rename boards freely.
const numBoards = 8;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Kanban", data: { subtitle: "plan · track · ship" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "section",
  title: "Boards", data: {}, children: []
};
nodes[rootId].children.push(contentsId);

for (let b = 1; b <= numBoards; b++) {
  const boardId = createId("board");
  nodes[boardId] = { id: boardId, parentId: contentsId, type: "board", title: "Board " + b, data: {}, children: [] };
  nodes[contentsId].children.push(boardId);

  // Backlog is child 0 so the board's "Backlog" chip (child_index 0) reaches it.
  const backlogId = createId("backlog");
  nodes[backlogId] = { id: backlogId, parentId: boardId, type: "backlog", title: "Backlog", data: {}, children: [] };
  nodes[boardId].children.push(backlogId);
}

return { nodes, rootId };
