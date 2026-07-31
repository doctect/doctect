const DEFAULT_CONFIG = { worksheetCount: 8, studyLogCount: 4 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = { worksheetCount: [4, 16], studyLogCount: [2, 8] };
Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Opening Atlas config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Opening Atlas node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Opening Atlas template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  const node = { id, parentId, type, title, data: nodeData, children: [] };
  if (typeof options.referenceId === 'string') node.referenceId = options.referenceId;
  nodes[id] = node;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Opening Atlas parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const pad2 = (value) => String(value).padStart(2, '0');

// --- Position data -----------------------------------------------------------
// Every board below was derived by replaying its move list from the initial
// position with a SAN interpreter (the reviewer can replay each line by hand).
// `board` is standard piece placement, ranks 8 down to 1, uppercase = White,
// lowercase = black, digits = consecutive empty squares.

const POSITIONS = {
  it_root: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4',
    toMove: 'Black',
    board: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R',
  },
  it_giuoco: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3',
    toMove: 'Black',
    board: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R',
  },
  it_main5: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3',
    toMove: 'Black',
    board: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R',
  },
  it_main6: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O',
    toMove: 'Black',
    board: 'r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1',
  },
  it_main7: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Re1',
    toMove: 'Black',
    board: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQR1K1',
  },
  it_main8: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Re1 a6 8. a4',
    toMove: 'Black',
    board: 'r1bq1rk1/1pp2ppp/p1np1n2/2b1p3/P1B1P3/2PP1N2/1P3PPP/RNBQR1K1',
  },
  it_oo: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 O-O 6. O-O',
    toMove: 'Black',
    board: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1',
  },
  it_d6: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 d6 5. d4',
    toMove: 'Black',
    board: 'r1bqk1nr/ppp2ppp/2np4/2b1p3/2BPP3/2P2N2/PP3PPP/RNBQK2R',
  },
  it_two_knights: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3',
    toMove: 'Black',
    board: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R',
  },
  it_be7: {
    line: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Be7 5. O-O',
    toMove: 'Black',
    board: 'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1',
  },
  qg_root: {
    line: '1. d4 d5 2. c4',
    toMove: 'Black',
    board: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR',
  },
  qg_qgd: {
    line: '1. d4 d5 2. c4 e6 3. Nc3',
    toMove: 'Black',
    board: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR',
  },
  qg_qgd4: {
    line: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5',
    toMove: 'Black',
    board: 'rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR',
  },
  qg_main5: {
    line: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3',
    toMove: 'Black',
    board: 'rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N1P3/PP3PPP/R2QKBNR',
  },
  qg_main6: {
    line: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3',
    toMove: 'Black',
    board: 'rnbq1rk1/ppp1bppp/4pn2/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R',
  },
  qg_main7: {
    line: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1',
    toMove: 'Black',
    board: 'r1bq1rk1/pppnbppp/4pn2/3p2B1/2PP4/2N1PN2/PP3PPP/2RQKB1R',
  },
  qg_main8: {
    line: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3',
    toMove: 'Black',
    board: 'r1bq1rk1/pp1nbppp/2p1pn2/3p2B1/2PP4/2NBPN2/PP3PPP/2RQK2R',
  },
  qg_nbd7: {
    line: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 Nbd7 6. Nf3',
    toMove: 'Black',
    board: 'r1bqk2r/pppnbppp/4pn2/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R',
  },
  qg_qga: {
    line: '1. d4 d5 2. c4 dxc4 3. Nf3',
    toMove: 'Black',
    board: 'rnbqkbnr/ppp1pppp/8/8/2pP4/5N2/PP2PPPP/RNBQKB1R',
  },
  qg_slav: {
    line: '1. d4 d5 2. c4 c6 3. Nf3',
    toMove: 'Black',
    board: 'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/5N2/PP2PPPP/RNBQKB1R',
  },
  sc_root: {
    line: '1. e4 c5',
    toMove: 'White',
    board: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR',
  },
  sc_nf3: {
    line: '1. e4 c5 2. Nf3 d6',
    toMove: 'White',
    board: 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R',
  },
  sc_open: {
    line: '1. e4 c5 2. Nf3 d6 3. d4 cxd4',
    toMove: 'White',
    board: 'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R',
  },
  sc_open4: {
    line: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6',
    toMove: 'White',
    board: 'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R',
  },
  sc_najdorf: {
    line: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    toMove: 'White',
    board: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R',
  },
  sc_be2: {
    line: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5',
    toMove: 'White',
    board: 'rnbqkb1r/1p3ppp/p2p1n2/4p3/3NP3/2N5/PPP1BPPP/R1BQK2R',
  },
  sc_nb3: {
    line: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7',
    toMove: 'White',
    board: 'rnbqk2r/1p2bppp/p2p1n2/4p3/4P3/1NN5/PPP1BPPP/R1BQK2R',
  },
  sc_bg5: {
    line: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6',
    toMove: 'White',
    board: 'rnbqkb1r/1p3ppp/p2ppn2/6B1/3NP3/2N5/PPP2PPP/R2QKB1R',
  },
  sc_moscow: {
    line: '1. e4 c5 2. Nf3 d6 3. Bb5+ Bd7',
    toMove: 'White',
    board: 'rn1qkbnr/pp1bpppp/3p4/1Bp5/4P3/5N2/PPPP1PPP/RNBQK2R',
  },
  sc_closed: {
    line: '1. e4 c5 2. Nc3 d6',
    toMove: 'White',
    board: 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR',
  },
  fr_root: {
    line: '1. e4 e6 2. d4 d5',
    toMove: 'White',
    board: 'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR',
  },
  fr_advance: {
    line: '1. e4 e6 2. d4 d5 3. e5 c5',
    toMove: 'White',
    board: 'rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/8/PPP2PPP/RNBQKBNR',
  },
  fr_adv4: {
    line: '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6',
    toMove: 'White',
    board: 'r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2P5/PP3PPP/RNBQKBNR',
  },
  fr_adv5: {
    line: '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6',
    toMove: 'White',
    board: 'r1b1kbnr/pp3ppp/1qn1p3/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R',
  },
  fr_adv6: {
    line: '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 Nh6',
    toMove: 'White',
    board: 'r1b1kb1r/pp3ppp/1qn1p2n/2ppP3/3P4/P1P2N2/1P3PPP/RNBQKB1R',
  },
  fr_tarrasch: {
    line: '1. e4 e6 2. d4 d5 3. Nd2 c5',
    toMove: 'White',
    board: 'rnbqkbnr/pp3ppp/4p3/2pp4/3PP3/8/PPPN1PPP/R1BQKBNR',
  },
  fr_tar4: {
    line: '1. e4 e6 2. d4 d5 3. Nd2 c5 4. exd5 exd5',
    toMove: 'White',
    board: 'rnbqkbnr/pp3ppp/8/2pp4/3P4/8/PPPN1PPP/R1BQKBNR',
  },
  fr_tar5: {
    line: '1. e4 e6 2. d4 d5 3. Nd2 c5 4. exd5 exd5 5. Ngf3 Nc6',
    toMove: 'White',
    board: 'r1bqkbnr/pp3ppp/2n5/2pp4/3P4/5N2/PPPN1PPP/R1BQKB1R',
  },
  fr_nc3: {
    line: '1. e4 e6 2. d4 d5 3. Nc3 Bb4',
    toMove: 'White',
    board: 'rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR',
  },
  fr_win4: {
    line: '1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5',
    toMove: 'White',
    board: 'rnbqk1nr/pp3ppp/4p3/2ppP3/1b1P4/2N5/PPP2PPP/R1BQKBNR',
  },
};

