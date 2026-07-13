const DEFAULT_CONFIG = { categoryCount: 6, recipesPerCategory: 8, mealPlanWeeks: 12 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  categoryCount: [1, 8],
  recipesPerCategory: [1, 16],
  mealPlanWeeks: [1, 52],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Seasonal Kitchen config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});

const nodes = {};
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Seasonal Kitchen node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Seasonal Kitchen template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (options.referenceId) nodes[id].referenceId = options.referenceId;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Seasonal Kitchen parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};

const recipeData = (values = {}) => ({
  subtitle: 'A calm page for ingredients, method, and what to change next time.',
  menu_label: '',
  fictional_notice: '',
  yield: '',
  prep: '',
  cook: '',
  difficulty: '',
  ingredients: '',
  ingredient_requirements: [],
  method: '',
  notes: '',
  repeat_rating: '',
  ...values,
});

const weekData = (weekNumber, values = {}) => {
  const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const data = {
    subtitle: `Week ${String(weekNumber).padStart(2, '0')} | Choose meals, reuse ingredients, and make leftovers deliberate.`,
    week_number: weekNumber,
    recipe_ids: [],
    prep_note: '',
  };
  weekdays.forEach((day, index) => {
    const row = index + 1;
    data[`day_${row}`] = day;
    data[`breakfast_${row}`] = '';
    data[`lunch_${row}`] = '';
    data[`dinner_${row}`] = '';
  });
  return { ...data, ...values };
};

const shoppingData = (planId, values = {}) => {
  const data = {
    subtitle: 'One list grouped by how the shop is arranged.',
    plan_id: planId,
    list_note: '',
  };
  ['produce', 'pantry', 'chilled', 'bakery', 'household'].forEach(category => {
    for (let item = 1; item <= 3; item += 1) data[`${category}_${item}`] = '';
  });
  return { ...data, ...values };
};

const pantryData = (values = {}) => {
  const data = {
    subtitle: 'Scan what is open, frozen, or ready to use before making a list.',
    pantry_note: '',
  };
  for (let row = 1; row <= 6; row += 1) {
    data[`staple_${row}`] = '';
    data[`freezer_${row}`] = '';
    data[`use_first_${row}`] = '';
  }
  return { ...data, ...values };
};

addNode('root', null, 'cover', 'Seasonal Kitchen', {});
addNode('start_here', 'root', 'start', 'Start Here', {
  example_label: 'START HERE',
  skip_label: 'Skip to blank workspace →',
  subtitle: 'Set up the kitchen once, then move from inspiration to one useful list.',
});

addNode('example_workspace', 'start_here', 'workspace', 'An Autumn Table', {
  subtitle: 'A fictional week showing the complete recipe-to-shopping workflow.',
  workspace_mode: 'GUIDED AUTUMN WORKSPACE',
  hero: 'Three recipes share squash, herbs, greens, and a practical plan for leftovers.',
  workspace_note: 'All recipes, names, timings, and quantities in this branch are fictional teaching examples.',
}, { example: true });

addNode('example_season_index', 'example_workspace', 'season_index', 'Autumn Recipe Index', {
  subtitle: 'Start with what is abundant, then cook across categories.',
  index_note: 'Open the autumn supper shelf to see three linked fictional recipes.',
}, { example: true });
addNode('example_category_autumn', 'example_season_index', 'category', 'Autumn Suppers', {
  subtitle: 'Three fictional recipes designed to overlap without tasting repetitive.',
  category_note: 'Roast once, carry herbs forward, and reserve one easy sweet finish.',
}, { example: true });

addNode('example_recipe_squash', 'example_category_autumn', 'recipe', 'Charred Squash & Barley Bowls', recipeData({
  subtitle: 'A fictional grain bowl with sharp greens and toasted seeds.',
  menu_label: 'Squash + barley',
  fictional_notice: 'Fictional recipe example - verify ingredients and cooking times for your kitchen.',
  yield: '4 bowls',
  prep: '20 min',
  cook: '42 min',
  difficulty: 'Easy',
  ingredients: '1 small amber squash\n250 g pearl barley\n2 handfuls bitter greens\n80 g pumpkin seeds\n1 lemon\n30 ml olive oil\n1 tsp salt\n1/2 tsp pepper',
  ingredient_requirements: [
    { ingredient: 'amber squash', needed: '1 small', source: 'shopping', field: 'produce_1' },
    { ingredient: 'pearl barley', needed: '250 g', source: 'shopping', field: 'pantry_1' },
    { ingredient: 'bitter greens', needed: '2 handfuls', source: 'pantry', field: 'use_first_3' },
    { ingredient: 'pumpkin seeds', needed: '80 g', source: 'pantry', field: 'staple_4' },
    { ingredient: 'lemon', needed: '1', source: 'pantry', field: 'use_first_4' },
    { ingredient: 'olive oil', needed: '30 ml', source: 'pantry', field: 'staple_1' },
    { ingredient: 'salt', needed: '1 tsp', source: 'pantry', field: 'staple_2' },
    { ingredient: 'pepper', needed: '1/2 tsp', source: 'pantry', field: 'staple_2' },
  ],
  method: '1. Roast squash wedges until browned.\n2. Simmer barley until tender; drain well.\n3. Wilt greens in the warm pan.\n4. Layer barley, squash, greens, and seeds.\n5. Finish with lemon and olive oil.',
  notes: 'Roast extra squash for Thursday orzo. Keep barley and dressing separate for lunches.',
  repeat_rating: '4 / 5\nRepeat in late autumn',
}), { example: true });

