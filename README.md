# Document & Cashflow Copilot Backend

Backend service for uploading and parsing invoices, storing them in SQLite, and returning cashflow summaries. Supports PDF/text extraction with optional OpenAI for invoice field extraction and AI cashflow summary.

## Requirements
- Node.js (recent LTS recommended)
- Optional: OpenAI access for AI extraction/summary

## Local setup
1) Install dependencies: `npm install`
2) Run in dev: `npm run dev`
3) Run in prod: `npm start`
4) Port: `PORT` env var is honored; defaults to `3002` if unset

## Environment variables
- `PORT`
- `OPENAI_API_KEY`

## Storage
- SQLite database: `data/cashflow.sqlite` (created automatically)
- Uploads directory: `uploads/` (created automatically)

## API summary
- `GET /health`
- `GET /api/invoices`
- `GET /api/cashflow-summary`
- `POST /api/invoices/:id/mark-paid`
- `POST /api/invoices/:id/archive`
- `PATCH /api/invoices/:id`
- `POST /api/upload-invoice` (multipart `file`, parses PDF/text, optional AI extraction)

## Troubleshooting
- Missing `OPENAI_API_KEY`: AI extraction/summary is skipped; endpoints return without AI content.
- File upload errors: ensure the `uploads/` directory is writable.
- SQLite “database is locked”: stop other processes using `data/cashflow.sqlite` or retry after current writes finish.

## Safety
- Do not commit secrets (e.g., `OPENAI_API_KEY`).
- Back up `data/cashflow.sqlite` before risky changes or schema experiments.
