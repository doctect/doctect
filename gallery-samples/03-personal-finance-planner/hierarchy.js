const DEFAULT_CONFIG = { transactionPagesPerMonth: 2, goalCount: 4 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  transactionPagesPerMonth: [1, 4],
  goalCount: [1, 8],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Money Map config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Money Map node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Money Map template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Money Map parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const categoryNames = {
  category_housing: 'Housing',
  category_food: 'Food',
  category_transport: 'Transport',
  category_leisure: 'Leisure',
  category_savings: 'Savings',
  category_other: 'Other',
};

const blankMonthData = (month) => ({
  subtitle: 'Plan first, then record what actually moves.',
  month,
  fictional_notice: '',
  planned_income: '',
  actual_income: '',
  month_intention: '',
  housing: '',
  food: '',
  transport: '',
  leisure: '',
  savings: '',
  ...categoryNames,
  planned_housing: '', actual_housing: '', difference_housing: '',
  planned_food: '', actual_food: '', difference_food: '',
  planned_transport: '', actual_transport: '', difference_transport: '',
  planned_leisure: '', actual_leisure: '', difference_leisure: '',
  planned_savings: '', actual_savings: '', difference_savings: '',
  planned_other: '', actual_other: '', difference_other: '',
});

const blankTransactionData = (month, page) => {
  const data = { subtitle: `${month} | Transaction sheet ${page}` };
  for (let row = 1; row <= 8; row += 1) {
    data[`date_${row}`] = '';
    data[`description_${row}`] = '';
    data[`category_${row}`] = '';
    data[`amount_${row}`] = '';
  }
  return data;
};

const blankCategoryData = (month) => ({
  subtitle: `${month} | Planned against actual`,
  ...categoryNames,
  planned_housing: '', actual_housing: '', difference_housing: '',
  planned_food: '', actual_food: '', difference_food: '',
  planned_transport: '', actual_transport: '', difference_transport: '',
  planned_leisure: '', actual_leisure: '', difference_leisure: '',
  planned_savings: '', actual_savings: '', difference_savings: '',
  planned_other: '', actual_other: '', difference_other: '',
  reflection: '',
});

const blankBillsData = () => {
  const data = {
    subtitle: 'Recurring bills and subscriptions, with one paid-square per month.',
    audit_note: '',
    nav_prev_label: '« DEC',
    nav_next_label: 'FUNDS »',
  };
  for (let row = 1; row <= 8; row += 1) {
    data[`bill_${row}`] = '';
    data[`due_${row}`] = '';
    data[`amount_${row}`] = '';
  }
  return data;
};

const blankSinkingData = () => {
  const data = { subtitle: 'Name future costs and make their next transfers visible.', next_check: '' };
  for (let row = 1; row <= 6; row += 1) {
    data[`fund_${row}`] = '';
    data[`target_${row}`] = '';
    data[`saved_${row}`] = '';
    data[`next_${row}`] = '';
  }
  return data;
};

const blankGoalData = () => {
  const data = {
    subtitle: 'Break one debt or savings target into visible milestones.',
    goal_name: '',
    target_summary: '',
    goal_why: '',
  };
  for (let row = 1; row <= 5; row += 1) {
    data[`milestone_${row}`] = '';
    data[`target_${row}`] = '';
    data[`saved_${row}`] = '';
    data[`next_${row}`] = '';
  }
  return data;
};

const annualData = (values = {}) => ({
  subtitle: 'Map expected movement, then open any month or long-range target.',
  quarter_1: 'JAN - MAR', quarter_2: 'APR - JUN', quarter_3: 'JUL - SEP', quarter_4: 'OCT - DEC',
  planned_q1: '', actual_q1: '', difference_q1: '',
  planned_q2: '', actual_q2: '', difference_q2: '',
  planned_q3: '', actual_q3: '', difference_q3: '',
  planned_q4: '', actual_q4: '', difference_q4: '',
  ...values,
});

addNode('root', null, 'cover', 'Money Map', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
});