addNode('example_recipe_orzo', 'example_category_autumn', 'recipe', 'Tomato-Sage Orzo Bake', recipeData({
  subtitle: 'A fictional one-dish bake using reserved roast squash.',
  menu_label: 'Tomato-sage orzo',
  fictional_notice: 'Fictional recipe example - verify ingredients and cooking times for your kitchen.',
  yield: '4 portions',
  prep: '15 min',
  cook: '35 min',
  difficulty: 'Easy',
  ingredients: '300 g orzo\n400 g crushed tomatoes\nAmber squash reserved from 1 small squash\n120 g feta\nSage / 8 leaves\n700 ml vegetable stock\n15 ml olive oil\n1 tsp salt\n1/2 tsp pepper',
  ingredient_requirements: [
    { ingredient: 'orzo', needed: '300 g', source: 'shopping', field: 'pantry_2' },
    { ingredient: 'crushed tomatoes', needed: '400 g', source: 'shopping', field: 'pantry_3' },
    { ingredient: 'amber squash', needed: 'reserved from 1 small squash', source: 'shopping', field: 'produce_1' },
    { ingredient: 'feta', needed: '120 g', source: 'shopping', field: 'chilled_1' },
    { ingredient: 'sage', needed: '8 leaves', source: 'shopping', field: 'produce_3' },
    { ingredient: 'vegetable stock', needed: '700 ml', source: 'pantry', field: 'freezer_1' },
    { ingredient: 'olive oil', needed: '15 ml', source: 'pantry', field: 'staple_1' },
    { ingredient: 'salt', needed: '1 tsp', source: 'pantry', field: 'staple_2' },
    { ingredient: 'pepper', needed: '1/2 tsp', source: 'pantry', field: 'staple_2' },
  ],
  method: '1. Stir orzo, tomatoes, stock, and chopped sage in a baking dish.\n2. Fold in roast squash.\n3. Bake until the orzo is tender.\n4. Crumble feta over the top and brown briefly.\n5. Rest before serving.',
  notes: 'Add stock only as needed near the end. Pack two portions before serving for Friday lunch.',
  repeat_rating: '5 / 5\nKeep in rotation',
}), { example: true });

addNode('example_recipe_crumble', 'example_category_autumn', 'recipe', 'Pear, Oat & Thyme Crumble', recipeData({
  subtitle: 'A fictional not-too-sweet bake for the end of the week.',
  menu_label: 'Pear oat crumble',
  fictional_notice: 'Fictional recipe example - verify ingredients and cooking times for your kitchen.',
  yield: '6 servings',
  prep: '18 min',
  cook: '32 min',
  difficulty: 'Easy',
  ingredients: '5 ripe pears\n120 g rolled oats\n80 g plain flour\n70 g butter\n55 g brown sugar\nThyme / 4 sprigs\n1 lemon',
  ingredient_requirements: [
    { ingredient: 'ripe pears', needed: '5', source: 'shopping', field: 'produce_2' },
    { ingredient: 'rolled oats', needed: '120 g', source: 'shopping', field: 'pantry_3' },
    { ingredient: 'plain flour', needed: '80 g', source: 'shopping', field: 'pantry_3' },
    { ingredient: 'butter', needed: '70 g', source: 'shopping', field: 'chilled_2' },
    { ingredient: 'brown sugar', needed: '55 g', source: 'pantry', field: 'staple_3' },
    { ingredient: 'thyme', needed: '4 sprigs', source: 'shopping', field: 'produce_3' },
    { ingredient: 'lemon', needed: '1', source: 'pantry', field: 'use_first_4' },
  ],
  method: '1. Slice pears and toss with lemon and thyme.\n2. Rub butter into flour, oats, and sugar.\n3. Scatter topping over pears.\n4. Bake until bubbling and deeply golden.\n5. Cool for ten minutes before serving.',
  notes: 'Assemble after Saturday breakfast. Reheat uncovered so the topping stays crisp.',
  repeat_rating: '4 / 5\nTry with apples next',
}), { example: true });

