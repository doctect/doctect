const DEFAULT_CONFIG = { projectCount: 3, meetingsPerProject: 8, reviewWeeks: 12 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  projectCount: [1, 6],
  meetingsPerProject: [1, 20],
  reviewWeeks: [4, 52],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Project Desk config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Project Desk node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Project Desk template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (options.referenceId) nodes[id].referenceId = options.referenceId;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Project Desk parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const addDecisionReference = (prefix, meetingId, decisionId, boardId, example = false) => {
  const decisionReferenceId = `${prefix}_decision_reference`;
  addNode(decisionReferenceId, meetingId, 'decisions', 'Referenced Decision Record', {
    decision_id: example ? 'DEC-07' : '',
    decision_date: example ? '12 September | Launch readiness meeting' : '',
    decision: example ? 'Keep legacy paths live for 30 days and publish a redirect map before launch.' : '',
    rationale: example ? 'Analytics show active inbound links to legacy resource pages. A measured transition protects findability.' : '',
    action: example ? 'Publish redirect map | Web Ops | Due 18 September' : '',
  }, { example, referenceId: decisionId });
  addNode(`${decisionReferenceId}_board_reference`, decisionReferenceId, 'board', 'Referenced Board Action', {
    subtitle: example ? 'Website launch | linked action' : '',
    action: example ? 'Publish redirect map | Web Ops | Due 18 September' : '',
  }, { example, referenceId: boardId });
};

addNode('root', null, 'cover', 'Project Desk', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
});

addNode('example_workspace', 'start_here', 'workspace', 'Guided Website Launch', {
  subtitle: 'One operational thread from launch brief to board action.',
  workspace_mode: 'GUIDED WORKSPACE',
  capacity: '1 ACTIVE PROJECT',
  hero: 'A decision becomes useful only when it changes visible work.',
  workspace_note: 'Follow DEC-07 from the launch-readiness meeting into the decision register, then open its board action.',
}, { example: true });
addNode('example_portfolio', 'example_workspace', 'portfolio', 'Launch Portfolio', {
  subtitle: 'A compact portfolio showing one website launch and one review cycle.',
  project_summary: '1 PROJECT',
  review_summary: 'WEEK 06 REVIEW',
  focus: 'SAFE CUTOVER',
}, { example: true });
addNode('example_brief', 'example_portfolio', 'brief', 'Website Relaunch', {
  subtitle: 'Public launch | content, redirects, analytics, and owner readiness',
  objective: 'Launch a faster, clearer website without breaking trusted routes or obscuring essential resources.',
  owner_horizon: 'Digital lead\nLaunch: 28 Sep',
  success: 'Core journeys complete; legacy links resolve; launch owners can diagnose issues within one hour.',
  boundaries: 'No visual-system expansion after content freeze. No new campaign features in launch scope.',
}, { example: true });
addNode('example_board', 'example_brief', 'board', 'Website Relaunch | Board', {
  subtitle: 'Writable lanes with one decision-created action called out above them.',
  action: 'Publish redirect map | Web Ops | Due 18 September',
}, { example: true });
addNode('example_meeting_index', 'example_brief', 'meeting_index', 'Website Relaunch | Meetings', {
  subtitle: 'Open the launch-readiness meeting to follow DEC-07.',
}, { example: true });
addNode('example_decisions', 'example_brief', 'decisions', 'Website Relaunch | Decisions', {
  subtitle: 'One durable place for choices, rationale, owners, and resulting action.',
  decision_id: 'DEC-07',
  decision_date: '12 September | Launch readiness meeting',
  decision: 'Keep legacy paths live for 30 days and publish a redirect map before launch.',
  rationale: 'Analytics show active inbound links to legacy resource pages. A measured transition protects findability.',
  action: 'Publish redirect map | Web Ops | Due 18 September',
}, { example: true });
addNode('example_decision_board_reference', 'example_decisions', 'board', 'Board Action | Redirect Map', {
  subtitle: 'Website launch | linked from DEC-07',
  action: 'Publish redirect map | Web Ops | Due 18 September',
}, { example: true, referenceId: 'example_board' });
addNode('example_risks', 'example_brief', 'risks', 'Website Relaunch | Risks', {
  subtitle: 'Signals and response plans, not speculative task cards.',
  risk: 'Legacy links fail after cutover | Signal: 404 rate above baseline | Response: restore redirect rule and notify Web Ops.',
}, { example: true });
addNode('example_meeting', 'example_meeting_index', 'meeting', 'Launch Readiness | 12 September', {
  subtitle: 'A decision-focused log with a durable record and named action.',
  meeting_meta: '12 SEP  /  30 MIN  /  CONTENT + WEB OPS + ANALYTICS',
  agenda: 'Confirm cutover conditions and legacy-route handling.',
  notes: 'Inbound-link report shows active traffic to legacy resource URLs.',
  decision: 'Keep legacy paths live for 30 days and publish a redirect map before launch.',
  actions: 'Publish redirect map | Web Ops | Due 18 September',
  decision_id: 'DEC-07',
}, { example: true });
addDecisionReference('example_meeting', 'example_meeting', 'example_decisions', 'example_board', true);
addNode('example_weekly_review', 'example_portfolio', 'weekly_review', 'Week 06 | Launch Review', {
  subtitle: 'Close loops across project delivery, risk, and decisions.',
  week_focus: 'LAUNCH CONFIDENCE  /  redirect ownership is now explicit',
  wins: 'Cutover checklist reviewed. Core content owners confirmed.',
  friction: 'Legacy routes lacked one accountable owner before DEC-07.',
  decisions_needed: 'None open. Verify redirect-map completion at next review.',
  next_week: 'Test top legacy routes, publish ownership rota, and rehearse rollback.',
}, { example: true });

