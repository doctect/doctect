# 1. High-Level Architecture

PDF Architect's core editor is a client-side web application. It relies heavily on the user's browser for processing, rendering, local persistence, and exporting. Projects stay on the device by default; the separate cloud service is used only after an explicit user action.

## Tech Stack Deep Dive

*   **React (Frontend Framework)**: Powers the entire UI component tree and reactivity.
*   **TypeScript (Language)**: Provides strict typing for the complex data models (`AppNode`, `TemplateElement`), reducing runtime errors.
*   **Tailwind CSS (Styling)**: Used for rapid UI development and ensuring a consistent design system.
*   **React Router (Routing)**: Manages navigation between the landing page, editor workspace, and documentation.
*   **lucide-react (Icons)**: Provides the consistent icon set used throughout the UI.
*   **jsPDF (PDF Generation)**: The core engine for exporting the visual canvas into a real PDF document. (See [PDF Generation](5-pdf-generation.md) for more details).
*   **IndexedDB (Local Persistence)**: `LocalWorkspaceStore` is the local document authority. Its six object stores - `projects`, `workspace`, `presets`, `pendingImports`, `migrationLedger`, and `legacyBackup` - separate document records from workspace metadata while allowing multi-record changes to commit atomically. (See [State Management](3-state-management.md)).

## Application Entry Points and Routing

The core of the application routing is defined in `App.tsx`.

It defines a `react-router-dom` data router with `createBrowserRouter()` and mounts it through `<RouterProvider>` to manage the following routes:

1.  **`/` (LandingPage.tsx)**: The marketing page.
2.  **`/app` (EditorPage.tsx)**: The main workspace. This is where users spend most of their time building planners. It initializes the `ProjectEditor` components.
3.  **`/docs` (DocsPage.tsx)**: The inline documentation and tutorial section.
4.  **`/login` (LoginPage.tsx)**: Handles user authentication using `better-auth`.
5.  **`/analytics` (AnalyticsDashboard.tsx)**: A protected route (wrapped in `<AuthGuard>`) showing usage statistics, accessible only to authenticated users.

## Project Workspace (`EditorPage.tsx`)

When navigating to `/app`, `WorkspaceBootstrapGate` mounts before `EditorPage`. The editor is rendered only after the gate receives a verified `ready` workspace, so unresolved migration, unavailable storage, or recovery state cannot create a competing blank project.

*   **Persistence Boundary**: `LocalWorkspaceStore` exposes only three methods: `bootstrap`, `commit`, and `exportRecoveryBundle`. UI code uses workspace snapshots and semantic commands without knowing IndexedDB transactions, object-store layout, migration ledgers, or recovery bundle formats.
*   **Authority Cutover**: IndexedDB becomes document authority only after the initial six-store copy commits atomically and an independent read-back verifies it. Legacy `localStorage` document keys are retained only as read-only inputs for migration and recovery. Epoch 1 has no cleanup, fallback, or dual-write path.
*   **Document Migration**: Project preparation performs source-shape validation first (including full `AppState` validation for schema v10/v11), then schema migration through `loadProjectState()` and `migrateState()`, final validation and normalization, and only then persistence. This keeps older document schemas compatible independently of the one-time storage-engine cutover.
*   **Tab Management**: `EditorPage` manages the `<TabBar>` from the verified workspace snapshot. Activation, creation, and closing are semantic store commands that update project order and the active project atomically.
*   **Delegation**: For the currently active project, it renders a `<ProjectEditor>` component, passing the `initialState` down. Hidden projects are kept mounted but hidden via CSS (`opacity-0 pointer-events-none`) to preserve their undo/redo history and state without unmounting and remounting.
