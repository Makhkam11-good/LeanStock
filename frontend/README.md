# LeanStock Frontend

React + TypeScript + Vite dashboard for the LeanStock API.

## Local setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Default API URL:

```bash
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

Run a production build:

```bash
npm run build
```

Seed demo accounts are defined by the backend:

- `admin@leanstock.com / Admin123`
- `manager@leanstock.com / Manager123`
- `operator@leanstock.com / Operator123`
- `auditor@leanstock.com / Auditor123`