addNode('blank_workspace', 'start_here', 'workspace', 'Blank Project Workspace', {
  subtitle: 'Clean project desks and a portfolio-level weekly review cadence.',
  workspace_mode: 'BLANK WORKSPACE',
  capacity: `${CONFIG.projectCount} PROJECTS`,
  hero: 'Make commitments, decisions, and risks visible on paper.',
  workspace_note: `${CONFIG.projectCount} project desks | ${CONFIG.meetingsPerProject} meeting logs each | ${CONFIG.reviewWeeks} portfolio reviews`,
});
addNode('blank_portfolio', 'blank_workspace', 'portfolio', 'My Project Portfolio', {
  subtitle: 'Name the portfolio focus, then open a project desk or the weekly review cadence.',
  project_summary: `${CONFIG.projectCount} PROJECTS`,
  review_summary: `${CONFIG.reviewWeeks} REVIEWS`,
  focus: 'PORTFOLIO FOCUS',
});

for (let project = 1; project <= CONFIG.projectCount; project += 1) {
  const projectNumber = String(project).padStart(2, '0');
  const prefix = `blank_project_${projectNumber}`;
  const briefId = `${prefix}_brief`;
  const boardId = `${prefix}_board`;
  const meetingIndexId = `${prefix}_meeting_index`;
  const decisionsId = `${prefix}_decisions`;

  addNode(briefId, 'blank_portfolio', 'brief', `Project ${projectNumber} | Brief`, {
    subtitle: 'Project name / sponsor / dates',
    objective: '',
    owner_horizon: '',
    success: '',
    boundaries: '',
  });
  addNode(boardId, briefId, 'board', `Project ${projectNumber} | Board`, {
    subtitle: 'Write work into Ready, Doing, and Done lanes.',
    action: '',
  });
  addNode(meetingIndexId, briefId, 'meeting_index', `Project ${projectNumber} | Meetings`, {
    subtitle: `${CONFIG.meetingsPerProject} reusable decision-focused meeting logs`,
  });
  addNode(decisionsId, briefId, 'decisions', `Project ${projectNumber} | Decisions`, {
    subtitle: 'Record the choice, date, rationale, owner, and resulting action.',
    decision_id: '',
    decision_date: '',
    decision: '',
    rationale: '',
    action: '',
  });
  addNode(`${prefix}_decision_board_reference`, decisionsId, 'board', `Project ${projectNumber} | Referenced Board`, {
    subtitle: '',
    action: '',
  }, { referenceId: boardId });
  addNode(`${prefix}_risks`, briefId, 'risks', `Project ${projectNumber} | Risks`, {
    subtitle: 'Write observable signals, impact, owner, and response.',
    risk: '',
  });

  for (let meeting = 1; meeting <= CONFIG.meetingsPerProject; meeting += 1) {
    const meetingNumber = String(meeting).padStart(2, '0');
    const meetingId = `${prefix}_meeting_${meetingNumber}`;
    addNode(meetingId, meetingIndexId, 'meeting', `Meeting ${meetingNumber}`, {
      subtitle: 'Meeting purpose / date',
      meeting_meta: '',
      agenda: '',
      notes: '',
      decision: '',
      actions: '',
      decision_id: '',
    });
    addDecisionReference(meetingId, meetingId, decisionsId, boardId);
  }
}

let previousReviewId = 'blank_portfolio';
for (let week = 1; week <= CONFIG.reviewWeeks; week += 1) {
  const weekNumber = String(week).padStart(2, '0');
  const reviewId = `blank_review_${weekNumber}`;
  addNode(reviewId, previousReviewId, 'weekly_review', `Week ${weekNumber} | Portfolio Review`, {
    subtitle: 'Week / date / reviewer',
    week_focus: '',
    wins: '',
    friction: '',
    decisions_needed: '',
    next_week: '',
  });
  previousReviewId = reviewId;
}

return { nodes, rootId: 'root' };
