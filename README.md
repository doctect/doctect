# PDF Architect

**PDF Architect** is a powerful, visual web application designed to build complex, hyperlinked PDF documents. It is specifically engineered for creating **Digital Planners, Interactive Notebooks, and e-Ink Tablet documents** (reMarkable, Boox, Supernote, iPad) without manually designing hundreds of individual pages.

> **Core Philosophy:** Separate **Structure** (Nodes) from **Design** (Templates). Define a "Day View" template once, and apply it to 365 nodes instantly.

---

## ✨ Key Features

### 🎨 Visual Template Editor
*   **Canvas**: Drag-and-drop interface with alignment snapping and grid support.
*   **Elements**: Rectangles, Ellipses, Triangles, Lines, Text, and **Dynamic Grids**.
*   **Styling**: Full control over stroke, fill, opacity, patterns (dots/lines), and typography.
*   **Google Fonts**: Integrated support for handwriting fonts (Caveat, Dancing Script, Patrick Hand) and serifs (Merriweather, Playfair).

### 🌳 Hierarchical Structure
*   **Node System**: Pages are organized in a tree structure (Year -> Quarter -> Month -> Week -> Day).
*   **Inheritance**: Child nodes inherit context from parents, allowing for smart navigation.
*   **References**: Create "pointers" to other nodes. For example, a "Week View" can contain references to 7 existing "Day" nodes, allowing you to link directly to them without duplicating data.

### 🔗 Smart, Context-Aware Linking
Stop manually wiring links. PDF Architect calculates links dynamically based on the hierarchy:
*   **Parent/Ancestor**: Link to the containing folder or a specific level up.
*   **Sibling**: Link to "Next Day" or "Previous Page" automatically.
*   **Child Index**: Link to the "1st Child" (e.g., January) of a node.
*   **Referrer**: Link back to the page that referenced the current page.

### 📅 Dynamic Data Grids
The most powerful tool for planner creation.
*   **Auto-Population**: Grids automatically render children of a node.
*   **Traversals**: A grid on a "Year" page can drill down: `Quarters -> Months`.
*   **Calculated Offsets**: Create accurate monthly calendars by offsetting the start based on the day of the week (e.g., skip 3 cells if the 1st is a Wednesday).

### ⚡ Automation & Scripting
*   **Hierarchy Generator**: Use JavaScript to programmatically generate thousands of nodes and templates in seconds.
*   **JSON Inspector**: Full read/write access to the application state for power users and debugging.
*   **Presets**: Includes a full **2026 Daily Planner** (with Year, Quarter, Month, Week, Day views) and simple Notebook layouts.

### 📄 Client-Side Export
*   Generates optimized PDFs directly in the browser using `jsPDF`.
*   Supports custom page sizes (A4, A5, reMarkable Paper Pro, Boox Note Air, etc.).

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   npm or yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/pdf-architect.git
    cd pdf-architect
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the development server:
    ```bash
    npm start
    ```

---

## 📖 Usage Guide

### 1. The Concepts

*   **Nodes**: A Node is a page (or a container) in your PDF. It has a **Title** and **Data Fields** (key-value pairs like `day_name: Monday`).
*   **Templates**: A Template defines how a Node looks. You assign a Template (e.g., "Day View") to a Node.
*   **Data Binding**: In a template, use `{{title}}` or `{{my_custom_field}}` in a Text element. When the PDF generates, it swaps that tag with the data from the specific Node being rendered.

### 2. Working with Grids

Grids are used to create calendars, indices, and lists.

1.  **Add a Grid** to your template.
2.  **Set Source**:
    *   `Current`: The grid items will be the children of the page being rendered.
    *   `Specific`: The grid items will be the children of a specific node ID (good for global navigation bars).
3.  **Display Field**: What text to show in the cell? e.g., `{{day_num}}`.
4.  **Traversal** (Advanced): If you are on a "Year" page, but want to show "Months", you might need to traverse down the tree if your structure is `Year -> Quarter -> Month`.

### 3. Smart Linking Types

| Link Target | Behavior |
| :--- | :--- |
| **Parent** | Links to the parent node. (Good for "Back" buttons). |
| **Sibling** | Links to `Current Index + N`. Use `1` for Next, `-1` for Previous. |
| **Child Index** | Links to the Nth child (0-based). |
| **Child Referrer** | *Advanced*. Finds a node that *references* the current node as a child and links to it. Essential for linking a "Day" page back to its "Week" view. |
| **Specific Node** | Hard link to a specific UUID (e.g., "Index Page"). |

### 4. Hierarchy Scripting

Open the **Generator** (Wand icon) to script your planner.

**Stage 1: Define Templates**
Return an object where keys are Template IDs.
```javascript
const t = {};
t.day = { id: 'day', width: 500, height: 700, elements: [...] };
return t;
```

**Stage 2: Build Hierarchy**
Return `nodes` object and `rootId`.
```javascript
const nodes = {};
const rootId = 'root';
// ... logic to loop 365 times and create nodes ...
return { nodes, rootId };
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `V` | Select Tool |
| `H` / `Space` | Hand (Pan) Tool |
| `T` | Text Tool |
| `R` | Rectangle Tool |
| `E` | Ellipse Tool |
| `L` | Line Tool |
| `G` | Grid Tool |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + Scroll` | Zoom |
| `Arrows` | Nudge Selection |
| `Shift + Arrows` | Fast Nudge |

---

## 🛠 Tech Stack

*   **Framework**: React 18+
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS
*   **Icons**: Lucide React
*   **PDF Generation**: jsPDF
*   **Routing**: React Router

---

## 📄 License

This project is open source. [MIT License](LICENSE).
