# AGENTS.md

## Repository Architecture: Sovereign Gateway & Parametric Engine

This repository has been migrated from a folder-based structure (`cbse/class-X`) to a unified Single Page Application (SPA) style architecture (`app/`).

### Core Directories
- `app/`: Contains the generalized HTML views.
    - `class-hub.html`: Landing page for a specific grade.
    - `curriculum.html`: Chapter selection.
    - `quiz-engine.html`: The quiz interface.
    - `consoles/`: Persona-based dashboards (`student.html`, `teacher.html`, etc.).
    - `review.html`: Mistake Notebook.
- `js/`: Centralized logic.
    - `auth-paywall.js`: Sovereign Identity & Routing.
    - `api.js`: Tenant-scoped Data Access & Scoring.
    - `quiz-engine.js`: The unified quiz controller.
    - `curriculum/`: JSON data and `loader.js`.

### Key Protocols
1.  **Routing:** All routing is handled by `routeUser` in `js/auth-paywall.js`. Do not hardcode links to `cbse/` folders. Use `app/`.
2.  **Fortress Philosophy:** Remediation loops are enforced. Mistakes are saved to `mistake_notebook`.
3.  **Zero Regression:** Legacy `cbse/` folders are preserved but deprecated. New development must happen in `app/` and `js/`.

### Android Packaging
All paths in `app/` must be relative (`../js/`) to support `file://` protocol. Do not use absolute paths like `/js/`.