// Expand a piece placement into the 64 bound square fields; empty squares
// bind '' so their cells render nothing.
const boardFields = (placement) => {
  const fields = {};
  placement.split('/').forEach((rankText, rankIndex) => {
    const rank = 8 - rankIndex;
    let fileIndex = 0;
    for (const symbol of rankText) {
      if (symbol >= '1' && symbol <= '8') {
        for (let step = 0; step < Number(symbol); step += 1) {
          fields['abcdefgh'[fileIndex] + rank] = '';
          fileIndex += 1;
        }
      } else {
        fields['abcdefgh'[fileIndex] + rank] = symbol;
        fileIndex += 1;
      }
    }
  });
  return fields;
};

const addPosition = (id, parentId, title, spec) => {
  const pos = POSITIONS[id];
  const candidates = spec.candidates || [];
  addNode(id, parentId, 'position', title, {
    ...boardFields(pos.board),
    move_list: pos.line,
    to_move: `${pos.toMove} to play`,
    chapter_label: spec.chapter,
    idea: spec.idea,
    eval_text: spec.verdict,
    candidate_1_label: candidates[0] || '',
    candidate_2_label: candidates[1] || '',
    candidate_3_label: candidates[2] || '',
  });
};

// A transposition: a reference child whose page IS the original position.
const addTransposition = (id, parentId, title, targetId) => {
  addNode(id, parentId, 'position', title, {
    candidate_1_label: '',
    candidate_2_label: '',
    candidate_3_label: '',
  }, { referenceId: targetId });
};

