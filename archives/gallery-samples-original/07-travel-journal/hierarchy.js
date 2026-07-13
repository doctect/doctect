// Travel Journal / Trip Planner — HIERARCHY SCRIPT
// A book of trips; each trip has an itinerary (day pages), a packing list, a budget, and a
// journal (entry pages). The trip hub's four buttons link to those by child index (0-3), so
// the order below matters. Rename trips, days, and entries in the editor tree.
const numTrips = 4;
const daysPerTrip = 7;
const journalPagesPerTrip = 6;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Travel Journal", data: { subtitle: "trips · itineraries · memories" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "section",
  title: "Trips", data: {}, children: []
};
nodes[rootId].children.push(contentsId);

const addChild = (parentId, id, type, title) => {
  nodes[id] = { id: id, parentId: parentId, type: type, title: title, data: {}, children: [] };
  nodes[parentId].children.push(id);
};

for (let t = 1; t <= numTrips; t++) {
  const tripId = createId("trip");
  addChild(contentsId, tripId, "trip", "Trip " + t);

  // Order fixed to match the trip hub's child-index buttons: Itinerary/Packing/Budget/Journal
  const itinId = createId("itin");
  addChild(tripId, itinId, "section", "Itinerary");
  for (let d = 1; d <= daysPerTrip; d++) addChild(itinId, createId("day"), "day", "Day " + d);

  addChild(tripId, createId("pack"), "packing", "Packing");
  addChild(tripId, createId("budget"), "budget", "Budget");

  const jId = createId("journal");
  addChild(tripId, jId, "section", "Journal");
  for (let e = 1; e <= journalPagesPerTrip; e++) addChild(jId, createId("entry"), "journal_page", "Entry " + e);
}

return { nodes, rootId };
