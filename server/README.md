# MenuWebAR — Backend

Express.js API server for the MenuWebAR project.

## Quick Start

```bash
# From monorepo root
npm install
npm run dev:server
```

Server runs on http://localhost:3001

## Environment Variables

Create a `.env` file in the `server/` directory:

```bash
cp server/.env.example server/.env
```

### Variables

| Variable                    | Description                                | Required   |
| --------------------------- | ------------------------------------------ | ---------- |
| `PORT`                      | Server port (default: 3001)                | No         |
| `JWT_SECRET`                | Secret for JWT tokens (32+ chars)          | Production |
| `ADMIN_DEFAULT_EMAIL`       | Initial admin email (used on first run)    | First run  |
| `ADMIN_DEFAULT_PASSWORD`    | Initial admin password (used on first run) | First run  |
| `SUPABASE_URL`              | Supabase project URL                       | Yes        |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key                  | Yes        |
| `SUPABASE_STORAGE_BUCKET`   | Supabase Storage Bucket                    | Optional   |

Generate a secure JWT_SECRET:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Scripts

```bash
npm run dev      # Start with nodemon (development)
npm run start    # Start with node (production)
npm run test     # Run tests
```

## Docker

### Build Image

```bash
cd server
docker build -t menuwebar-server .
```

### Run Container

```bash
docker run -p 3001:3001 \
  -e PORT=3001 \
  -e JWT_SECRET=your-secret \
  -e ADMIN_DEFAULT_EMAIL=admin@restaurant.com \
  -e ADMIN_DEFAULT_PASSWORD=your-password \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=your-key \
  -e SUPABASE_STORAGE_BUCKET=menu-assets \
  menuwebar-server
```

## Project Structure

```
├── public
├── src
│   ├── __tests__
│   │   └── server.test.js
│   ├── data
│   │   ├── admin.json
│   │   ├── menu.json
│   │   └── supabase-schema.sql
│   ├── middlewares
│   │   └── loggingMiddleware.js
│   ├── routes
│   │   └── activityLogs.js
│   ├── services
│   │   └── logsStore.js
│   ├── server.js
│   └── supabaseStore.js
├── .dockerignore
├── .env.example
├── Dockerfile
├── README.md
├── package.json
└── vitest.config.js
```

## API Endpoints

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

## Supabase Schema

See `server/src/data/supabase-schema.sql` for the database schema. The API requires:
