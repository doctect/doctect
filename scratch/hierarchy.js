/* ================================================================
   D&D DUNGEON MASTER'S CHRONICLE — STAGE 2: HIERARCHY
   ----------------------------------------------------------------
   Paste this whole file into the Generator's HIERARCHY stage,
   after running the Templates script.

   !! KEEP CONFIG IN SYNC with CFG in the Templates script.
   The templates place one tap-target overlay per grid cell, so
   PCS / ARCS / SESSIONS_PER_ARC / ENCOUNTERS must match there.

   Tip: for a fast test build, set ARCS: 1 here (and in CFG keep
   ARCS: 10 — extra overlays simply resolve to nothing and are
   skipped by the exporter). Full size = 1,837 pages.
   ================================================================ */
console.log("Hierarchy start");
const CONFIG = {
  CAMPAIGN_TITLE: 'My Campaign',   // rename me
  PCS: 12,
  ARCS: 10,
  SESSIONS_PER_ARC: 20,
  ENCOUNTERS: 4
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
               'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

const nodes = {};
const add = function (n) {
  nodes[n.id] = Object.assign({ data: {}, children: [] }, n);
  return n.id;
};

/* ---- root: the campaign home hub ---- */
const rootId = 'root';   // literal id: every page's d20 home button targets it
add({
  id: rootId, parentId: null, type: 'tpl_home',
  title: CONFIG.CAMPAIGN_TITLE,
  data: { subtitle: "A Dungeon Master's Chronicle" },
  children: ['party', 'chronicle']
});

/* ---- the party: PC sheets, each with a level-up log ---- */
add({ id: 'party', parentId: rootId, type: 'tpl_party', title: 'The Party', children: [] });
for (let i = 1; i <= CONFIG.PCS; i++) {
  const pcId = 'pc_' + i, logId = 'pc_' + i + '_log';
  add({
    id: pcId, parentId: 'party', type: 'tpl_pc',
    title: 'Hero ' + i,   // rename per character
    data: { player: '\u2014', race: 'Race', class: 'Class', level: '1' },
    children: [logId]
  });
  add({
    id: logId, parentId: pcId, type: 'tpl_levelup',
    title: 'Level-Up Log',
    data: { pc: 'Hero ' + i },
    children: []
  });
  nodes['party'].children.push(pcId);
}

/* ---- the chronicle: arcs > sessions > encounters > combat ---- */
add({ id: 'chronicle', parentId: rootId, type: 'tpl_chronicle', title: 'Campaign Chronicle', children: [] });
let n = 0;
for (let a = 1; a <= CONFIG.ARCS; a++) {
  const arcId = 'arc_' + a;
  add({
    id: arcId, parentId: 'chronicle', type: 'tpl_arc',
    title: 'Arc ' + ROMAN[a - 1],
    data: { theme: "Name this arc's theme" },
    children: []
  });
  nodes['chronicle'].children.push(arcId);

  for (let s = 1; s <= CONFIG.SESSIONS_PER_ARC; s++) {
    n++;
    const sid = 's_' + n;
    add({
      id: sid, parentId: arcId, type: 'tpl_session',
      title: 'Session ' + n,
      data: { num: String(n) },
      children: []
    });
    nodes[arcId].children.push(sid);

    for (let ec = 1; ec <= CONFIG.ENCOUNTERS; ec++) {
      const eid = sid + '_e' + ec;
      const cid = eid + '_combat';
      add({
        id: eid, parentId: sid, type: 'tpl_encounter',
        title: 'Encounter ' + ec,   // rename to the set-piece's name
        data: { location: '\u2014' },
        children: [cid]
      });
      add({
        id: cid, parentId: eid, type: 'tpl_combat',
        title: 'Combat Tracker',
        data: { enc: 'Session ' + n + ' \u00B7 Encounter ' + ec },
        children: []
      });
      nodes[sid].children.push(eid);
    }
  }
}
console.log("Hierarchy end");
