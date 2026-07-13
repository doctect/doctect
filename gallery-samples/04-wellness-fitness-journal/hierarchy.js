const DEFAULT_CONFIG = { monthCount: 12, weekCount: 52, workoutsPerWeek: 2 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  monthCount: [1, 12],
  weekCount: [4, 52],
  workoutsPerWeek: [0, 4],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Wellbeing Rhythm config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Wellbeing Rhythm node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Wellbeing Rhythm template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Wellbeing Rhythm parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const habitLabels = {
  habit_label_1: 'Sleep rhythm',
  habit_label_2: 'Hydration',
  habit_label_3: 'Walk / fresh air',
  habit_label_4: 'Strength / mobility',
  habit_label_5: 'Quiet reset',
  habit_label_6: 'Energy check-in',
};

const habitData = (values = {}) => {
  const data = { ...habitLabels, intention: '' };
  for (let habit = 1; habit <= 6; habit += 1) {
    for (let day = 1; day <= 31; day += 1) data[`habit_${habit}_day_${day}`] = '';
  }
  return { ...data, ...values };
};

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekData = (weekNumber, values = {}) => {
  const data = {
    subtitle: `Week ${weekNumber} | Plan movement, notice energy, leave room for recovery.`,
    week_number: weekNumber,
    sleep_rhythm: '',
    hydration: '',
    walking: '',
    energy: '',
    recovery_note: '',
  };
  weekdayNames.forEach((weekday, index) => {
    const row = index + 1;
    data[`weekday_${row}`] = weekday;
    data[`movement_${row}`] = '';
    data[`energy_${row}`] = '';
    data[`note_${row}`] = '';
  });
  return { ...data, ...values };
};

const workoutData = (weekNumber, sessionNumber, values = {}) => {
  const data = {
    subtitle: `Week ${weekNumber} | Strength session ${sessionNumber}`,
    session_focus: '',
    readiness: '',
    session_note: '',
  };
  for (let row = 1; row <= 6; row += 1) {
    data[`movement_${row}`] = '';
    data[`sets_${row}`] = '';
    data[`reps_${row}`] = '';
    data[`load_${row}`] = '';
    data[`rpe_${row}`] = '';
    data[`notes_${row}`] = '';
  }
  return { ...data, ...values };
};

const recoveryData = (month, values = {}) => ({
  subtitle: `${month} | A separate page for energy and recovery patterns.`,
  restored: '',
  felt_heavy: '',
  energy_pattern: '',
  recovery_pattern: '',
  adjustment: '',
  ...values,
});

const reflectionData = (month, values = {}) => ({
  subtitle: `${month} | Close the month with one useful pattern, not a score.`,
  win: '',
  lesson: '',
  carry_forward: '',
  ...values,
});

addNode('root', null, 'cover', 'Wellbeing Rhythm', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
});

addNode('example_workspace', 'start_here', 'workspace', 'Guided Balanced Week', {
  subtitle: 'One practical week showing habits, movement, strength, energy, and recovery.',
  workspace_mode: 'GUIDED WORKSPACE',
  hero: 'Follow a steady week where movement and recovery belong together.',
}, { example: true });

addNode('example_baseline', 'example_workspace', 'baseline', 'Example Starting Point', {
  subtitle: 'A neutral snapshot before the week begins.',
  current_rhythm: 'Workdays are structured; evenings often run later than intended.',
  support: 'Morning daylight, a prepared water bottle, and sessions written into the calendar.',
  movement_focus: 'Two unhurried strength sessions plus easy walking on three days.',
  intention: 'Build a repeatable week, not a perfect one.',
}, { example: true });

const exampleHabitValues = {
  intention: 'Protect steady cues: wind-down, water nearby, and movement planned before the week fills.',
};
for (let habit = 1; habit <= 6; habit += 1) {
  for (let day = 1; day <= 7; day += 1) {
    if ((habit + day) % 4 !== 0) exampleHabitValues[`habit_${habit}_day_${day}`] = '•';
  }
}
addNode('example_month', 'example_workspace', 'month_habits', 'A Balanced Month | Example', habitData(exampleHabitValues), { example: true });

addNode('example_week', 'example_month', 'week', 'Balanced Week | Example', weekData(1, {
  subtitle: 'A balanced example | Adapt the rhythm to your own context.',
  sleep_rhythm: 'Wind-down by 10:30',
  hydration: 'Bottle at desk; refill twice',
  walking: 'Three easy walks',
  energy: 'Steady, 3 / 5',
  recovery_note: 'Friday stayed gentle after a busy Thursday.',
  movement_1: 'Easy walk, 30 min', energy_1: '3 / 5', note_1: 'Fresh air before lunch',
  movement_2: 'Strength A', energy_2: '4 / 5', note_2: 'Comfortable pace',
  movement_3: 'Mobility, 15 min', energy_3: '3 / 5', note_3: 'Kept it light',
  movement_4: 'Strength B', energy_4: '3 / 5', note_4: 'Stopped with room left',
  movement_5: 'Rest', energy_5: '2 / 5', note_5: 'Earlier evening',
  movement_6: 'Easy walk, 40 min', energy_6: '4 / 5', note_6: 'Unhurried',
  movement_7: 'Easy walk, 25 min', energy_7: '3 / 5', note_7: 'Weekly reset',
}), { example: true });

