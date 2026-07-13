// Habit Tracker + Reflection — HIERARCHY SCRIPT
// A full year of months, each with one reflection page per day.
// Habit names are written by hand in the left column of each month (12 blank rows).
const year = 2026;

// 2026 is not a leap year; Jan 1 2026 falls on a Thursday (0 = Sun ... 4 = Thu).
const months = [
  { name: "January", short: "Jan", days: 31 }, { name: "February", short: "Feb", days: 28 },
  { name: "March", short: "Mar", days: 31 }, { name: "April", short: "Apr", days: 30 },
  { name: "May", short: "May", days: 31 }, { name: "June", short: "Jun", days: 30 },
  { name: "July", short: "Jul", days: 31 }, { name: "August", short: "Aug", days: 31 },
  { name: "September", short: "Sep", days: 30 }, { name: "October", short: "Oct", days: 31 },
  { name: "November", short: "Nov", days: 30 }, { name: "December", short: "Dec", days: 31 }
];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let weekday = 4; // Thursday

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Habit Tracker",
  data: { subtitle: year + " · daily habits & reflections" },
  children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "year_index",
  title: String(year),
  data: { year: String(year) },
  children: []
};
nodes[rootId].children.push(contentsId);

months.forEach((m, mIdx) => {
  const mId = createId("month");
  nodes[mId] = {
    id: mId, parentId: contentsId, type: "month",
    title: m.name,
    data: {
      month_name: m.name, month_short: m.short,
      month_num: String(mIdx + 1).padStart(2, "0"), year: String(year)
    },
    children: []
  };
  nodes[contentsId].children.push(mId);

  for (let d = 1; d <= m.days; d++) {
    const dName = weekdays[weekday];
    const dId = createId("day");
    nodes[dId] = {
      id: dId, parentId: mId, type: "day",
      title: dName + " · " + m.short + " " + d,
      data: {
        day_num: String(d), day_name: dName, day_short: dName,
        month_name: m.name, month_short: m.short, year: String(year)
      },
      children: []
    };
    nodes[mId].children.push(dId);
    weekday = (weekday + 1) % 7;
  }
});

return { nodes, rootId };
