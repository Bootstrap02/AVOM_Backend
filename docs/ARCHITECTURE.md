# Architecture

Three repositories, one shared API, one database.

```
AVOM_Frontend (user site)  ─┐
                            ├─►  AVOM_Backend  /api/v1  ─►  MongoDB Atlas
AVOM_Admin (staff site)    ─┘          │
                                       ├─►  Cloudinary (video, audio, images; direct browser uploads, signed by the API)
                                       ├─►  Resend (email)     ├─►  Paystack (giving)     └─►  WhatsApp Cloud API (support)
```

- **The backend owns every business rule** (`src/services`, especially `services/logic.js` for pure rules). The front ends only display and call the API.
- **Layers:** routes (permission checks) → controllers (thin) → services (rules) → models. Integrations (`src/integrations`) hide third parties; storage is a swappable provider (`cloudinary`, `mock`).
- **Two audiences:** student and staff tokens are separate; the API rejects the wrong one. Refresh tokens are HTTP-only cookies with rotation and replay detection.
- **Settings, not constants:** expiry periods, pass marks, attempt limits, pause/move thresholds and the student-number pattern live in the `Setting` collection with defaults in `settings.service.js`.
- **Time-based behaviour is date-checked on every request**, so access is correct even if the daily sweep is late. The sweep only tidies up (status changes, file deletion, warnings, pausing).
- **Academic history is never deleted** by media expiry: quiz attempts, progress and certificates are separate collections from the media.