addNode('example_workout_01', 'example_week', 'workout', 'Strength A | Example', workoutData(1, 1, {
  subtitle: 'Tuesday | Balanced full-body strength example',
  session_focus: 'Comfortable full-body practice',
  readiness: '4 / 5 | steady',
  session_note: 'Technique stayed smooth; finished with energy available.',
  movement_1: 'Goblet squat', sets_1: '3', reps_1: '8', load_1: '12 kg', rpe_1: '6', notes_1: 'Smooth tempo',
  movement_2: 'Incline push-up', sets_2: '3', reps_2: '8', load_2: 'Body', rpe_2: '6', notes_2: 'Steady',
  movement_3: 'One-arm row', sets_3: '3', reps_3: '10', load_3: '10 kg', rpe_3: '7', notes_3: 'Each side',
  movement_4: 'Hip hinge', sets_4: '2', reps_4: '10', load_4: '16 kg', rpe_4: '6', notes_4: 'Easy range',
  movement_5: 'Carry', sets_5: '3', reps_5: '30 s', load_5: '12 kg', rpe_5: '6', notes_5: 'Tall posture',
}), { example: true });

addNode('example_workout_02', 'example_workout_01', 'workout', 'Strength B | Example', workoutData(1, 2, {
  subtitle: 'Thursday | A second moderate strength example',
  session_focus: 'Hinge, press, pull, and carry',
  readiness: '3 / 5 | settled',
  session_note: 'Used moderate effort and left the final optional set undone.',
  movement_1: 'Romanian deadlift', sets_1: '3', reps_1: '8', load_1: '20 kg', rpe_1: '7', notes_1: 'Controlled',
  movement_2: 'Half-kneeling press', sets_2: '3', reps_2: '8', load_2: '8 kg', rpe_2: '6', notes_2: 'Each side',
  movement_3: 'Band row', sets_3: '3', reps_3: '12', load_3: 'Medium', rpe_3: '6', notes_3: 'Pause back',
  movement_4: 'Split squat', sets_4: '2', reps_4: '8', load_4: 'Body', rpe_4: '7', notes_4: 'Each side',
  movement_5: 'Suitcase carry', sets_5: '3', reps_5: '30 s', load_5: '12 kg', rpe_5: '6', notes_5: 'Switch sides',
}), { example: true });

addNode('example_recovery', 'example_workout_02', 'recovery', 'Recovery Notes | Example', recoveryData('Example month', {
  restored: 'Three easy walks, one quieter evening, and leaving margin in both strength sessions.',
  felt_heavy: 'Thursday work demands made the late afternoon feel crowded.',
  energy_pattern: 'Most steady before lunch; lower after long meeting blocks.',
  recovery_pattern: 'Earlier wind-down made the following morning feel less rushed.',
  adjustment: 'Keep Friday unscheduled for training and protect a short midday walk.',
}), { example: true });

addNode('example_reflection', 'example_recovery', 'month_reflection', 'Rhythm Reflection | Example', reflectionData('Example month', {
  win: 'Both strength sessions happened without pushing aside walking or recovery.',
  lesson: 'Planned gentleness on Friday made the whole week easier to repeat.',
  carry_forward: 'Schedule two moderate sessions and leave one evening deliberately open.',
}), { example: true });

addNode('blank_workspace', 'start_here', 'workspace', 'Blank Wellbeing Workspace', {
  example_label: '',
  skip_label: '',
  subtitle: 'A clean, configurable journal with no sample ratings, entries, or workout data.',
  workspace_mode: 'BLANK WORKSPACE',
  hero: 'Build a rhythm from your own habits, movement, energy, and recovery.',
});

addNode('blank_baseline', 'blank_workspace', 'baseline', 'My Starting Baseline', {
  subtitle: 'Begin with a neutral snapshot. Return whenever your context changes.',
  current_rhythm: '',
  support: '',
  movement_focus: '',
  intention: '',
});

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const weeksByMonth = Array.from({ length: CONFIG.monthCount }, () => []);
for (let week = 1; week <= CONFIG.weekCount; week += 1) {
  const monthIndex = Math.floor(((week - 1) * CONFIG.monthCount) / CONFIG.weekCount);
  weeksByMonth[monthIndex].push(week);
}

for (let monthIndex = 0; monthIndex < CONFIG.monthCount; monthIndex += 1) {
  const monthNumber = String(monthIndex + 1).padStart(2, '0');
  const monthName = monthNames[monthIndex];
  const monthId = `blank_month_${monthNumber}`;
  addNode(monthId, 'blank_workspace', 'month_habits', monthName, {
    ...habitData(),
    subtitle: `${monthName} | Habits are cues to notice, not targets to perfect.`,
  });

  let sequenceParent = monthId;
  weeksByMonth[monthIndex].forEach(weekNumber => {
    const weekId = `blank_week_${String(weekNumber).padStart(2, '0')}`;
    addNode(weekId, sequenceParent, 'week', `Week ${String(weekNumber).padStart(2, '0')}`, weekData(weekNumber));
    sequenceParent = weekId;

    for (let workout = 1; workout <= CONFIG.workoutsPerWeek; workout += 1) {
      const workoutId = `${weekId}_workout_${String(workout).padStart(2, '0')}`;
      addNode(workoutId, sequenceParent, 'workout', `Week ${weekNumber} | Strength ${workout}`, workoutData(weekNumber, workout));
      sequenceParent = workoutId;
    }
  });

  const recoveryId = `blank_month_${monthNumber}_recovery`;
  addNode(recoveryId, sequenceParent, 'recovery', `${monthName} Recovery Notes`, recoveryData(monthName));
  addNode(`blank_month_${monthNumber}_reflection`, recoveryId, 'month_reflection', `${monthName} Reflection`, reflectionData(monthName));
}

return { nodes, rootId: 'root' };
