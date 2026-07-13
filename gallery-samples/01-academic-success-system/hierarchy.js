const DEFAULT_CONFIG = { courseCount: 4, teachingWeeks: 14, notesPerCourse: 6, cardsPerCourse: 8 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  courseCount: [1, 6],
  teachingWeeks: [4, 18],
  notesPerCourse: [1, 12],
  cardsPerCourse: [1, 20],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Study Compass config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Study Compass node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Study Compass template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (options.referenceId) nodes[id].referenceId = options.referenceId;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Study Compass parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

addNode('root', null, 'cover', 'Study Compass', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
});

addNode('example_workspace', 'start_here', 'workspace', 'Guided Example', {
  subtitle: 'Environmental science, shown as one connected study route.',
  workspace_mode: 'GUIDED WORKSPACE',
  hero: 'See one idea travel from lecture to confident recall.',
  workspace_note: 'Use the terracotta EXAMPLE marker to distinguish demonstration content.',
}, { example: true });
addNode('example_semester', 'example_workspace', 'semester', 'Autumn Term | Environmental Science', {
  subtitle: 'A focused example semester with one course and one teaching week.',
  course_summary: '1 COURSE',
  week_summary: 'WEEK 04',
  term_focus: 'SYSTEMS THINKING',
}, { example: true });
addNode('example_week', 'example_semester', 'week', 'Week 04 | Carbon Cycle', {
  subtitle: 'Connect lecture concepts to field evidence and active recall.',
  intention: 'Explain how carbon moves between atmosphere, biosphere, ocean, and rock.',
  learn_plan: 'Tuesday lecture: carbon reservoirs\nThursday lab: soil respiration\nRead: feedback loops, pp. 72-89',
  make_plan: 'Sketch reservoir model\nDraft field observation brief\nCreate one retrieval card',
}, { example: true });
addNode('example_course', 'example_semester', 'course', 'Environmental Science', {
  subtitle: 'ENV 204 | Earth systems and human choices',
  guiding_question: 'How do connected natural systems respond when one flow changes?',
  course_status: 'Current focus: carbon pathways, feedback, and evidence quality.',
}, { example: true });
addNode('example_deck', 'example_course', 'deck', 'Environmental Science | Revision Deck', {
  subtitle: 'Small prompts designed for effortful retrieval.',
}, { example: true });
addNode('example_card_front', 'example_deck', 'card_front', 'Card 01 | Carbon Sink', {
  question: 'What makes a carbon reservoir a carbon sink?',
  memory_cue: 'Compare what enters with what leaves over time.',
}, { example: true });
addNode('example_card_back', 'example_card_front', 'card_back', 'Card 01 | Answer', {
  answer: 'A reservoir is a sink when it absorbs more carbon than it releases over a defined period.',
  check: 'Can you name one sink and one condition that could weaken it?',
}, { example: true });
addNode('example_cornell', 'example_course', 'cornell', 'Lecture 04 | Carbon Pathways', {
  subtitle: 'Tuesday lecture | Earth systems',
  cues: 'Reservoir?\n\nFlux?\n\nSink vs source?\n\nWhy timescale matters?',
  notes: 'Carbon is stored in reservoirs and moves through fluxes.\n\nPhotosynthesis transfers atmospheric carbon into biomass; respiration and combustion return it.\n\nA reservoir can change roles when inputs or outputs shift. Always state timescale and boundary.',
  summary: 'Sink and source describe net flow, not fixed identities. Context and timescale decide the label.',
}, { example: true });
addNode('example_note_card_reference', 'example_cornell', 'card_front', 'Linked Card | Carbon Sink', {
  question: 'What makes a carbon reservoir a carbon sink?',
  memory_cue: 'Compare what enters with what leaves over time.',
}, { example: true, referenceId: 'example_card_front' });
addNode('example_note_card_answer_reference', 'example_note_card_reference', 'card_back', 'Linked Card | Answer', {
  answer: 'A reservoir is a sink when it absorbs more carbon than it releases over a defined period.',
  check: 'Can you name one sink and one condition that could weaken it?',
}, { example: true, referenceId: 'example_card_back' });
addNode('example_assignments', 'example_course', 'assignments', 'Environmental Science | Assignments', {
  subtitle: 'Make scope and evidence visible before drafting.',
  next_assignment: 'Field observation brief | Due Friday | 800 words',
}, { example: true });
addNode('example_exam', 'example_course', 'exam', 'Environmental Science | Exam Plan', {
  subtitle: 'Exam date: 18 December | Short answer and systems analysis',
  exam_goal: 'Explain relationships, support claims with mechanisms, and draw legible system models.',
  exam_strategy: 'Retrieve first. Check notes second. Rework weak explanations into new card prompts.',
}, { example: true });

