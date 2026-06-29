# Agape Conference Management - Contributing Guide

Thank you for contributing to Agape Conference Management! This guide will help you get started.

## 🏗️ Architecture Overview

This is a full-stack TypeScript application following **OOP + SOLID principles**:

### Backend (Node.js + Express + Prisma)
- **Layered Architecture**: Controllers → Services → Repositories
- **SOLID Compliance**: Each layer has single responsibility, uses dependency injection
- **Database**: PostgreSQL with Prisma ORM

### Frontend (React + TypeScript + Vite)
- **Component-Based**: Reusable UI components with shadcn/ui
- **State Management**: Zustand for UI state, React Query for server state
- **Drag-and-Drop**: @dnd-kit for room assignments

## 📝 Code Standards

### Documentation Requirements

Every file must have comprehensive comments:

1. **Class-level JSDoc**:
```typescript
/**
 * AttendeeService - Business logic for attendee management
 * 
 * Responsibilities:
 * - CRUD operations for attendees
 * - Duplicate detection
 * 
 * Dependencies:
 * - AttendeeRepository (data access)
 * - AuditLogService (audit trail)
 * 
 * SOLID Compliance:
 * - Single Responsibility: Only handles attendee logic
 * - Dependency Injection: Receives dependencies via constructor
 */
export class AttendeeService { ... }
```

2. **Method-level JSDoc**:
```typescript
/**
 * Create new attendee with duplicate detection
 * 
 * WHY: Check for duplicates before creation to prevent
 *      accidental duplicate entries during Excel import
 * 
 * @param data - Attendee creation data
 * @returns Created attendee or throws if duplicate found
 */
async createAttendee(data: CreateAttendeeDto): Promise<Attendee> { ... }
```

3. **Inline WHY comments** for non-obvious code:
```typescript
// WHY: Fuzzy matching catches typos and slight variations
const duplicates = await this.findPotentialDuplicates(data.fullName);
```

### TypeScript Standards

- **Strict Mode**: Always enabled (`strict: true`)
- **No `any`**: Use proper types or `unknown` with type guards
- **No unused variables**: Prefix with `_` if intentionally unused
- **Explicit return types**: Always specify function return types

### Code Style

- **Prettier**: Auto-format on save (2 spaces, single quotes, semicolons)
- **ESLint**: No warnings or errors allowed
- **Naming**:
  - Classes: PascalCase (`AttendeeService`)
  - Functions/Variables: camelCase (`getUserById`)
  - Constants: UPPER_SNAKE_CASE (`MAX_CAPACITY`)
  - Files: PascalCase for classes, camelCase for utilities

## 🔄 Development Workflow

### 1. Setup Local Environment

```bash
# Clone repository
git clone https://github.com/yourusername/agape-conference.git
cd agape-conference

# Install dependencies
npm install

# Setup environment variables
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start with Docker (easiest)
docker-compose up

# OR manually start services
cd backend && npm run dev    # Terminal 1
cd frontend && npm run dev   # Terminal 2
```

### 2. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
# OR
git checkout -b fix/bug-description
```

### 3. Make Changes

- Write code following SOLID principles
- Add comprehensive WHY comments
- Write tests for new features
- Ensure no linter errors

### 4. Test Your Changes

```bash
# Backend tests
cd backend
npm run lint
npm run test

# Frontend tests
cd frontend
npm run lint
npm run test
```

### 5. Commit Changes

Use conventional commit messages:

```bash
git commit -m "feat: add attendee Excel import functionality"
git commit -m "fix: resolve duplicate check race condition"
git commit -m "docs: update API documentation for room endpoints"
git commit -m "refactor: extract assignment validation to separate service"
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### 6. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Create Pull Request on GitHub with:
- Clear description of changes
- Screenshots (if UI changes)
- Test results
- Reference to related issues

## ✅ PR Checklist

Before submitting PR, ensure:

- [ ] Code follows SOLID principles
- [ ] All functions have WHY comments explaining decisions
- [ ] No TypeScript errors or warnings
- [ ] No ESLint warnings
- [ ] Tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console.log statements (use logger)
- [ ] Updated documentation if needed

## 🧪 Testing Guidelines

### Backend Tests

```typescript
describe('AttendeeService', () => {
  it('should create attendee with unique name', async () => {
    // WHY: Test happy path for attendee creation
    const attendee = await service.createAttendee({
      fullName: 'John Doe',
      conferenceRole: ConferenceRole.ATTENDEE,
    });
    
    expect(attendee.id).toBeDefined();
    expect(attendee.fullName).toBe('John Doe');
  });

  it('should throw error when duplicate name detected', async () => {
    // WHY: Test duplicate detection logic
    await service.createAttendee({ fullName: 'Jane Smith' });
    
    await expect(
      service.createAttendee({ fullName: 'Jane Smith' })
    ).rejects.toThrow('Duplicate attendee');
  });
});
```

### Frontend Tests

```typescript
describe('AttendeeList', () => {
  it('should render list of attendees', () => {
    // WHY: Test basic rendering
    render(<AttendeeList attendees={mockAttendees} />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
```

## 📦 Project Structure

```
agape-conference/
├── backend/
│   ├── src/
│   │   ├── controllers/    # HTTP request handlers (thin layer)
│   │   ├── services/       # Business logic (OOP classes)
│   │   ├── repositories/   # Data access (extends BaseRepository)
│   │   ├── models/         # Domain entities
│   │   ├── middleware/     # Express middleware
│   │   ├── validators/     # Zod validation schemas
│   │   └── utils/          # Helpers (logger, prisma client)
│   └── prisma/
│       └── schema.prisma   # Database schema
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API clients (OOP classes)
│   │   ├── store/          # Zustand stores
│   │   └── types/          # TypeScript interfaces
└── .github/
    └── workflows/          # CI/CD pipelines
```

## 🚀 Deployment

Deployment is automatic via GitHub Actions:

1. Push to `main` branch
2. CI runs (lint, test, build)
3. Deploy to Vercel (backend + frontend)
4. Health checks verify deployment

See `.github/workflows/deploy.yml` for details.

## 🐛 Debugging

### Backend Debugging

```bash
# Enable verbose logging
LOG_LEVEL=debug npm run dev

# Open Prisma Studio to inspect database
npm run prisma:studio
```

### Frontend Debugging

- Use React DevTools browser extension
- Check browser console for errors
- Use Network tab to inspect API calls

## 📚 Useful Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [React Query](https://tanstack.com/query/latest)
- [@dnd-kit Documentation](https://docs.dndkit.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)

## 💬 Getting Help

- Open GitHub Issue for bugs or feature requests
- Check existing issues before creating new ones
- Tag issues with appropriate labels

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.
