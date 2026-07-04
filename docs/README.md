# PDF Architect: Project Documentation

Welcome to the PDF Architect documentation. This guide serves as a comprehensive reference for the architecture, data models, state management, and core features of the PDF Architect application.

For ease of reading, the documentation is split into specialized deep-dives.

## 📚 Table of Contents

1.  **[High-Level Architecture](1-high-level-architecture.md)**
    *   Tech Stack Deep Dive
    *   Application Entry Points and Routing
    *   Project Workspace Initialization

2.  **[Core Data Models](2-core-data-models.md)**
    *   `AppNode` (The Data & Structure)
    *   `TemplateElement` & `PageTemplate` (The Visual Components)
    *   `Variant` (Multi-Device Support)
    *   `AppState` (The Global Truth)

3.  **[State Management](3-state-management.md)**
    *   Project Contexts vs Global State
    *   Undo/Redo History System
    *   Migration System & Auto-Save

4.  **[Canvas Render Engine](4-canvas-render-engine.md)**
    *   Zoom and Pan Mechanics
    *   The Interaction Loop
    *   Group Transformations (Rotation/Resizing Math)
    *   Dynamic Grid Rendering Strategies

5.  **[PDF Generation Engine](5-pdf-generation.md)**
    *   Structure Linearization 
    *   Font Loading Lifecycle (Virtual Filesystem via jsPDF)
    *   Drawing Primitives
    *   Link Decoration

6.  **[Advanced Features](6-advanced-features.md)**
    *   Smart Contextual Linking (`sibling`, `child_referrer`, etc.)
    *   Automation Scripting (Hierarchy Generator)
    *   Grid Traversal Paths

7.  **[Developer Guide](7-developer-guide.md)**
    *   Adding a New Element Type
    *   Adding a New Link Target Type
    *   Modifying Application State & Migrations
    *   Debugging Tips

8.  **[Cloud, Gallery & Merge Requests](8-cloud-and-gallery.md)**
    *   Local-First + Explicit Sync Model
    *   Publishing, Forking, and the Public Gallery
    *   Merge Request Lifecycle & Conflict Rules
    *   API Surface, Environment Variables & Security Model

## 🧩 Component Deep Dives

To understand the React architectural layer, review the following component breakdowns:

*   **[ProjectEditor](components/ProjectEditor.md)**: The central brain and state manager.
*   **[Canvas](components/Canvas.md)**: The interactive 2D surface and event engine.
*   **[CanvasElement](components/CanvasElement.md)**: The visual primitive rendering logic.
*   **[Sidebar](components/Sidebar.md)**: The hierarchy and template structural view.
*   **[PropertiesPanel](components/PropertiesPanel.md)**: The contextual inspector and multi-editor.
*   **[EditorToolbar](components/EditorToolbar.md)**: The global tools and quick-actions menu.
*   **[Modals](components/Modals.md)**: The sandboxed environments (Generators, JSON Inspection).