addNode('blank_workspace', 'start_here', 'workspace', 'Blank Study Workspace', {
  example_label: '',
  skip_label: '',
  subtitle: 'A complete semester structure without sample answers.',
  workspace_mode: 'BLANK WORKSPACE',
  hero: 'Build a semester around your own courses and commitments.',
  workspace_note: `${CONFIG.courseCount} courses | ${CONFIG.teachingWeeks} teaching weeks | reusable note and card banks`,
});
addNode('blank_semester', 'blank_workspace', 'semester', 'My Semester', {
  subtitle: 'Name the term, dates, and one useful intention.',
  course_summary: `${CONFIG.courseCount} COURSES`,
  week_summary: `${CONFIG.teachingWeeks} WEEKS`,
  term_focus: 'TERM FOCUS',
});

for (let week = 1; week <= CONFIG.teachingWeeks; week += 1) {
  const weekNumber = String(week).padStart(2, '0');
  addNode(`blank_week_${weekNumber}`, 'blank_semester', 'week', `Week ${weekNumber}`, {
    subtitle: 'Dates / theme / constraints',
    intention: '',
    learn_plan: '',
    make_plan: '',
  });
}

for (let course = 1; course <= CONFIG.courseCount; course += 1) {
  const courseNumber = String(course).padStart(2, '0');
  const courseId = `blank_course_${courseNumber}`;
  const deckId = `${courseId}_deck`;
  addNode(courseId, 'blank_semester', 'course', `Course ${courseNumber}`, {
    subtitle: 'Course code / instructor / meeting pattern',
    guiding_question: '',
    course_status: '',
  });
  addNode(deckId, courseId, 'deck', `Course ${courseNumber} | Revision Deck`, {
    subtitle: 'Write one clear question per card.',
  });

  const cardFrontIds = [];
  for (let card = 1; card <= CONFIG.cardsPerCourse; card += 1) {
    const cardNumber = String(card).padStart(2, '0');
    const frontId = `${courseId}_card_${cardNumber}_front`;
    cardFrontIds.push(frontId);
    addNode(frontId, deckId, 'card_front', `Revision Card ${cardNumber} | Question`, {
      question: '',
      memory_cue: '',
    });
    addNode(`${courseId}_card_${cardNumber}_back`, frontId, 'card_back', `Revision Card ${cardNumber} | Answer`, {
      answer: '',
      check: '',
    });
  }

  for (let note = 1; note <= CONFIG.notesPerCourse; note += 1) {
    const noteNumber = String(note).padStart(2, '0');
    const noteId = `${courseId}_note_${noteNumber}`;
    const linkedFrontId = cardFrontIds[(note - 1) % cardFrontIds.length];
    const linkedBackId = nodes[linkedFrontId].children[0];
    addNode(noteId, courseId, 'cornell', `Cornell Note ${noteNumber}`, {
      subtitle: 'Topic / date / source',
      cues: '',
      notes: '',
      summary: '',
    });
    const frontReferenceId = `${noteId}_card_reference`;
    addNode(frontReferenceId, noteId, 'card_front', `Linked Revision Card ${String(((note - 1) % cardFrontIds.length) + 1).padStart(2, '0')}`, {
      question: '',
      memory_cue: '',
    }, { referenceId: linkedFrontId });
    addNode(`${frontReferenceId}_answer`, frontReferenceId, 'card_back', 'Linked Revision Card | Answer', {
      answer: '',
      check: '',
    }, { referenceId: linkedBackId });
  }

  addNode(`${courseId}_assignments`, courseId, 'assignments', `Course ${courseNumber} | Assignments`, {
    subtitle: 'Brief / due date / status / next action',
    next_assignment: '',
  });
  addNode(`${courseId}_exam`, courseId, 'exam', `Course ${courseNumber} | Exam Plan`, {
    subtitle: 'Date / format / scope',
    exam_goal: '',
    exam_strategy: '',
  });
}

return { nodes, rootId: 'root' };
