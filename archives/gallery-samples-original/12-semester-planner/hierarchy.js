// Semester Study Planner — HIERARCHY SCRIPT
// A semester hub linking to Courses, Assignments, Schedule, and Grades. Courses hold class-note
// sessions (weeks). The hub's four buttons link by child index, so the order below matters.
// Rename the semester, courses, and weeks in the editor tree.
const semesterName = "Fall 2026";
const numCourses = 6;
const sessionsPerCourse = 14;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Semester Planner", data: { subtitle: "courses · assignments · grades" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "hub",
  title: semesterName, data: {}, children: []
};
nodes[rootId].children.push(contentsId);

const addChild = (parentId, id, type, title) => {
  nodes[id] = { id: id, parentId: parentId, type: type, title: title, data: {}, children: [] };
  nodes[parentId].children.push(id);
};

// child 0: Courses > sessions
const coursesId = createId("courses");
addChild(contentsId, coursesId, "section", "Courses");
for (let c = 1; c <= numCourses; c++) {
  const courseId = createId("course");
  addChild(coursesId, courseId, "course", "Course " + c);
  for (let w = 1; w <= sessionsPerCourse; w++) addChild(courseId, createId("session"), "session", "Week " + w);
}

// child 1: Assignments, child 2: Schedule, child 3: Grades
addChild(contentsId, createId("assign"), "assignments", "Assignments");
addChild(contentsId, createId("sched"), "schedule", "Schedule");
addChild(contentsId, createId("grades"), "grades", "Grades");

return { nodes, rootId };