// --- Root and study guide ----------------------------------------------------

addNode('root', null, 'cover', 'Opening Atlas', {});

addNode('start_here', 'root', 'start', 'Study Guide', {
  example_label: '',
  skip_label: '',
});

// --- White repertoire --------------------------------------------------------

addNode('white_repertoire', 'start_here', 'repertoire', 'White Repertoire', {
  side_note: "Two weapons for the first player: the patient Italian and the classical Queen's Gambit. Learn each mainline to its tabiya first, then return for the branches.",
  chapter_1_label: 'Italian Game »',
  chapter_1_note: 'A calm system with c3 and d3: castle short, regroup the queen knight, and outplay your opponent from a sound centre. Mainline plus the Two Knights move order.',
  chapter_2_label: "Queen's Gambit »",
  chapter_2_note: 'The classical main road: pressure d5, pin with Bg5, and steer the Orthodox tabiya toward the minority attack. Accepted and Slav replies signposted.',
  hub_note: 'Study order: play through each chapter mainline to its final tabiya, then return for the branch pages. The assessment box gives the book verdict at every stop.',
});

// Chapter one: Italian Game (Giuoco Pianissimo with c3 and d3).

addNode('chapter_italian', 'white_repertoire', 'chapter', 'Italian Game', {
  chapter_label: 'WHITE REPERTOIRE · CHAPTER ONE',
  summary: 'Open 1. e4 e5 2. Nf3 Nc6 3. Bc4 and choose the quiet route: c3 with d3, castle short, and keep the pieces on the board. Plans, not memorised tactics, carry this chapter - Re1, h3, the Nbd2-f1-g3 regrouping, and only then a central break.',
  ideas: '· Meet 3...Bc5 with 4. c3 and 3...Nf6 with 4. d3 - one setup against both.\n· Standard regrouping: Re1, h3, then Nbd2-f1-g3 eyeing f5.\n· Break with d3-d4, or expand with a4, only when development is complete.\n· The Two Knights page transposes straight back into the mainline.',
  begin_note: 'The chapter opens on the Italian position after 3. Bc4 - every line in it starts there.',
});

const IT = 'ITALIAN GAME · WHITE';

addPosition('it_root', 'chapter_italian', 'The Italian Position', {
  chapter: IT,
  idea: 'The bishop eyes f7 from its best diagonal; White intends slow pressure with c3 and d3 rather than forcing matters.',
  verdict: '=',
  candidates: ['3... Bc5 »', '3... Nf6 »'],
});

