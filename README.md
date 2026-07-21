# CRM - Lead Tracker

A simple CRM for tracking customer leads from first contact through document
approval/rejection, with follow-up scheduling and a call log per lead.

## Stack
- **Server**: Node.js + Express + built-in `node:sqlite` (no external DB needed), JWT auth, bcrypt password hashing.
- **Client**: React + Vite, plain CSS.

## Lead lifecycle (stages)
`New Lead → Follow-up in Progress → Ready - Documents Requested → Documents Received → File Logged → Approved / Rejected`

Every stage change is timestamped and recorded in a Stage History log (who changed it, when, old → new stage, optional remarks). Any stage can be set at any time (e.g. Rejected can happen from any point).

## First-time setup

```
cd server
npm install
npm start          # runs on http://localhost:4000, creates data/crm.db and seeds an admin user
```

```
cd client
npm install
npm run dev         # runs on http://localhost:5173 (proxies /api to the server)
```

Open http://localhost:5173 in your browser.

**Default admin login** (change the password after first login, or edit `server/.env` before first run):
- Email: `admin@crm.local`
- Password: `admin123`

## What you can do
- **Executives (Team) tab** (admin only): create login accounts for each call executive.
- **New Lead**: upload a customer's details (name, phone, email, address, source, Assigned To, Handling By). Phone numbers must be unique — duplicates are rejected with a clear error naming the existing lead.
- **Lead detail page**:
  - **Assigned To / Handling By**: two independent, editable owner fields — who the lead is assigned to vs. who is currently handling it — changeable any time from the lead header.
  - **Stage picker**: click any stage to move the lead there; you'll be prompted for optional remarks, and the change is logged with a timestamp.
  - **Follow-ups tab**: add any number of follow-up dates + notes; mark them done as you complete them. The dashboard's "Upcoming / Overdue Follow-ups" widget surfaces anything pending.
  - **Call Log tab**: log each call an executive makes and what the customer said.
  - **Remarks tab**: add a new remark any time — each one is its own timestamped entry (nothing gets overwritten), so you get a running log of notes on the lead.
  - **Stage History tab**: full audit trail of every stage change with who/when/why.
- **Dashboard**: counts per stage (click a tile to filter), filter by stage and by "Assigned To" executive, search by name/phone/email, upcoming follow-ups, and a **Download Excel** button that exports the currently filtered list (Name, Phone, Source, Stage, Assigned To, Handling By, dates, notes, etc.) as a real `.xlsx` file.

## Notes
- Database file lives at `server/data/crm.db` (SQLite). Back it up by copying that file.
- JWT secret and admin seed credentials are in `server/.env` — change `JWT_SECRET` before using this for anything beyond local/internal use.
- Duplicate-phone enforcement runs at the application level on every create/update, so it works even if your existing data already has a few old duplicates (those aren't touched or blocked from further edits — only *new* duplicate phone numbers are rejected).
