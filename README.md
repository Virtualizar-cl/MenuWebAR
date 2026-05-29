# MenuWebAR — Route 66 Digital Menu with AR

A React + Express digital restaurant menu for **Route 66** (Santiago, Chile) featuring Augmented Reality food visualization. Customers can browse the menu, preview dishes in 3D, and project them onto their table using AR.

## Features

- **Responsive digital menu** — Browse categories, items, and prices on any device
- **AR visualization** — View 3D dish models and project them onto your table via WebXR
- **Reservations** — Book a table with date/time/zone selection, sent via WhatsApp
- **Admin dashboard** — Full CRUD for menu items and categories with JWT authentication
- **Analytics** — Track menu views, item popularity, and activity logs
- **Loading skeletons** — Smooth perceived performance while data loads

## Tech Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Frontend | React 18, React Router 7, CSS Modules                 |
| Backend  | Express 5, Node.js                                    |
| AR       | Google Model Viewer (WebXR, Scene Viewer, Quick Look) |
| Auth     | JWT + bcrypt                                          |
| Database | Supabase (PostgreSQL)                                 |
| Storage  | Supabase Storage (images & 3D models)                 |
| Build    | Vite 5                                                |
| Testing  | Vitest, Testing Library, Supertest                    |
| Linting  | ESLint 9, Prettier                                    |

## Project Structure

```
menuwebar/                 # Monorepo root (npm workspaces)
├── package.json           # Root scripts & workspaces config
├── docker-compose.yml     # Full stack Docker setup
├── .env.example           # Root environment template
│
├── client/                # Frontend workspace
│   ├── src/               # React application
│   ├── public/            # Static assets
│   ├── Dockerfile         # Production container
│   ├── package.json       # Client scripts & dependencies
│   └── README.md          # Client-specific documentation
│
└── server/                # Backend workspace
    ├── src/               # Express API
    ├── Dockerfile         # Production container
    ├── package.json       # Server scripts & dependencies
    └── README.md          # Server-specific documentation
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

Install all dependencies for both client and server:

```bash
npm install
```

### Environment Variables

Each workspace requires its own environment variables. Copy the example files:

```bash
# Client
cp client/.env.example client/.env

# Server
cp server/.env.example server/.env
```

#### Required Variables

**Server** (`server/.env`):

| Variable                    | Description                   | Required   |
| --------------------------- | ----------------------------- | ---------- |
| `JWT_SECRET`                | Secret for signing JWT tokens | Production |
| `ADMIN_DEFAULT_EMAIL`       | Initial admin email           | First run  |
| `ADMIN_DEFAULT_PASSWORD`    | Initial admin password        | First run  |
| `PORT`                      | Server port (default: 3001)   | No         |
| `SUPABASE_URL`              | Supabase project URL          | Yes        |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key     | Yes        |
| `SUPABASE_STORAGE_BUCKET`   | Supabase Storage Bucket       | Optional   |

**Client** (`client/.env`):

| Variable       | Description     | Required   |
| -------------- | --------------- | ---------- |
| `VITE_API_URL` | Backend API URL | Production |

### Running Locally

```bash
# Start both frontend and backend (concurrently)
npm run dev

# Or run separately:
npm run dev:client    # Vite dev server on :5173
npm run dev:server   # Express API on :3001
```

Open http://localhost:5173 for the menu, or http://localhost:5173/admin for the admin panel.

### Building for Production

```bash
# Build client only
npm run build:client

