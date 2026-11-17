# UTEP-EMR

Educational Electronic Medical Record (EMR) prototype built with **Supabase**, **FastAPI (Python)**, and **React**.

---

## Repository Structure

```text
UTEP-EMR/
├── backend/            # FastAPI Python backend
│   ├── app/
│   │   ├── main.py     # Application entrypoint
│   │   └── __init__.py
│   └── requirements.txt
│
├── frontend/           # React frontend (Vite)
│   ├── src/
│   │   ├── pages/      # React components for pages (e.g., Login, Dashboard)
│   │   ├── services/   # Supabase auth and API services
│   │   ├── App.jsx     # App root component
│   │   ├── index.jsx   # Entrypoint
│   │   ├── supabase.js # Supabase client initialization
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.js  # Vite configuration
│   └── package.json
│
├── supabase/           # Supabase database configuration & migrations
│   ├── config.toml
│   ├── migrations/
│   └── tests/
│
├── docs/               # Project documentation
│   ├── ARCHITECTURE.md
│   └── DESIGN_DECISIONS.md
│
├── .env.example        # Root environment template
└── .gitignore
```

---

## Quickstart

Install Node.js 22.20 or newer and install the frontend dependencies with `npm --prefix frontend ci`. Copy `.env.shared.example` to `.env.shared.local` and enter the shared project's public URL and publishable/anon key. From the repository root, run:

```bash
npm run dev
```

This starts the frontend against the **shared online Supabase project**. Open the address printed by Vite (usually `http://localhost:5173/`). The frontend runs on your computer, while accounts and records come from the shared project. Docker is not needed. This command does not create accounts or apply shared database migrations.

For an isolated local database, start Docker Desktop and run `npm run dev:local`. That command applies local migrations, serves local Edge Functions, and creates a local admin if needed. Local accounts and records are separate from the shared project. Press Ctrl+C to stop the frontend. Stop local Docker services with `npx supabase@2.113.0 stop` when no longer needed.

### Optional FastAPI backend

The current React app talks directly to Supabase; FastAPI is not needed to try student management. To run the separate backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Interactive API docs will be at `http://127.0.0.1:8000/docs`.

---

## Branching Strategy

- **`main`**: Production / release branch.
- **`develop`**: Primary integration branch for active development.
- **`feature/<name>`**: Feature branches cut from `develop` and merged via Pull Request.
## Local Test Data

`npm run dev:local` creates an admin on a fresh local database, but does not add patients or reset existing records. The older `frontend/seed.cjs` script is not part of this setup and may not match the current database schema.

## Verification

Use Node.js 22.20 or newer for the tests. From the repository root:

```bash
npm ci
npm --prefix frontend ci
npm test
npm run test:ui
npm --prefix frontend run build
```

The browser checks use Microsoft Edge on Windows. On other platforms, install the Playwright Chromium browser with `npx playwright install chromium`. `PLAYWRIGHT_CHANNEL` can select another installed browser channel. Tests use an in-memory PostgreSQL engine and intercepted test API responses; they do not connect to a live Supabase project. Browser screenshots are written to `.cache/verification/`.