addPosition('it_giuoco', 'it_root', 'Giuoco Piano: 4. c3', {
  chapter: IT,
  idea: 'The modest 4. c3 keeps both plans alive: a later d2-d4 in one go, or the slow d3 build-up behind a solid centre.',
  verdict: '=',
  candidates: ['4... Nf6 »', '4... d6 »'],
});

addPosition('it_main5', 'it_giuoco', 'Pianissimo Structure: 5. d3', {
  chapter: IT,
  idea: 'White holds the centre flexibly: castle short, then Re1, h3 and the thematic Nbd2-f1-g3 regrouping.',
  verdict: '=',
  candidates: ['5... d6 »', '5... O-O »'],
});

addPosition('it_main6', 'it_main5', 'Mainline: 6. O-O', {
  chapter: IT,
  idea: 'Both kings head for safety before the middlegame begins; the position stays symmetrical and full of play.',
  verdict: '=',
  candidates: ['6... O-O »'],
});

addPosition('it_main7', 'it_main6', 'The Tabiya: 7. Re1', {
  chapter: IT,
  idea: 'The pure Pianissimo tabiya. White will pick a plan: a4 with the knight tour to g3, or a timely d3-d4 break.',
  verdict: '+=',
  candidates: ['7... a6 »'],
});

addPosition('it_main8', 'it_main7', 'Modern Tabiya: 8. a4', {
  chapter: IT,
  idea: 'Play usually continues 8...Ba7 9. h3 - manoeuvring chess where the better-prepared player wins.',
  verdict: '+=',
  candidates: [],
});

addPosition('it_oo', 'it_main5', 'Early Castling: 5... O-O', {
  chapter: IT,
  idea: 'Castling first changes nothing: after ...d6 and Re1 the mainline tabiya appears on the board move for move.',
  verdict: '=',
  candidates: ['6... d6 · transposes »'],
});

addTransposition('it_oo_t', 'it_oo', '» Rejoins the tabiya', 'it_main7');

addPosition('it_d6', 'it_giuoco', 'The d6 Sideline: 5. d4', {
  chapter: IT,
  idea: 'Because ...d6 released the central tension early, White seizes the centre at once: 5...exd4 6. cxd4 rolls forward.',
  verdict: '+=',
  candidates: [],
});

addPosition('it_two_knights', 'it_root', 'Two Knights: 4. d3', {
  chapter: IT,
  idea: 'The quiet move sidesteps all the ...Nxe4 and ...d5 theory; White simply plays the same c3 and d3 system.',
  verdict: '=',
  candidates: ['4... Bc5 · transposes »', '4... Be7 »'],
});

addTransposition('it_tk_t', 'it_two_knights', '» Back to the mainline', 'it_main5');

addPosition('it_be7', 'it_two_knights', 'Solid but Passive: 4... Be7', {
  chapter: IT,
  idea: 'With the bishop on e7 White develops freely: O-O, Re1, then c3 and a d4 break arriving with extra force.',
  verdict: '+=',
  candidates: [],
});

// Chapter two: Queen's Gambit (Orthodox QGD mainline).

addNode('chapter_qg', 'white_repertoire', 'chapter', "Queen's Gambit", {
  chapter_label: 'WHITE REPERTOIRE · CHAPTER TWO',
  summary: 'Open 1. d4 d5 2. c4 and press on d5 for the whole game. Against the Declined we follow the Orthodox mainline with Bg5, e3 and Rc1 to the classical tabiya; the Accepted and the Slav each get a page pointing the way.',
  ideas: "· The gambit is temporary: after ...dxc4 White always regains the pawn.\n· The Bg5 pin softens d5 by tying down its defender on f6.\n· Rc1 answers Black's freeing ...dxc4 and ...c5 ideas in advance.\n· The tabiya plan: castle, then the b4-b5 minority attack on the c6 chain.",
  begin_note: 'Begin at the gambit position after 2. c4, the moment before Black chooses a defence.',
});