# Start server
npm run start:server
```

## Scripts

| Script                  | Description                       |
| ----------------------- | --------------------------------- |
| `npm run dev`           | Start both client & server        |
| `npm run dev:client`    | Start Vite dev server (:5173)     |
| `npm run dev:server`    | Start Express API (:3001)         |
| `npm run build:client`  | Production build (client)         |
| `npm run start:server`  | Start Express server (serves API) |
| `npm run start:client`  | Serve client production build     |
| `npm run lint`          | Run ESLint                        |
| `npm run lint:fix`      | Run ESLint with auto-fix          |
| `npm run format:check`  | Check code formatting             |
| `npm run format`        | Format code with Prettier         |
| `npm run test`          | Run all tests                     |
| `npm run test:watch`    | Run tests in watch mode           |
| `npm run test:coverage` | Run tests with coverage report    |

## Docker Deployment

### Using Docker Compose (Recommended)

Start both services with a single command:

```bash
docker compose up --build -d
```

This will start:

- Client on http://localhost:3000
- Server on http://localhost:3001

Configure environment variables in `docker-compose.yml` before deploying.

## API Endpoints

See [server/README.md](./server/README.md) for complete API documentation.

### Public Endpoints

| Method | Endpoint          | Description     |
| ------ | ----------------- | --------------- |
| GET    | `/api/health`     | Health check    |
| GET    | `/api/menu`       | Full menu data  |
| GET    | `/api/categories` | Categories list |
| GET    | `/api/menu-items` | All menu items  |
| GET    | `/api/modelos`    | All 3D models   |
| GET    | `/api/imagenes`   | All images      |

### Authentication Endpoints

| Method | Endpoint           | Description          |
| ------ | ------------------ | -------------------- |
| POST   | `/api/auth/login`  | Login (rate-limited) |
| GET    | `/api/auth/verify` | Verify JWT token     |

### Admin Endpoints (requires Bearer token)

**Categories:**

| Method | Endpoint                    | Description     |
| ------ | --------------------------- | --------------- |
| GET    | `/api/admin/categories`     | List categories |
| POST   | `/api/admin/categories`     | Create category |
| PUT    | `/api/admin/categories/:id` | Update category |
| DELETE | `/api/admin/categories/:id` | Delete category |

**Menu Items:**

| Method | Endpoint               | Description |
| ------ | ---------------------- | ----------- |
| GET    | `/api/admin/items`     | List items  |
| POST   | `/api/admin/items`     | Create item |
| PUT    | `/api/admin/items/:id` | Update item |
| DELETE | `/api/admin/items/:id` | Delete item |

**Images & Models:**

| Method | Endpoint                  | Description                   |
| ------ | ------------------------- | ----------------------------- |
| POST   | `/api/admin/modelos`      | Upload and register new model |
| DELETE | `/api/admin/modelos/:id`  | Delete model                  |
| POST   | `/api/admin/imagenes`     | Upload and register new image |
| DELETE | `/api/admin/imagenes/:id` | Delete image                  |

**Color History:**

| Method | Endpoint                       | Description          |
| ------ | ------------------------------ | -------------------- |
| GET    | `/api/admin/historial-colores` | List color history   |
| POST   | `/api/admin/historial-colores` | Add color to history |

**Users (secondary accounts):**

| Method | Endpoint                  | Description |
| ------ | ------------------------- | ----------- |
| GET    | `/api/admin/usuarios`     | List users  |
| POST   | `/api/admin/usuarios`     | Create user |
| PUT    | `/api/admin/usuarios/:id` | Update user |
| DELETE | `/api/admin/usuarios/:id` | Delete user |

**Settings & Logs:**

| Method | Endpoint                | Description           |
| ------ | ----------------------- | --------------------- |
| PUT    | `/api/admin/password`   | Change admin password |
| GET    | `/api/admin/logs`       | Activity logs         |
| GET    | `/api/admin/logs/stats` | Dashboard stats       |
| DELETE | `/api/admin/logs/clear` | Clear all logs        |

## AR Model Requirements

- Format: **GLB** (binary glTF)
- Recommended size: under 5 MB for fast mobile loading

## Documentation

- [Client README](./client/README.md) — Frontend setup, components, Docker
- [Server README](./server/README.md) — Backend API, Supabase schema, endpoints

## License

Private project — all rights reserved.