addNode('example_workspace', 'start_here', 'workspace', 'Guided January', {
  subtitle: 'A clearly fictional household example, from plan to reflection.',
  workspace_mode: 'GUIDED WORKSPACE',
  hero: 'Watch one January move from intentions to useful evidence.',
  workspace_note: 'All names and figures in this branch are fictional and instructional.',
}, { example: true });
addNode('example_annual', 'example_workspace', 'annual', 'Fictional 2026 Outlook', annualData({
  planned_q1: '$14,550', actual_q1: '$4,910 to date', difference_q1: 'In progress',
}), { example: true });
addNode('example_january', 'example_annual', 'month', 'January Plan | Fictional Example', {
  subtitle: 'Fictional household | January planning and actuals',
  month: 'January',
  fictional_notice: 'Fictional example - for guidance only, not financial advice.',
  planned_income: '$4,850',
  actual_income: '$4,910',
  month_intention: 'Fund priorities before optional spending.',
  housing: '$1,650', food: '$620', transport: '$310', leisure: '$240', savings: '$900',
  ...categoryNames,
  planned_housing: '$1,650', actual_housing: '$1,650', difference_housing: '$0',
  planned_food: '$620', actual_food: '$586', difference_food: '+$34',
  planned_transport: '$310', actual_transport: '$294', difference_transport: '+$16',
  planned_leisure: '$240', actual_leisure: '$268', difference_leisure: '-$28',
  planned_savings: '$900', actual_savings: '$900', difference_savings: '$0',
  planned_other: '$530', actual_other: '$487', difference_other: '+$43',
  nav_prev_label: '',
  nav_next_label: 'BILLS »',
}, { example: true });
addNode('example_transactions', 'example_january', 'transactions', 'January Transactions | Fictional', {
  subtitle: 'Fictional entries | January transaction sheet',
  date_1: 'Jan 02', description_1: 'Apartment rent', category_1: 'Housing', amount_1: '$1,650.00',
  date_2: 'Jan 03', description_2: 'Grocer and market', category_2: 'Food', amount_2: '$142.38',
  date_3: 'Jan 05', description_3: 'Transit pass', category_3: 'Transport', amount_3: '$96.00',
  date_4: 'Jan 08', description_4: 'Emergency fund transfer', category_4: 'Savings', amount_4: '$500.00',
  date_5: 'Jan 12', description_5: 'Electric and water', category_5: 'Other', amount_5: '$168.44',
  date_6: 'Jan 16', description_6: 'Dinner with friends', category_6: 'Leisure', amount_6: '$74.20',
  date_7: 'Jan 22', description_7: 'Grocer and market', category_7: 'Food', amount_7: '$118.72',
  date_8: 'Jan 28', description_8: 'Travel fund transfer', category_8: 'Savings', amount_8: '$400.00',
  continue_label: 'REVIEW »',
}, { example: true });
addNode('example_category_review', 'example_january', 'category_review', 'January Category Review | Fictional', {
  subtitle: 'Fictional January | A calm comparison of plan and actual',
  ...categoryNames,
  planned_housing: '$1,650', actual_housing: '$1,650', difference_housing: '$0',
  planned_food: '$620', actual_food: '$586', difference_food: '+$34',
  planned_transport: '$310', actual_transport: '$294', difference_transport: '+$16',
  planned_leisure: '$240', actual_leisure: '$268', difference_leisure: '-$28',
  planned_savings: '$900', actual_savings: '$900', difference_savings: '$0',
  planned_other: '$530', actual_other: '$487', difference_other: '+$43',
  reflection: 'Keep the automatic savings transfers. Add a little more room for social meals in February.',
  nav_prev_label: '« LOG 01',
}, { example: true });
addNode('example_bills', 'example_annual', 'bills', 'Bills Register | Fictional', {
  subtitle: 'Fictional recurring costs | Shade squares as months are paid',
  bill_1: 'Internet (fictional)', due_1: '05', amount_1: '$55.00',
  bill_2: 'Music streaming (fictional)', due_2: '12', amount_2: '$11.99',
  bill_3: 'Renter insurance (fictional)', due_3: '20', amount_3: '$18.50',
  bill_4: '', due_4: '', amount_4: '',
  bill_5: '', due_5: '', amount_5: '',
  bill_6: '', due_6: '', amount_6: '',
  bill_7: '', due_7: '', amount_7: '',
  bill_8: '', due_8: '', amount_8: '',
  audit_note: 'Streaming overlaps a bundle - review in March.',
  nav_prev_label: '« JAN',
  nav_next_label: 'FUNDS »',
}, { example: true });
addNode('example_sinking_funds', 'example_annual', 'sinking_funds', 'Sinking Funds | Fictional', {
  subtitle: 'Fictional allocations for known future costs',
  fund_1: 'Car maintenance', target_1: '$900', saved_1: '$340', next_1: '$80',
  fund_2: 'Annual insurance', target_2: '$1,200', saved_2: '$500', next_2: '$100',
  fund_3: 'Holiday travel', target_3: '$1,600', saved_3: '$400', next_3: '$120',
  fund_4: 'Home repair', target_4: '$750', saved_4: '$225', next_4: '$75',
  fund_5: 'Gifts', target_5: '$500', saved_5: '$90', next_5: '$40',
  fund_6: 'Technology', target_6: '$800', saved_6: '$180', next_6: '$50',
  next_check: 'Review transfers on the final Sunday of February.',
  nav_prev_label: '« BILLS',
  nav_next_label: 'GOAL 01 »',
}, { example: true });
addNode('example_goal', 'example_annual', 'goal', 'Emergency Fund Goal | Fictional', {
  subtitle: 'Fictional savings goal | Steady progress over dramatic changes',
  goal_name: 'Three-month emergency reserve',
  target_summary: '$12,000 / DEC 2026',
  goal_why: 'Create room to respond to a job change or urgent repair without new debt.',
  milestone_1: 'First month', target_1: '$4,000', saved_1: '$3,200', next_1: 'Transfer $500',
  milestone_2: 'Halfway', target_2: '$6,000', saved_2: '', next_2: 'Review in June',
  milestone_3: 'Two months', target_3: '$8,000', saved_3: '', next_3: '',
  milestone_4: 'Ten thousand', target_4: '$10,000', saved_4: '', next_4: '',
  milestone_5: 'Fully funded', target_5: '$12,000', saved_5: '', next_5: '',
  nav_prev_label: '« FUNDS',
  nav_next_label: 'YEAR REVIEW »',
}, { example: true });
addNode('example_year_review', 'example_annual', 'year_review', 'Year Review | Fictional Preview', {
  subtitle: 'Fictional preview | Revisit after twelve completed months',
  review_lens_income: 'Income', planned_income: '$58,200', actual_income: '',
  review_lens_spending: 'Core spending', planned_spending: '$35,400', actual_spending: '',
  review_lens_savings: 'Savings', planned_savings: '$10,800', actual_savings: '',
  review_lens_debt: 'Debt reduction', planned_debt: '$3,600', actual_debt: '',
  wins: 'Automatic transfers started before discretionary spending.',
  lesson: 'Category limits work better when they include realistic flexibility.',
  reflection: 'Keep savings automatic and review category assumptions quarterly.',
  nav_prev_label: '« GOAL 01',
  nav_next_label: '',
}, { example: true });

