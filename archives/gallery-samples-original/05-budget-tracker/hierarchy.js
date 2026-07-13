// Budget / Finance Tracker — HIERARCHY SCRIPT
// A month-by-month budget with a transactions log behind each month, plus an annual
// summary and a savings-goals page. Categories, amounts, and goals are written by hand.
const year = 2026;
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Budget", data: { subtitle: year + " · plan every dollar" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "year_index",
  title: String(year), data: { year: String(year) }, children: []
};
nodes[rootId].children.push(contentsId);

// 12 month budgets, each with a transactions log child (child index 0)
months.forEach((name) => {
  const mId = createId("month");
  nodes[mId] = {
    id: mId, parentId: contentsId, type: "month",
    title: name, data: { year: String(year), month_name: name }, children: []
  };
  nodes[contentsId].children.push(mId);

  const tId = createId("tx");
  nodes[tId] = {
    id: tId, parentId: mId, type: "txlog",
    title: name + " · Transactions", data: { year: String(year), month_name: name }, children: []
  };
  nodes[mId].children.push(tId);
});

// Annual summary (child index 12) + savings goals (child index 13)
const sId = createId("summary");
nodes[sId] = { id: sId, parentId: contentsId, type: "summary", title: "Annual Summary", data: { year: String(year) }, children: [] };
nodes[contentsId].children.push(sId);

const gId = createId("goals");
nodes[gId] = { id: gId, parentId: contentsId, type: "goals", title: "Savings Goals", data: { year: String(year) }, children: [] };
nodes[contentsId].children.push(gId);

return { nodes, rootId };
