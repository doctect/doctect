// TTRPG Campaign Journal — HIERARCHY SCRIPT
// A campaign hub linking to Sessions, NPCs, Locations, and Quests. Session pages carry a
// right-edge tab strip to the three banks so you can jump to any NPC/place/quest while writing
// the session — no fixed per-session links to pin down. Rename the campaign and every entry.
// The bank sections use fixed ids (sessions/npcs/locations/quests) that the hub buttons and the
// session tabs point at.
const campaignName = "The Campaign";
const numSessions = 24;
const numNPCs = 24;
const numLocations = 16;
const numQuests = 16;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Campaign Journal", data: { subtitle: "sessions · npcs · lore" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "hub",
  title: campaignName, data: {}, children: []
};
nodes[rootId].children.push(contentsId);

const bank = (id, title) => {
  nodes[id] = { id: id, parentId: contentsId, type: "section", title: title, data: {}, children: [] };
  nodes[contentsId].children.push(id);
};
const fill = (bankId, type, prefix, n) => {
  for (let i = 1; i <= n; i++) {
    const id = createId(type);
    nodes[id] = { id: id, parentId: bankId, type: type, title: prefix + " " + i, data: {}, children: [] };
    nodes[bankId].children.push(id);
  }
};

bank("sessions", "Sessions");
fill("sessions", "session", "Session", numSessions);
bank("npcs", "NPCs");
fill("npcs", "npc", "NPC", numNPCs);
bank("locations", "Locations");
fill("locations", "location", "Location", numLocations);
bank("quests", "Quests");
fill("quests", "quest", "Quest", numQuests);

return { nodes, rootId };
