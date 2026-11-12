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

The API health route, shared middleware, optional integration configuration, and database connection boundary are established. Authentication, academic workflows, media operations, payment processing, and scheduled deletion are not yet active. Full platform architecture, database design, API, authentication, deployment, environment, and roadmap documentation is in [`docs/`](docs/).
# AVOM_Backend