addNode('example_meal_plan', 'example_workspace', 'meal_plan', 'Autumn Week Meal Plan', weekData(1, {
  subtitle: 'Fictional autumn week | Three recipes, planned leftovers, one combined list.',
  recipe_ids: ['example_recipe_squash', 'example_recipe_orzo', 'example_recipe_crumble'],
  breakfast_1: 'Oats + pear', lunch_1: 'Soup + loaf', dinner_1: 'Squash barley bowls',
  breakfast_2: 'Toast + fruit', lunch_2: 'Barley bowl leftovers', dinner_2: 'Herb omelette',
  breakfast_3: 'Yogurt + oats', lunch_3: 'Greens + feta toast', dinner_3: 'Tomato-sage orzo bake',
  breakfast_4: 'Toast + pear', lunch_4: 'Orzo leftovers', dinner_4: 'Pantry bean soup',
  breakfast_5: 'Oats + yogurt', lunch_5: 'Orzo leftovers', dinner_5: 'Squash bowl remix',
  breakfast_6: 'Eggs + loaf', lunch_6: 'Soup + greens', dinner_6: 'Simple roast tray',
  breakfast_7: 'Crumble + yogurt', lunch_7: 'Leftover roast tray', dinner_7: 'Pear crumble + light supper',
  prep_note: 'Monday: roast all squash and cook barley. Wednesday: assemble orzo. Saturday: bake crumble.',
}), { example: true });
addNode('example_shopping', 'example_meal_plan', 'shopping', 'Combined Autumn Shopping List', shoppingData('example_meal_plan', {
  subtitle: 'Fictional combined list | Quantities support the three example recipes and planned leftovers.',
  produce_1: 'Amber squash / 1 small', produce_2: 'Ripe pears / 5', produce_3: 'Sage / 8 leaves\nThyme / 4 sprigs',
  pantry_1: 'Pearl barley / 250 g', pantry_2: 'Orzo / 300 g', pantry_3: 'Crushed tomatoes / 400 g\nRolled oats / 120 g\nPlain flour / 80 g',
  chilled_1: 'Feta / 120 g', chilled_2: 'Butter / 70 g', chilled_3: 'Eggs / 6',
  bakery_1: 'Country loaf / 1', bakery_2: 'Flatbreads / 1 pack (optional)', bakery_3: '',
  household_1: 'No items needed', household_2: '', household_3: '',
  list_note: 'Pantry check covers stock, greens, lemons, oil, salt, pepper, sugar, seeds, and yogurt.',
}), { example: true });

[
  ['example_plan_recipe_squash', 'example_recipe_squash'],
  ['example_plan_recipe_orzo', 'example_recipe_orzo'],
  ['example_plan_recipe_crumble', 'example_recipe_crumble'],
].forEach(([id, referenceId]) => {
  addNode(id, 'example_meal_plan', 'recipe', nodes[referenceId].title, {}, { example: true, referenceId });
});

addNode('example_pantry', 'example_workspace', 'pantry', 'Autumn Pantry Check', pantryData({
  subtitle: 'Fictional pantry scan completed before building the combined list.',
  staple_1: 'Olive oil / 500 ml', freezer_1: 'Vegetable stock / 1 L', use_first_1: 'Country loaf / half',
  staple_2: 'Salt / 200 g; pepper / 50 g', freezer_2: 'Cooked beans / 2 cups', use_first_2: 'Yogurt / 350 g',
  staple_3: 'Brown sugar / 200 g', freezer_3: 'Herb stems / 1 bag', use_first_3: 'Bitter greens / 2 handfuls',
  staple_4: 'Pumpkin seeds / 100 g', freezer_4: '', use_first_4: 'Lemons / 2',
  staple_5: '', freezer_5: '', use_first_5: '',
  staple_6: '', freezer_6: '', use_first_6: '',
  pantry_note: 'Use the open yogurt with breakfasts and Sunday crumble; no extra jar needed.',
}), { example: true });