addNode('blank_workspace', 'start_here', 'workspace', 'Blank Money Workspace', {
  example_label: '',
  skip_label: '',
  subtitle: 'A complete twelve-month structure with no sample transactions or balances.',
  workspace_mode: 'BLANK WORKSPACE',
  hero: 'Give your own money a clear, flexible route through the year.',
  workspace_note: `12 months | ${CONFIG.transactionPagesPerMonth} transaction sheets each | ${CONFIG.goalCount} goals`,
});
addNode('blank_annual', 'blank_workspace', 'annual', 'My Annual Outlook', annualData());

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

months.forEach((month, monthIndex) => {
  const monthNumber = String(monthIndex + 1).padStart(2, '0');
  const monthId = `blank_month_${monthNumber}`;
  addNode(monthId, 'blank_annual', 'month', month, {
    ...blankMonthData(month),
    nav_prev_label: monthIndex === 0 ? '' : `« ${monthShorts[monthIndex - 1]}`,
    nav_next_label: monthIndex === 11 ? 'BILLS »' : `${monthShorts[monthIndex + 1]} »`,
  });

  const pages = CONFIG.transactionPagesPerMonth;
  for (let page = 1; page <= pages; page += 1) {
    const pageNumber = String(page).padStart(2, '0');
    addNode(`${monthId}_transactions_${pageNumber}`, monthId, 'transactions', `${month} Transactions ${pageNumber}`, {
      ...blankTransactionData(month, page),
      continue_label: page < pages ? `LOG ${String(page + 1).padStart(2, '0')} »` : 'REVIEW »',
    });
  }
  addNode(`${monthId}_category_review`, monthId, 'category_review', `${month} Category Review`, {
    ...blankCategoryData(month),
    nav_prev_label: `« LOG ${String(pages).padStart(2, '0')}`,
  });
});

addNode('blank_bills', 'blank_annual', 'bills', 'Bills & Subscriptions', blankBillsData());

addNode('blank_sinking_funds', 'blank_annual', 'sinking_funds', 'My Sinking Funds', {
  ...blankSinkingData(),
  nav_prev_label: '« BILLS',
  nav_next_label: 'GOAL 01 »',
});

for (let goal = 1; goal <= CONFIG.goalCount; goal += 1) {
  const goalNumber = String(goal).padStart(2, '0');
  addNode(`blank_goal_${goalNumber}`, 'blank_annual', 'goal', `Goal ${goalNumber}`, {
    ...blankGoalData(),
    nav_prev_label: goal === 1 ? '« FUNDS' : `« GOAL ${String(goal - 1).padStart(2, '0')}`,
    nav_next_label: goal === CONFIG.goalCount ? 'YEAR REVIEW »' : `GOAL ${String(goal + 1).padStart(2, '0')} »`,
  });
}

addNode('blank_year_review', 'blank_annual', 'year_review', 'My Year Review', {
  subtitle: 'Look for patterns, acknowledge progress, and choose what continues.',
  review_lens_income: 'Income', planned_income: '', actual_income: '',
  review_lens_spending: 'Core spending', planned_spending: '', actual_spending: '',
  review_lens_savings: 'Savings', planned_savings: '', actual_savings: '',
  review_lens_debt: 'Debt reduction', planned_debt: '', actual_debt: '',
  wins: '', lesson: '', reflection: '',
  nav_prev_label: `« GOAL ${String(CONFIG.goalCount).padStart(2, '0')}`,
  nav_next_label: '',
});

return { nodes, rootId: 'root' };