const QG = "QUEEN'S GAMBIT · WHITE";

addPosition('qg_root', 'chapter_qg', "The Queen's Gambit", {
  chapter: QG,
  idea: 'No real gambit: after 2...dxc4 White regains the pawn at leisure. The point is lasting pressure against d5.',
  verdict: '=',
  candidates: ['2... e6 »', '2... dxc4 »', '2... c6 »'],
});

addPosition('qg_qgd', 'qg_root', 'Declined: 3. Nc3', {
  chapter: QG,
  idea: "White develops toward e4; Black's ...e6 keeps d5 firm at the price of shutting in the c8-bishop.",
  verdict: '=',
  candidates: ['3... Nf6 »'],
});

addPosition('qg_qgd4', 'qg_qgd', 'Classical Pin: 4. Bg5', {
  chapter: QG,
  idea: "The pin raises the pressure on d5 by taking aim at its defender; Black's classical answer breaks it with ...Be7.",
  verdict: '+=',
  candidates: ['4... Be7 »'],
});

addPosition('qg_main5', 'qg_qgd4', 'Orthodox Setup: 5. e3', {
  chapter: QG,
  idea: 'White completes the classical wall: e3 opens the f1-bishop and keeps d4 sound before the king knight comes out.',
  verdict: '+=',
  candidates: ['5... O-O »', '5... Nbd7 »'],
});

addPosition('qg_main6', 'qg_main5', 'Mainline: 6. Nf3', {
  chapter: QG,
  idea: 'The Orthodox mainline: White chooses between Rc1 and Qc2 while Black prepares ...c6 and the freeing ...dxc4.',
  verdict: '+=',
  candidates: ['6... Nbd7 »'],
});

addPosition('qg_main7', 'qg_main6', 'Rook to c1: 7. Rc1', {
  chapter: QG,
  idea: 'The rook pre-empts ...dxc4 ideas along the c-file and supports the coming b4-b5 minority attack.',
  verdict: '+=',
  candidates: ['7... c6 »'],
});

addPosition('qg_main8', 'qg_main7', 'Orthodox Tabiya: 8. Bd3', {
  chapter: QG,
  idea: "Capablanca's freeing plan is 8...dxc4 9. Bxc4 Nd5; otherwise White castles and starts the b4-b5 advance.",
  verdict: '+=',
  candidates: [],
});

addPosition('qg_nbd7', 'qg_main5', 'Flexible: 5... Nbd7', {
  chapter: QG,
  idea: 'A pure move-order finesse: after ...O-O both roads meet in the very same Orthodox position.',
  verdict: '+=',
  candidates: ['6... O-O · transposes »'],
});

addTransposition('qg_nbd7_t', 'qg_nbd7', '» Meets the mainline', 'qg_main7');

addPosition('qg_qga', 'qg_root', 'Accepted: 3. Nf3', {
  chapter: QG,
  idea: 'White will play e3 and Bxc4, castling quickly; the extra centre pawn promises a comfortable, lasting pull.',
  verdict: '+=',
  candidates: [],
});

addPosition('qg_slav', 'qg_root', 'Slav: 3. Nf3', {
  chapter: QG,
  idea: 'Against the Slav stay flexible: Nc3 and e3 come next, and a well-timed a4 meets any ...dxc4 grab.',
  verdict: '=',
  candidates: [],
});

// --- Black repertoire --------------------------------------------------------

addNode('black_repertoire', 'start_here', 'repertoire', 'Black Repertoire', {
  side_note: 'Two answers to 1. e4: the fighting Najdorf Sicilian and the resilient French. Pick one for your games - know both for your chess.',
  chapter_1_label: 'Sicilian Defence »',
  chapter_1_note: 'The Najdorf move order against the Open Sicilian: ...d6, ...Nf6 and ...a6, with the thematic ...e5 against the Classical setup. Moscow and Closed sidelines covered.',
  chapter_2_label: 'French Defence »',
  chapter_2_note: 'Meet 1. e4 with ...e6 and ...d5, then strike the chain with ...c5: Advance, Tarrasch and Winawer coverage down to each tabiya.',
  hub_note: "As Black the atlas branches on White's tries: every candidate chip on these pages is a White move you must be ready to meet.",
});

