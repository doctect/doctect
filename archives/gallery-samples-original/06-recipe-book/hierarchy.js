// Recipe Book + Meal Planner — HIERARCHY SCRIPT
// A recipe bank (categories > recipes), a weekly meal plan, and shopping lists.
// The week pages carry a right-edge tab strip that jumps to any recipe category, so you can
// navigate from meal planning to any recipe. Rename everything in the tree.
//
// KEEP `categories` IDENTICAL to the list in templates.js — the week tabs link to each
// category by the same slug id computed here.
const categories = ["Breakfast", "Mains", "Sides", "Salads", "Desserts", "Drinks"];
const catId = (name) => "cat_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const recipesPerCategory = 8;
const numWeeks = 8;
const numShoppingLists = 8;

const nodes = {};
const rootId = "root";

nodes[rootId] = {
  id: rootId, parentId: null, type: "cover",
  title: "Recipe Book", data: { subtitle: "recipes · meal plans · shopping" }, children: []
};

const contentsId = "contents";
nodes[contentsId] = {
  id: contentsId, parentId: rootId, type: "hub",
  title: "My Kitchen", data: {}, children: []
};
nodes[rootId].children.push(contentsId);

const section = (id, title) => {
  nodes[id] = { id: id, parentId: contentsId, type: "section", title: title, data: {}, children: [] };
  nodes[contentsId].children.push(id);
};
section("recipes", "Recipes");
section("mealplan", "Meal Plan");
section("shopping", "Shopping Lists");

// Recipes: categories (fixed slug ids so the week tabs can target them) > recipe pages
let recipeN = 1;
categories.forEach((cat) => {
  const cId = catId(cat);
  nodes[cId] = { id: cId, parentId: "recipes", type: "section", title: cat, data: {}, children: [] };
  nodes["recipes"].children.push(cId);
  for (let r = 1; r <= recipesPerCategory; r++) {
    const rId = createId("recipe");
    nodes[rId] = { id: rId, parentId: cId, type: "recipe", title: "Recipe " + recipeN++, data: {}, children: [] };
    nodes[cId].children.push(rId);
  }
});

// Meal plan: weeks (recipe navigation is via the tab strip, not per-week links)
for (let w = 1; w <= numWeeks; w++) {
  const wId = createId("week");
  nodes[wId] = { id: wId, parentId: "mealplan", type: "week", title: "Week " + w, data: {}, children: [] };
  nodes["mealplan"].children.push(wId);
}

// Shopping lists
for (let s = 1; s <= numShoppingLists; s++) {
  const sId = createId("list");
  nodes[sId] = { id: sId, parentId: "shopping", type: "shopping", title: "List " + s, data: {}, children: [] };
  nodes["shopping"].children.push(sId);
}

return { nodes, rootId };
