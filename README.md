# Keep Notes — a MERN notes app

A Google Keep-style notes app built on the MERN stack (MongoDB, Express, React,
Node.js), plus the four things Keep does not give you:

| | Google Keep | This app |
|---|---|---|
| Accounts | Google account | Own JWT auth, refresh-token rotation |
| Note formatting | plain text | **Markdown**, rendered and sanitised |
| Organising | labels | labels **and** tag-filtered views |
| History | none | **every version of every note, restorable** |

Everything Keep-shaped is here too: notes and checklists, eleven note colours,
pin, archive, a soft-delete trash, a masonry board, and search that filters as
you type.

<p align="center">
  <img src="docs/thumbnail.png" alt="The notes board" width="900">
</p>

---

## Run it

Node 20+. A database is optional — see below.

```bash
git clone https://github.com/muttaqi123/notes-app.git
cd notes-app
npm run install:all
npm run dev
```

That starts the API on `http://localhost:4000` and the client on
`http://localhost:5173`.

**About the database.** With `MONGODB_URI` unset, the server starts an
in-memory MongoDB on boot, so the app runs on a clean machine with nothing
installed. It is real MongoDB — indexes, validation, ObjectIds — but it is
wiped when the process stops. For a database that persists:

```bash
docker compose up -d      # a local mongo:7 on 27017
cp server/.env.example server/.env   # MONGODB_URI is already pointed at it
npm run seed              # demo@keepnotes.app / demo-password-123
```

## Test it

```bash
npm test
```

36 integration tests against an in-memory MongoDB — auth, CRUD, ownership,
labels and version history. No database to install, no fixtures to load.

---

## How it is put together

```
notes-app/
├── server/                    Express + Mongoose API
│   ├── src/
│   │   ├── app.js             builds the Express app (no listener, no DB)
│   │   ├── index.js           connects the DB and listens
│   │   ├── config/            env parsing, DB connection
│   │   ├── models/            User, Note, NoteVersion, Label
│   │   ├── services/          ALL BUSINESS LOGIC — no Express in here
│   │   ├── controllers/       three lines each: read, call a service, respond
│   │   ├── routes/            paths, auth, zod schemas
│   │   ├── middleware/        auth, validation, the one error handler
│   │   └── scripts/seed.js    a demo account worth screenshotting
│   └── tests/                 36 integration tests
└── client/                    React 18 + Vite + Tailwind
    └── src/
        ├── api/client.js      typed fetch wrapper, token refresh, retry
        ├── context/           auth state
        ├── hooks/useNotes.js  data + optimistic updates + instant search
        ├── components/        Shell, NoteCard, Composer, NoteEditor, …
        └── pages/             AuthPage, NotesPage
```

### The one rule the layout enforces

**Business logic lives in `server/src/services/` and imports nothing from
Express.** A service takes plain values and returns plain values. It never sees
a `Request`, never sets a status code, never builds a response.

That is what makes the tests direct, and it is the reason a second client — a
mobile app, a CLI, a bot — would need no logic rewritten. The controllers are
deliberately three lines each; if one ever grows an `if`, that `if` belongs in
a service.

### Version history, the part worth explaining

Every note carries a `version` number. On an edit that changes **content**, the
server writes a snapshot of the state *before* the edit into a separate
`noteversions` collection and increments the number.

Three decisions in that sentence:

- **A separate collection, not an array on the note.** Versions are written on
  every edit and read almost never. An array would make every note document
  grow without limit and slow down the list query, which is the hot path.
- **Content only.** Pinning, archiving or recolouring a note does not create a
  version. A history full of "you pinned this" entries is a history nobody
  reads.
- **Restoring is itself versioned.** Restoring v1 snapshots the current text
  first, so going back is never how you lose the newer draft.

The client saves on close rather than on every keystroke, so one editing
session is one version — a history a person can actually read.

### Security, briefly

- Passwords are bcrypt hashes at cost 12. The hash never leaves the server, in
  any response shape.
- The **access token** is a 15-minute JWT held in a JavaScript variable, not in
  `localStorage`. `localStorage` is readable by any script on the page, so a
  token there turns one XSS bug into a stolen session.
- The **refresh token** is a random opaque string in an `httpOnly` cookie —
  unreadable by JavaScript — stored server-side only as a SHA-256 hash, and
  **rotated on every use**. A stolen refresh token is good for one use, and the
  theft shows up as the real user being signed out.