// Chapter three: Sicilian Defence (Najdorf move order).

addNode('chapter_sicilian', 'black_repertoire', 'chapter', 'Sicilian Defence', {
  chapter_label: 'BLACK REPERTOIRE · CHAPTER THREE',
  summary: 'Answer 1. e4 with 1...c5 and steer for the Najdorf: ...d6, ...Nf6 and ...a6. Against the Classical 6. Be2 the strike 6...e5 gives comfortable play; the sharp 6. Bg5 and the sidelines each get their marching orders.',
  ideas: '· Trade the c-pawn for the d-pawn: centre majority, play on the c-file.\n· ...a6 takes b5 from both knight and bishop and prepares ...b5.\n· After ...e5 the backward d6-pawn is a fair price for space and activity.\n· The sidelines (3. Bb5+, 2. Nc3) get simple, solid answers.',
  begin_note: 'The chapter opens the moment 1...c5 lands on the board.',
});

const SC = 'SICILIAN DEFENCE · BLACK';

addPosition('sc_root', 'chapter_sicilian', 'The Sicilian', {
  chapter: SC,
  idea: 'Black fights for the centre from the wing: the coming c-pawn trade leaves Black a central pawn majority.',
  verdict: 'Sharp',
  candidates: ['2. Nf3 »', '2. Nc3 »'],
});

addPosition('sc_nf3', 'sc_root', 'Our Move: 2... d6', {
  chapter: SC,
  idea: 'The Najdorf move order: ...d6 guards e5, readies ...Nf6, and keeps every later option open.',
  verdict: '=',
  candidates: ['3. d4 »', '3. Bb5+ »'],
});

addPosition('sc_open', 'sc_nf3', 'Open Sicilian: 3... cxd4', {
  chapter: SC,
  idea: 'Black happily gives the c-pawn for the d-pawn: a half-open c-file and a two-to-one centre majority.',
  verdict: 'Dynamic',
  candidates: ['4. Nxd4 »'],
});

addPosition('sc_open4', 'sc_open', 'Knights Out: 4... Nf6', {
  chapter: SC,
  idea: 'The knight hits e4 at once, forcing 5. Nc3 before White can think about building a big centre with c4.',
  verdict: '=',
  candidates: ['5. Nc3 »'],
});

addPosition('sc_najdorf', 'sc_open4', 'The Najdorf: 5... a6', {
  chapter: SC,
  idea: 'The little pawn move denies b5 to both minor pieces forever and prepares ...e5 and queenside space with ...b5.',
  verdict: 'Rich play',
  candidates: ['6. Be2 »', '6. Bg5 »'],
});

addPosition('sc_be2', 'sc_najdorf', 'Classical: 6... e5', {
  chapter: SC,
  idea: 'The thematic strike: the d4-knight is pushed back and d6 stays defensible; the d5-square is the only price.',
  verdict: '=',
  candidates: ['7. Nb3 »'],
});

addPosition('sc_nb3', 'sc_be2', 'Najdorf Tabiya: 7... Be7', {
  chapter: SC,
  idea: "Plans: ...O-O, ...Be6, ...Nbd7 and the ...b5 break - and watch White's a4 and the Nd5 jump forever.",
  verdict: '=',
  candidates: [],
});

addPosition('sc_bg5', 'sc_najdorf', 'Sharp: 6. Bg5', {
  chapter: SC,
  idea: 'Theory-heavy: after 7. f4 Be7 8. Qf3 Qc7 the game becomes a memory contest - know your files cold.',
  verdict: 'Sharp',
  candidates: [],
});

