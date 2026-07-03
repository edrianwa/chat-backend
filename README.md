# SecureChat Server (Flying Phoenix)

Backend server for the SecureChat application, built with Node.js, Express, and Socket.io.

## Project Structure

```
securechat-server/
├── src/
│   ├── controllers/       # Request handlers
│   │   └── health.controller.ts
│   ├── models/            # Data models (placeholder for future)
│   ├── routes/            # Express route definitions
│   │   └── health.ts
│   ├── services/          # Business logic layer
│   │   └── health.service.ts
│   └── index.ts           # App entry point (Express + Socket.io)
├── package.json
├── tsconfig.json
└── .eslintrc.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
cd securechat-server
npm install
```

### Scripts

| Script    | Description                              |
|-----------|------------------------------------------|
| `dev`     | Run in development mode with hot-reload  |
| `build`   | Compile TypeScript to JavaScript         |
| `start`   | Run the compiled production build        |
| `lint`    | Run ESLint on source files               |
| `lint:fix`| Auto-fix linting issues                  |

### Running

```bash
# Development (hot-reload)
npm run dev

# Production
npm run build
npm start
```

### Health Check

```
GET /api/health
```

Returns server status, version, and uptime.

## Architecture

- **Express** for REST API endpoints
- **Socket.io** for real-time WebSocket communication
- **TypeScript** for type safety
- **Controller/Service pattern** for separation of concerns

## Port

Default: `3000` (configurable via `PORT` environment variable)
