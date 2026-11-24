# AVOM Backend

The single shared CommonJS Express API and MongoDB/Mongoose integration for both the public/student website and the staff administration application.

## Local development

```sh
npm install
cp .env.example .env
npm run dev
```

The API listens on port `5000`; its base path is `/api/v1` and `GET /api/v1/health` reports API and optional integration configuration. The server can start without `MONGODB_URI`, but database-backed features are then unavailable. Supply private credentials only in the backend environment, never in either frontend.

## Checks

```sh
npm test
npm run lint
npm run format:check
npm start
```

## Current scope

The full API is implemented (see [`docs/API.md`](docs/API.md), [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) and, importantly, [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) for how far it has been verified). Project rules for contributors and AI assistants are in [`Copilot.md`](Copilot.md).

```sh
npm install
cp .env.example .env     # mock values work for local development
npm run seed -- --demo   # first Super Admin + fictional demo programme
npm run dev
npm run test:logic       # runs without MongoDB
```

Emails are only printed to the console and storage is mocked until real keys are added to `.env`.