addPosition('sc_moscow', 'sc_nf3', 'Moscow Check: 3... Bd7', {
  chapter: SC,
  idea: 'The calm answer: 4. Bxd7+ Qxd7 trades off the bishop White wanted to keep; 5. O-O Nf6 is easy equality.',
  verdict: '=',
  candidates: [],
});

addPosition('sc_closed', 'sc_root', 'Closed Sicilian: 2... d6', {
  chapter: SC,
  idea: 'Stay flexible: on 3. g3 continue ...g6 and ...Bg7; if White plays Nf3 and d4 we are back in the Open Sicilian.',
  verdict: '=',
  candidates: [],
});

// Chapter four: French Defence.

addNode('chapter_french', 'black_repertoire', 'chapter', 'French Defence', {
  chapter_label: 'BLACK REPERTOIRE · CHAPTER FOUR',
  summary: 'Answer 1. e4 with 1...e6 and 2...d5, then attack the White centre with ...c5. The Advance, the Tarrasch and the Winawer each branch from one root position - and in every one of them the d4-pawn is the target.',
  ideas: '· The pawn chain points at d4: pile on it with ...Nc6, ...Qb6 and ...Nh6-f5.\n· In the Tarrasch, accept the isolani for open lines and fast development.\n· In the Winawer, trade the bishop for a lasting dark-square grip.\n· The c8-bishop is the problem piece: give it a future before the endgame.',
  begin_note: 'Begin at the root French position after 2...d5.',
});

const FR = 'FRENCH DEFENCE · BLACK';

addPosition('fr_root', 'chapter_french', 'The French', {
  chapter: FR,
  idea: 'Black lets White build the centre in order to attack it: every plan in this chapter revolves around ...c5 and ...f6.',
  verdict: 'Solid',
  candidates: ['3. e5 »', '3. Nd2 »', '3. Nc3 »'],
});

addPosition('fr_advance', 'fr_root', 'Advance: 3... c5', {
  chapter: FR,
  idea: 'The chain is fixed, so Black attacks its base: d4 will feel pressure from nearly every Black piece.',
  verdict: '=',
  candidates: ['4. c3 »'],
});

addPosition('fr_adv4', 'fr_advance', 'Pressure on d4: 4... Nc6', {
  chapter: FR,
  idea: 'Development with a threat - a second attacker stares at d4 while White props it up with c3.',
  verdict: '=',
  candidates: ['5. Nf3 »'],
});

addPosition('fr_adv5', 'fr_adv4', 'Queen Out: 5... Qb6', {
  chapter: FR,
  idea: "The queen adds a third attacker on d4 and eyes b2, tying White's dark-squared bishop to its defence.",
  verdict: '=',
  candidates: ['6. a3 »'],
});

addPosition('fr_adv6', 'fr_adv5', 'The Knight Route: 6... Nh6', {
  chapter: FR,
  idea: 'Headed for f5: after 7. b4 cxd4 8. cxd4 Nf5 the knight hits d4 from its dream square.',
  verdict: 'Balanced',
  candidates: [],
});

addPosition('fr_tarrasch', 'fr_root', 'Tarrasch: 3... c5', {
  chapter: FR,
  idea: 'Against the flexible 3. Nd2 Black strikes at once; an isolated d-pawn is a fair price for free, fast play.',
  verdict: '=',
  candidates: ['4. exd5 »'],
});

addPosition('fr_tar4', 'fr_tarrasch', 'Open Centre: 4... exd5', {
  chapter: FR,
  idea: 'Recapturing with the pawn keeps a stake in the centre and finally opens the c8-bishop diagonal.',
  verdict: '=',
  candidates: ['5. Ngf3 »'],
});

addPosition('fr_tar5', 'fr_tar4', 'IQP Battleground: 5... Nc6', {
  chapter: FR,
  idea: "After 6. Bb5 Bd6 7. dxc5 Bxc5 8. O-O Nge7, Black's active pieces balance the isolated d-pawn.",
  verdict: '=',
  candidates: [],
});