- Every note query filters on `owner` **inside the query**, so there is no
  window where a note is loaded and only then found to belong to someone else.
  Cross-account access returns 404, not 403 — a 403 confirms the id exists.
- Rendered markdown goes through DOMPurify. Notes are user input rendered back
  as HTML; without a sanitiser, a note containing `<img onerror>` is stored XSS.
- Request bodies are validated by zod at the edge, so no unchecked shape ever
  reaches a service.
- Sign-in and registration are rate limited per IP.

---

## API

All note and label routes require `Authorization: Bearer <access token>`.

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/auth/register` | create an account, set the refresh cookie |
| `POST` | `/api/auth/login` | sign in |
| `POST` | `/api/auth/refresh` | rotate the refresh token, mint an access token |
| `POST` | `/api/auth/logout` | revoke this device's refresh token |
| `GET` | `/api/auth/me` | who is calling |
| `GET` | `/api/notes` | `?view=active\|archive\|trash&label=&q=` |
| `POST` | `/api/notes` | create |
| `GET` | `/api/notes/:id` | read one |
| `PATCH` | `/api/notes/:id` | edit — versions the note if content changed |
| `POST` | `/api/notes/:id/trash` | soft delete |
| `POST` | `/api/notes/:id/restore` | out of the trash |
| `DELETE` | `/api/notes/:id` | delete for good, with its history |
| `DELETE` | `/api/notes/trash` | empty the trash |
| `GET` | `/api/notes/:id/versions` | the history, newest first |
| `POST` | `/api/notes/:id/versions/:version/restore` | roll back |
| `GET` | `/api/notes/stats` | counts per view |
| `GET/POST/PATCH/DELETE` | `/api/labels[/:id]` | manage labels |
| `GET` | `/api/health` | liveness |

---

## Deploying

The API and the client deploy separately.

**API — Render (or any Node host).** Root directory `server`, build `npm ci`,
start `npm start`, health check `/api/health`. Set in the dashboard:

```
MONGODB_URI        the Atlas SRV string
JWT_ACCESS_SECRET  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_REFRESH_SECRET the same again, a different value
CORS_ORIGIN        the deployed client origin
NODE_ENV           production
```

`render.yaml` describes this, but note that a Blueprint file is only read for a
service *created from a Blueprint*. A service created by hand in the dashboard
ignores it — which is why `config/env.js` refuses to start in production
without real secrets rather than trusting the file.

**Database — MongoDB Atlas.** Free tier, region near your users, and add the
API's egress to Network Access.

**Client — Vercel / Netlify.** Root `client`, build `npm run build`, output
`dist`, and one variable:

```
VITE_API_URL=https://<your-api-host>
```

`vercel.json` rewrites every path to `index.html`, without which a refresh on
`/archive` is a 404 from the CDN rather than a route the router handles.

---

## Stack, and why

| Layer | Choice | Why this one |
|---|---|---|
| Runtime | Node 20, ES modules | `import` throughout, top-level `await`, no build step on the server |
| API | Express 4 | Small and explicit; the routing is the whole framework |
| DB | MongoDB + Mongoose 8 | Notes are documents — a note *is* one object with an array of items. Mongoose adds the schema and validation the raw driver leaves out |
| Auth | JWT + rotating refresh tokens | Stateless requests, and revocation that actually revokes |
| Validation | zod | One schema per route, at the edge |
| UI | React 18 + Vite | Fast dev server, and an explicit API boundary |
| Styling | Tailwind 3 | Keep is mostly cards and spacing; utilities are quicker than a stylesheet |
| Markdown | marked + DOMPurify | Parse, then sanitise — never one without the other |
| Tests | Jest + supertest + mongodb-memory-server | Real Mongo semantics with no database to install |

---

## The written walkthrough

**[docs/Keep-Notes-Walkthrough.pdf](docs/Keep-Notes-Walkthrough.pdf)** — twenty
pages covering what was built, what it was built with, how it was built, and the
reasoning behind every decision an interviewer is likely to ask about. Section 9
is twenty likely questions with answers.

`docs/` also holds the screenshots: the board, sign-in, the editor, search,
version history, and the mobile layout.

---

Built by **Muhammad Muttaqi**.
