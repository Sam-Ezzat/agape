# Agape Conference Accommodation Management System

A comprehensive full-stack accommodation management system for large conferences (1000-5000 attendees) across multiple buildings, floors, and rooms.

## 🎯 Features

- **Excel Import**: Import attendee data from Excel files with flexible column mapping
- **Hierarchical Structure**: Manage Conference House → Buildings → Floors → Rooms
- **Drag & Drop Assignment**: Intuitive drag-and-drop interface for room assignments
- **Attendee Profiles**: Full profile management with roles (Leader, Pastor, VIP), notes, special needs
- **Check-in Tracking**: Real-time check-in/check-out monitoring
- **Search & Filter**: Advanced multi-criteria search and filtering
- **Real-time Updates**: WebSocket-based live updates for multi-admin collaboration
- **Reports & Export**: Generate room rosters, occupancy summaries, attendee lists

## 🏗️ Architecture

**Frontend**: React + TypeScript + Vite + Tailwind CSS + @dnd-kit  
**Backend**: Node.js + Express + TypeScript + Prisma ORM  
**Database**: PostgreSQL  
**Real-time**: Socket.io WebSocket  
**Deployment**: Vercel (Frontend + Backend)  
**CI/CD**: GitHub Actions

### Design Principles

- **OOP Architecture**: Layered design with Controllers → Services → Repositories
- **SOLID Principles**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Injection
- **Type Safety**: TypeScript strict mode throughout
- **Code Documentation**: Comprehensive WHY comments explaining design decisions

## 📁 Project Structure

```
agape-conference/
├── frontend/          # React + Vite application
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API client classes
│   │   ├── store/        # Zustand state management
│   │   └── types/        # TypeScript interfaces
│   └── package.json
│
├── backend/           # Node.js + Express API
│   ├── src/
│   │   ├── controllers/  # HTTP request handlers
│   │   ├── services/     # Business logic (OOP classes)
│   │   ├── repositories/ # Data access layer
│   │   ├── models/       # Domain entities
│   │   ├── routes/       # API routes
│   │   └── middleware/   # Express middleware
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   └── package.json
│
├── .github/
│   └── workflows/     # CI/CD pipelines
├── docker-compose.yml # Local development stack
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Docker Desktop (for local PostgreSQL)
- Git

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/agape-conference.git
cd agape-conference
```

2. **Start the entire stack with Docker**
```bash
docker-compose up
```

This will start:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- PostgreSQL: localhost:5432

### Manual Setup (Without Docker)

#### Backend Setup

```bash
cd backend
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npx prisma migrate dev

# Seed test data (optional)
npm run seed

# Start development server
npm run dev
```

#### Frontend Setup

```bash
cd frontend
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with API URL

# Start development server
npm run dev
```

## 📦 Tech Stack

### Frontend
- **React 18**: UI library
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Pre-built accessible components
- **@dnd-kit**: Drag-and-drop functionality
- **React Query**: Server state management
- **React Hook Form + Zod**: Form handling and validation
- **XLSX**: Excel file parsing
- **Socket.io Client**: Real-time updates

### Backend
- **Node.js + Express**: Web framework
- **TypeScript**: Type safety
- **Prisma**: TypeScript-first ORM
- **PostgreSQL**: Relational database
- **Socket.io**: WebSocket server
- **Zod**: Runtime validation
- **Winston**: Structured logging
- **XLSX**: Excel processing

### DevOps
- **Docker**: Containerization
- **Docker Compose**: Multi-container orchestration
- **GitHub Actions**: CI/CD pipelines
- **Vercel**: Deployment platform
- **Vitest**: Unit and integration testing
- **Playwright**: End-to-end testing

## 🔧 Development Commands

### Backend
```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run lint         # Lint code
npm run format       # Format code with Prettier
npm run prisma:studio # Open Prisma Studio (database GUI)
```

### Frontend
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run test         # Run tests
npm run lint         # Lint code
npm run format       # Format code with Prettier
```

## 🗄️ Database Schema

Key tables:
- `conference_houses` - Conference house definitions
- `buildings` - Buildings within conference houses
- `floors` - Floors within buildings
- `rooms` - Rooms with capacity and amenities
- `attendees` - Conference attendees with profiles
- `room_assignments` - Attendee-to-room mappings
- `audit_logs` - Complete audit trail

## 🚢 Deployment

### Automatic Deployment (CI/CD)

Push to `main` branch triggers automatic deployment:
1. GitHub Actions runs tests and builds
2. Backend deploys to Vercel (runs migrations)
3. Frontend deploys to Vercel
4. Health checks verify deployment

### Manual Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

### Environment Variables

Required environment variables for production:

**Backend**:
- `DATABASE_URL` - PostgreSQL connection string
- `DIRECT_URL` - Direct database connection (for migrations)
- `NODE_ENV` - production
- `FRONTEND_URL` - Frontend URL for CORS

**Frontend**:
- `VITE_API_URL` - Backend API URL

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

## 📝 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and coding standards.

## 📞 Support

For issues and questions, please open a GitHub issue.

---

Built with ❤️ for efficient conference management
