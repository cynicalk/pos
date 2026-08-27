# POS Backend

REST API + WebSocket server for a restaurant point-of-sale system, built with Node.js, Express, and PostgreSQL.

## Architecture

```
src/
├── app.js                  # Express app (middleware + routers)
├── server.js               # HTTP server + WebSocket init
└── shared/
│   ├── db.js               # pg Pool wrapper
│   ├── errors.js           # AppError hierarchy
│   ├── websocket.js        # WebSocket broadcast helper
│   └── middleware/
│       ├── auth.js         # JWT authenticate + authorize
│       └── validate.js     # Body validation middleware
└── {module}/
    ├── {module}.router.js      # Express routes
    ├── {module}.service.js     # Business logic
    ├── {module}.repository.js  # DB queries
    └── {module}.interface.js   # Public API for other modules
```

### Modules
| Module   | Responsibility |
|----------|----------------|
| auth     | Login, registration, JWT |
| menu     | Menu item CRUD |
| tables   | Table CRUD and status |
| orders   | Order creation and lifecycle |
| payments | Payment processing |
| kitchen  | Kitchen queue and order status updates |
| reports  | Daily sales reports (admin only) |

## Setup

### Prerequisites
- Node.js >= 22
- Docker + Docker Compose

### 1. Start databases
```bash
docker compose up -d
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
```

### 3. Install dependencies
```bash
npm install
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Start server
```bash
npm run dev      # development (nodemon)
npm start        # production
```

Server runs on `http://localhost:3000` by default.

## API Reference

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login, returns JWT |
| POST | `/api/auth/register` | admin | Create staff/admin account |
| GET | `/api/auth/me` | any | Current user profile |

### Menu
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/menu` | any | All menu items |
| GET | `/api/menu/available` | any | Only available items |
| GET | `/api/menu/:id` | any | Single item |
| POST | `/api/menu` | admin | Create item |
| PATCH | `/api/menu/:id` | admin | Update item |
| DELETE | `/api/menu/:id` | admin | Delete item |

### Tables
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tables` | any | All tables |
| GET | `/api/tables/:id` | any | Single table |
| POST | `/api/tables` | admin | Create table |
| PATCH | `/api/tables/:id/status` | any | Update status |
| DELETE | `/api/tables/:id` | admin | Delete table |

Table statuses: `available`, `occupied`, `reserved`, `cleaning`

### Orders
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/orders/:id` | any | Get order |
| GET | `/api/orders/table/:tableId` | any | Active orders for table |
| POST | `/api/orders` | any | Create order |
| POST | `/api/orders/:id/items` | any | Add items to order |
| PATCH | `/api/orders/:id/status` | any | Update order status |

Order statuses: `open`, `preparing`, `ready`, `paid`, `cancelled`

### Payments
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/payments/:orderId` | any | Process payment |
| GET | `/api/payments/:orderId` | any | Get payments for order |

Payment methods: `cash`, `card`, `mobile`

### Kitchen
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/kitchen/queue` | any | Pending kitchen items |
| PATCH | `/api/kitchen/:orderId/preparing` | any | Mark order preparing |
| PATCH | `/api/kitchen/:orderId/ready` | any | Mark order ready |

### Reports
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reports/daily?date=YYYY-MM-DD` | admin | Daily sales summary |

## WebSocket Events

Connect to `ws://localhost:3000`. Events broadcast to all clients:

| Event | Payload | Trigger |
|-------|---------|---------|
| `CONNECTED` | `{}` | On connection |
| `NEW_ORDER` | `{ orderId, tableId }` | Order created |
| `ORDER_UPDATED` | `{ orderId }` | Items added |
| `ORDER_STATUS_CHANGED` | `{ orderId, status }` | Status updated |
| `ORDER_PREPARING` | `{ orderId }` | Kitchen starts |
| `ORDER_READY` | `{ orderId }` | Kitchen done |
| `PAYMENT_COMPLETED` | `{ orderId, paymentId, total }` | Payment processed |

## Testing

```bash
# Run migrations on test DB first
npm run migrate:test

# Run all tests
npm test
```

Tests use a separate database on port 5433 and run sequentially (`--runInBand`).

## User Roles

| Role | Description |
|------|-------------|
| `admin` | Full access including reports, user registration, menu/table management |
| `staff` | Order taking, payments, kitchen queue |
| `kitchen` | Kitchen queue access |