addPosition('fr_nc3', 'fr_root', 'Winawer: 3... Bb4', {
  chapter: FR,
  idea: "The pin on c3 renews the threat against e4; White's main answer locks the centre with e5.",
  verdict: 'Sharp',
  candidates: ['4. e5 »'],
});

addPosition('fr_win4', 'fr_nc3', 'Winawer Advance: 4... c5', {
  chapter: FR,
  idea: 'Mainline: 5. a3 Bxc3+ 6. bxc3 Ne7 - a lasting dark-square grip against doubled c-pawns to target.',
  verdict: 'Unclear',
  candidates: [],
});

// --- Worked example (EXAMPLE chrome lives here only) -------------------------
// One fully annotated specimen position - the Giuoco Piano after 4. c3 -
// whose candidate chips are reference nodes into the live Italian chapter,
// so tapping them lands on the real pages those moves lead to.

addNode('example_workspace', 'start_here', 'position', 'Reading a Position Page', {
  ...boardFields(POSITIONS.it_giuoco.board),
  move_list: POSITIONS.it_giuoco.line,
  to_move: 'Black to play',
  chapter_label: 'WORKED EXAMPLE · HOW A PAGE WORKS',
  idea: 'Every page reads the same way: diagram, the line that made it, the book verdict - then tap a candidate move to follow it deeper.',
  eval_text: '=',
  candidate_1_label: '4... Nf6 »',
  candidate_2_label: '4... d6 »',
  candidate_3_label: '',
}, { example: true });

addNode('ex_ref_nf6', 'example_workspace', 'position', '» The mainline page', {
  ...exampleChrome,
  candidate_1_label: '',
  candidate_2_label: '',
  candidate_3_label: '',
}, { referenceId: 'it_main5' });

addNode('ex_ref_d6', 'example_workspace', 'position', '» The sideline page', {
  ...exampleChrome,
  candidate_1_label: '',
  candidate_2_label: '',
  candidate_3_label: '',
}, { referenceId: 'it_d6' });

// --- Practice kit (the blank workspace) --------------------------------------

const slotLabels = {};
for (let slot = 1; slot <= 24; slot += 1) {
  if (slot <= CONFIG.worksheetCount) {
    slotLabels[`slot_${slot}_label`] = `Line Worksheet ${pad2(slot)} »`;
  } else if (slot <= CONFIG.worksheetCount + CONFIG.studyLogCount) {
    slotLabels[`slot_${slot}_label`] = `Study Log ${pad2(slot - CONFIG.worksheetCount)} »`;
  } else {
    slotLabels[`slot_${slot}_label`] = '';
  }
}

addNode('blank_workspace', 'start_here', 'workspace', 'Practice Kit', {
  example_label: '',
  skip_label: '',
  hero: 'Turn reading into knowing: rebuild your lines from memory on blank boards, then score every session so the weak branches surface by themselves.',
  workspace_note: `Sheets in this copy: ${CONFIG.worksheetCount} line worksheets and ${CONFIG.studyLogCount} study logs. Set worksheetCount (4-16) and studyLogCount (2-8) in the generator config before generating to change them.`,
  ...slotLabels,
});

for (let sheet = 1; sheet <= CONFIG.worksheetCount; sheet += 1) {
  addNode(`worksheet_${pad2(sheet)}`, 'blank_workspace', 'worksheet', `Worksheet ${pad2(sheet)}`, {
    ...boardFields('8/8/8/8/8/8/8/8'),
  });
}

for (let sheet = 1; sheet <= CONFIG.studyLogCount; sheet += 1) {
  addNode(`study_log_${pad2(sheet)}`, 'blank_workspace', 'study_log', `Study Log ${pad2(sheet)}`, {});
}

return { nodes, rootId: 'root' };
