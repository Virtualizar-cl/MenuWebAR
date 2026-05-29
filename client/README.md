# MenuWebAR — Frontend

React.js frontend for the MenuWebAR digital menu with AR visualization.

## Quick Start

```bash
# From monorepo root
npm install
npm run dev:client
```

Client runs on http://localhost:5173

## Environment Variables

Create a `.env` file in the `client/` directory:

```bash
cp client/.env.example client/.env
```

### Variables

| Variable       | Description                                       | Required   |
| -------------- | ------------------------------------------------- | ---------- |
| `VITE_API_URL` | Backend API URL (e.g., http://localhost:3001/api) | Production |

## Scripts

```bash
npm run dev      # Start Vite dev server (:5173)
npm run build    # Production build
npm run preview  # Preview production build
npm run start    # Serve production build
npm run test     # Run tests
```

## Docker

### Build Image

```bash
cd client
docker build -t menuwebar-client \
  --build-arg VITE_API_URL=http://localhost:3001/api \
  .
```

### Run Container

```bash
docker run -p 3000:3000 menuwebar-client
```

## Project Structure

```
client/
├── public
├── src
│   ├── admin
│   │   ├── AdminDashboard.jsx
│   │   ├── AdminLogin.jsx
│   │   ├── AdminUploader.jsx
│   │   ├── LogDetailsModal.jsx
│   │   ├── LogsPanel.jsx
│   │   ├── LogsPanel.module.css
│   │   ├── StatsPanel.jsx
│   │   ├── StatsPanel.module.css
│   │   ├── admin.module.css
│   │   └── api.js
│   ├── components
│   │   ├── charts
│   │   │   ├── ChartProviders.jsx
│   │   │   ├── chartBuilders.js
│   │   │   └── chartConfigs.js
│   │   ├── icons
│   │   │   ├── CameraIcon.jsx
│   │   │   ├── Icon3D.jsx
│   │   │   ├── IconClose.jsx
│   │   │   ├── IconDownload.jsx
│   │   │   ├── IconFacebook.jsx
│   │   │   ├── IconInstagram.jsx
│   │   │   └── IngredientsIcon.jsx
│   │   ├── ui
│   │   │   ├── ErrorState.jsx
│   │   │   ├── ErrorState.module.css
│   │   │   ├── KpiCard.jsx
│   │   │   ├── KpiCard.module.css
│   │   │   ├── LoadingState.jsx
│   │   │   └── LoadingState.module.css
│   │   ├── ArModal.jsx
│   │   ├── ArModal.module.css
│   │   ├── CategoryTabs.jsx
│   │   ├── CategoryTabs.module.css
│   │   ├── DirectARViewer.jsx
│   │   ├── ErrorBoundary.jsx
│   │   ├── Footer.jsx
│   │   ├── Footer.module.css
│   │   ├── Header.jsx
│   │   ├── Header.module.css
│   │   ├── IngredientsModal.jsx
│   │   ├── IngredientsModal.module.css
│   │   ├── MenuCard.jsx
│   │   ├── MenuCard.module.css
│   │   ├── MenuCardSkeleton.jsx
│   │   ├── MenuCardSkeleton.module.css
│   │   ├── MenuPrint.jsx
│   │   ├── MenuSection.jsx
│   │   ├── MenuSection.module.css
│   │   ├── Modal.jsx
│   │   ├── Modal.module.css
│   │   ├── ReservationSection.jsx
│   │   ├── ReservationSection.module.css
│   │   └── menuPrint.module.css
│   ├── config
│   │   ├── currencyFormatter.js
│   │   ├── env.js
│   │   └── restaurant.js
│   ├── hooks
│   │   ├── useActivityLogs.jsx
│   │   ├── useActivityStats.jsx
│   │   ├── useCategories.jsx
│   │   ├── useMenu.jsx
│   │   ├── useMenuAnalytics.jsx
│   │   └── useRestaurantOpenStatus.jsx
│   ├── services
│   │   ├── categories
│   │   │   └── getCategories.js
│   │   ├── logs
│   │   │   ├── clearActivityLogs.js
│   │   │   ├── getActivityLogs.js
│   │   │   ├── getActivityStats.js
│   │   │   └── getMenuAnalytics.js
│   │   ├── menu
│   │   │   └── getMenu.js
│   │   └── models
│   │       └── getModels.js
│   ├── test
│   │   ├── CategoryTabs.test.jsx
│   │   ├── ErrorBoundary.test.jsx
│   │   ├── restaurant.config.test.js
│   │   └── setup.js
│   ├── utils
│   │   ├── constants.js
│   │   ├── dateUtils.js
│   │   ├── getUsernameFromUrl.js
│   │   └── supabase.ts
│   ├── App.jsx
│   ├── App.module.css
│   ├── globals.css
│   ├── main.jsx
│   └── vite-env.d.ts
├── .dockerignore
├── .env.example
├── Dockerfile
├── README.md
├── index.html
├── package.json
├── vite.config.js
└── vitest.config.js
```

## Features

### Customer Features

- **Menu Browsing** — Filter by category, view item details
- **AR Visualization** — View 3D dish models, project onto table via WebXR
- **Reservations** — Book tables via WhatsApp with date/time selection
- **Responsive Design** — Works on mobile, tablet, and desktop

### Admin Features

- **Dashboard** — View stats, analytics, and activity logs
- **CRUD Operations** — Manage categories and menu items
- **Media Upload** — Upload images and 3D models to Supabase Storage
- **Activity Tracking** — Log and view user interactions

## AR Models

3D models for AR visualization are stored in **Supabase Storage**, not locally.

Requirements:

- **Format**: GLB (binary glTF)
- **Size**: Under 5 MB recommended for fast loading
- **Storage**: Supabase Storage (uploaded via admin panel)
- **Usage**: Models are registered via `/api/admin/modelos` endpoint and linked to menu items by model ID

## Testing

```bash
npm run test           # Run tests
```

Tests are located in `src/test/` and use Vitest + React Testing Library.

## Build for Production

```bash
# From monorepo root
npm run build:client

# Serve with server
npm run start:server
```

The client builds to `client/dist/` which is served by the Express server.