addNode('blank_workspace', 'start_here', 'workspace', 'My Seasonal Kitchen', {
  example_label: '',
  skip_label: '',
  subtitle: 'Clean recipe banks, planning weeks, pantry inventory, and grouped lists.',
  workspace_mode: 'BLANK WORKSPACE',
  hero: 'Build a kitchen record around what you actually cook and want to repeat.',
  workspace_note: `${CONFIG.categoryCount} categories / ${CONFIG.recipesPerCategory} recipes each / ${CONFIG.mealPlanWeeks} planning weeks`,
});

addNode('blank_recipe_index', 'blank_workspace', 'season_index', 'My Recipe Library', {
  subtitle: 'Use categories for seasons, meal types, methods, or any structure that feels natural.',
  index_note: `${CONFIG.categoryCount} clean category banks / ${CONFIG.categoryCount * CONFIG.recipesPerCategory} recipe pages`,
});

const categoryNames = ['Early Season', 'High Summer', 'Autumn Table', 'Winter Pantry', 'Fast Suppers', 'Bakes & Sweets', 'Weekend Cooking', 'Preserves & Extras'];
const blankRecipeIds = [];

for (let category = 1; category <= CONFIG.categoryCount; category += 1) {
  const categoryNumber = String(category).padStart(2, '0');
  const categoryId = `blank_category_${categoryNumber}`;
  addNode(categoryId, 'blank_recipe_index', 'category', categoryNames[category - 1], {
    subtitle: `Category ${categoryNumber} | A clean bank of ${CONFIG.recipesPerCategory} recipe pages.`,
    category_note: 'Rename this shelf, then capture recipes in the order you want to browse them.',
  });

  for (let recipe = 1; recipe <= CONFIG.recipesPerCategory; recipe += 1) {
    const recipeNumber = String(recipe).padStart(2, '0');
    const recipeId = `blank_recipe_${categoryNumber}_${recipeNumber}`;
    addNode(recipeId, categoryId, 'recipe', `${categoryNames[category - 1]} Recipe ${recipeNumber}`, recipeData({
      menu_label: `Recipe ${recipeNumber}`,
    }));
    blankRecipeIds.push(recipeId);
  }
}

const PLAN_INDEX_SIZE = 13;
const planIds = [];
const planIndexCount = Math.ceil(CONFIG.mealPlanWeeks / PLAN_INDEX_SIZE);
for (let index = 1; index <= planIndexCount; index += 1) {
  const indexNumber = String(index).padStart(2, '0');
  const firstWeek = (index - 1) * PLAN_INDEX_SIZE + 1;
  const lastWeek = Math.min(index * PLAN_INDEX_SIZE, CONFIG.mealPlanWeeks);
  const planIndexId = `blank_plan_index_${indexNumber}`;
  addNode(planIndexId, 'blank_workspace', 'season_index', `Meal Plans ${String(firstWeek).padStart(2, '0')}-${String(lastWeek).padStart(2, '0')}`, {
    subtitle: 'Open any week, choose linked recipes, then write one grouped shopping list.',
    index_note: `Weeks ${firstWeek}-${lastWeek} / Every plan opens its own combined list and linked recipes.`,
  });

  for (let week = firstWeek; week <= lastWeek; week += 1) {
    const weekNumber = String(week).padStart(2, '0');
    const planId = `blank_meal_plan_${weekNumber}`;
    addNode(planId, planIndexId, 'meal_plan', `Meal Plan / Week ${weekNumber}`, weekData(week));
    addNode(`blank_shopping_${weekNumber}`, planId, 'shopping', `Shopping List / Week ${weekNumber}`, shoppingData(planId));
    planIds.push(planId);
  }
}

const recipesByPlan = planIds.map((_, planIndex) => [blankRecipeIds[planIndex % blankRecipeIds.length]]);
blankRecipeIds.forEach((recipeId, recipeIndex) => {
  const assigned = recipesByPlan[recipeIndex % planIds.length];
  if (!assigned.includes(recipeId)) assigned.push(recipeId);
});

planIds.forEach((planId, planIndex) => {
  const recipeIds = recipesByPlan[planIndex];
  nodes[planId].data.recipe_ids = [...recipeIds];
  recipeIds.forEach((recipeId, recipeIndex) => {
    const weekNumber = String(planIndex + 1).padStart(2, '0');
    const referenceNumber = String(recipeIndex + 1).padStart(3, '0');
    addNode(`blank_plan_${weekNumber}_recipe_ref_${referenceNumber}`, planId, 'recipe', nodes[recipeId].title, {}, { referenceId: recipeId });
  });
});

addNode('blank_pantry', 'blank_workspace', 'pantry', 'My Pantry Inventory', pantryData());

return { nodes, rootId: 'root' };
