// Workout / Fitness Log — HIERARCHY SCRIPT
// Programs > weeks > workout days. Each workout day is an exercise table (sets/reps/weight).
// Rename programs to your routines (e.g. "5x5", "Push/Pull/Legs") and days to the session names.
const numPrograms = 3;
const weeksPerProgram = 8;
const daysPerWeek = 4;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Workout Log", data: { subtitle: "programs · weeks · sessions" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "section",
  title: "Programs", data: {}, children: []
};
nodes[rootId].children.push(contentsId);

const addChild = (parentId, id, type, title) => {
  nodes[id] = { id: id, parentId: parentId, type: type, title: title, data: {}, children: [] };
  nodes[parentId].children.push(id);
};

for (let p = 1; p <= numPrograms; p++) {
  const programId = createId("program");
  addChild(contentsId, programId, "section", "Program " + p);
  for (let w = 1; w <= weeksPerProgram; w++) {
    const weekId = createId("week");
    addChild(programId, weekId, "section", "Week " + w);
    for (let d = 1; d <= daysPerWeek; d++) {
      addChild(weekId, createId("workout"), "workout", "Day " + d);
    }
  }
}

return { nodes, rootId };
