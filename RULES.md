# Matrix Dashboard Project Code Writing Standards

## 1. Code Style and Formatting Standards

### 1.1 General Standards

#### Encoding Format
- All source code files must use UTF-8 encoding
- Line endings must uniformly use LF (Unix style), not CRLF (Windows style)
- Files must retain one empty line at the end
- Indentation must uniformly use 2 spaces, not Tab characters

#### Naming Conventions
- **File names**: Use kebab-case (lowercase letters, words separated by hyphens), e.g., `user-service.ts`
- **Directory names**: Use kebab-case, e.g., `dashboard-integration`
- **TypeScript/JavaScript variables and functions**: Use camelCase, e.g., `getUserProfile`
- **TypeScript/JavaScript class names and interfaces**: Use PascalCase, e.g., `UserService`
- **TypeScript/JavaScript constants**: Use UPPER_SNAKE_CASE, e.g., `MAX_RETRY_COUNT`
- **Python variables and functions**: Use snake_case, e.g., `check_user_ban`
- **Python class names**: Use PascalCase, e.g., `DashboardIntegration`
- **Database table names**: Use snake_case, e.g., `user_profiles`
- **Database column names**: Use snake_case, e.g., `created_at`
- **Environment variables**: Use UPPER_SNAKE_CASE, e.g., `DATABASE_URL`

#### Comment Standards
- All modifications to Synapse native code must add marker comments `# DASHBOARD INTEGRATION` or `// DASHBOARD INTEGRATION`
- Complex business logic must include comments explaining the intent
- Public APIs and functions must include complete documentation comments (JSDoc/Docstring)
- Comments must use Chinese language uniformly, while code and identifiers use English

### 1.2 TypeScript/Node.js Code Standards

#### ESLint Configuration
```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { 
      "argsIgnorePattern": "^_" 
    }],
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

#### Prettier Configuration
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

#### Type Definition Requirements
- All functions must explicitly declare return types
- Avoid using `any` type, prefer `unknown` or specific types
- Interface definitions must be separated from implementations, uniformly placed in `types/` directory
- Use `readonly` to mark immutable properties

#### Asynchronous Processing Standards
- Prefer `async/await` over Promise chains
- All asynchronous operations must have error handling (try-catch)
- Database operations must use transactions to ensure atomicity
- Avoid using `await` in loops, prefer `Promise.all()` for batch processing

#### Example Code
```typescript
// Correct Example
import { Pool } from 'pg';
import { redis } from '../config/redis';

interface BanUserOptions {
  reason: string;
  durationHours?: number;
  violationLevel: 'minor' | 'normal' | 'severe';
  adminId: string;
}

export class BanService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Ban user
   * @param userId - User ID
   * @param banType - Ban type
   * @param options - Ban options
   * @returns Ban record ID
   */
  async banUser(
    userId: number,
    banType: 'silence' | 'soft_ban' | 'hard_ban',
    options: BanUserOptions
  ): Promise<number> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const expiresAt = options.durationHours
        ? new Date(Date.now() + options.durationHours * 3600 * 1000)
        : null;

      const result = await client.query(
        `INSERT INTO dashboard.user_bans 
         (user_id, ban_type, reason, violation_level, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userId, banType, options.reason, options.violationLevel, expiresAt, options.adminId]
      );

      await client.query('COMMIT');

      // Clear cache and publish event
      await this.invalidateCache(userId, banType);

      return result.rows[0].id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async invalidateCache(userId: number, banType: string): Promise<void> {
    await redis.del(`user:${userId}:routing`);
    await redis.publish(
      'user.banned',
      JSON.stringify({
        user_id: userId,
        ban_type: banType,
        timestamp: new Date().toISOString(),
      })
    );
  }
}
```

### 1.3 Python Code Standards

#### PEP 8 Compliance
- Follow PEP 8 standards, use `black` for automatic formatting
- Maximum line length 100 characters
- Group import statements by standard library, third-party libraries, local modules
- Two blank lines between functions and methods, one blank line between methods within a class

#### Type Annotation Requirements
- Python 3.11+ must use type annotations
- Function parameters and return values must declare types
- Use `mypy` for type checking

#### Example Code
```python
# Correct Example
from typing import Optional, Dict, Any
import redis
import json
from datetime import datetime

class DashboardIntegration:
    """Dashboard integration module, responsible for risk control checks and cache management"""

    def __init__(self, config: Dict[str, Any]) -> None:
        self.redis_client = redis.Redis(
            host=config['redis_host'],
            port=config['redis_port'],
            decode_responses=True
        )

    def get_user_routing_state(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user routing state (from cache or database)
        
        Args:
            user_id: Matrix user ID (format: @username:domain)
            
        Returns:
            User routing state dictionary, returns None if user doesn't exist
        """
        # DASHBOARD INTEGRATION: Read from cache first
        cached = self.redis_client.get(f"user:{user_id}:routing")
        if cached:
            return json.loads(cached)

        # Cache miss, query database
        return self._load_from_database(user_id)

    def _load_from_database(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Load user state from database"""
        # Implement database query logic
        pass
```

### 1.4 React/Frontend Code Standards

#### Component Standards
- Component file names use PascalCase, e.g., `UserList.tsx`
- Prefer function components and Hooks
- Each component file only exports one main component
- Complex components must be split into sub-components
- Props interfaces must be explicitly defined

#### State Management Standards
- Use TanStack Query for server-side state management
- Use useState/useReducer for local UI state management
- Avoid prop drilling, use Context for more than 3 levels of passing
- Direct use of localStorage or sessionStorage in components is prohibited

#### Example Code
```typescript
// Correct Example
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

interface User {
  id: number;
  username: string;
  email: string;
  userGroup: string;
}

interface UserListProps {
  onBanUser: (userId: number) => void;
}

export function UserList({ onBanUser }: UserListProps) {
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => api.delete(`/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Load failed: {error.message}</div>;

  return (
    <div className="space-y-4">
      {users?.map((user) => (
        <div key={user.id} className="flex items-center justify-between p-4 border rounded">
          <div>
            <h3 className="font-semibold">{user.username}</h3>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={() => onBanUser(user.id)}
            className="px-4 py-2 bg-red-600 text-white rounded"
          >
            Ban
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 2. Project Structure Standards

### 2.1 Dashboard Backend Structure

```
dashboard/
├── src/
│   ├── app.ts                      # Express application entry
│   ├── server.ts                   # HTTP server startup
│   ├── config/
│   │   ├── database.ts             # Database connection configuration
│   │   ├── redis.ts                # Redis connection configuration
│   │   ├── constants.ts            # Constant definitions
│   │   └── env.ts                  # Environment variable validation
│   ├── routes/
│   │   ├── index.ts                # Route aggregation
│   │   ├── auth.ts                 # Authentication routes
│   │   ├── users.ts                # User management routes
│   │   ├── bans.ts                 # Risk control routes
│   │   ├── appeals.ts              # Appeal routes
│   │   └── media.ts                # Media management routes
│   ├── services/
│   │   ├── user-service.ts         # User business logic
│   │   ├── ban-service.ts          # Risk control business logic
│   │   ├── appeal-service.ts       # Appeal business logic
│   │   ├── cache-service.ts        # Cache management
│   │   ├── pubsub-service.ts       # Pub/Sub publishing
│   │   └── media-service.ts        # Media management logic
│   ├── middleware/
│   │   ├── auth.ts                 # JWT authentication middleware
│   │   ├── logging.ts              # Logging middleware
│   │   ├── error-handler.ts        # Error handling middleware
│   │   └── rate-limit.ts           # Rate limiting middleware
│   ├── models/                     # Data models (if using ORM)
│   ├── types/
│   │   ├── user.ts                 # User-related types
│   │   ├── ban.ts                  # Risk control-related types
│   │   └── api.ts                  # API response types
│   └── utils/
│       ├── logger.ts               # Logging utilities
│       ├── validators.ts           # Data validation utilities
│       └── crypto.ts               # Encryption utilities
├── migrations/                     # Database migration scripts
│   ├── 001_create_dashboard_schema.sql
│   ├── 002_create_user_tables.sql
│   └── ...
├── tests/
│   ├── unit/                       # Unit tests
│   ├── integration/                # Integration tests
│   └── fixtures/                   # Test data
├── .env.example                    # Environment variable example
├── .eslintrc.json                  # ESLint configuration
├── .prettierrc.json                # Prettier configuration
├── tsconfig.json                   # TypeScript configuration
├── package.json
└── README.md
```

### 2.2 Dashboard Frontend Structure

```
dashboard/frontend/
├── src/
│   ├── main.tsx                    # React application entry
│   ├── App.tsx                     # Root component
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── ui/                     # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ...
│   │   ├── users/
│   │   │   ├── UserList.tsx
│   │   │   ├── UserDetail.tsx
│   │   │   └── BanUserModal.tsx
│   │   ├── appeals/
│   │   │   ├── AppealList.tsx
│   │   │   └── AppealDetail.tsx
│   │   └── media/
│   │       └── MediaBrowser.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Users.tsx
│   │   ├── Appeals.tsx
│   │   ├── Media.tsx
│   │   └── Logs.tsx
│   ├── services/
│   │   ├── api.ts                  # API client
│   │   └── auth.ts                 # Authentication service
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useUsers.ts
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── utils/
│   │   ├── format.ts               # Formatting utilities
│   │   └── constants.ts            # Constants
│   └── lib/
│       └── utils.ts                # shadcn/ui utilities
├── public/                         # Static resources
├── .env.example
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### 2.3 Synapse Modification Structure

```
synapse/
├── synapse/
│   ├── dashboard_integration/      # New module
│   │   ├── __init__.py            # Main integration class
│   │   ├── cache.py               # Cache management
│   │   ├── pubsub.py              # Pub/Sub subscription
│   │   ├── db_queries.py          # Database queries
│   │   └── config.py              # Configuration definition
│   ├── handlers/
│   │   ├── auth.py                # Modification: Add risk control checks
│   │   ├── message.py             # Modification: Add message filtering
│   │   └── room.py                # Modification: Add room operation checks
│   └── config/
│       └── dashboard.py           # New: Dashboard configuration
└── docs/
    └── DASHBOARD_INTEGRATION.md   # Modification documentation
```

### 2.4 Bot Service Structure

```
bot/
├── src/
│   ├── index.ts                   # Bot entry
│   ├── handlers/
│   │   ├── appeal-handler.ts      # Appeal handling
│   │   └── verify-handler.ts      # Friend verification handling
│   ├── services/
│   │   └── dashboard-api.ts       # Dashboard API client
│   └── utils/
│       └── message-parser.ts      # Message parsing
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 3. Git Workflow Standards

### 3.1 Branch Management

#### Main Branches
- `main`: Production environment code, only accepts merges from `develop`
- `develop`: Main development branch, daily development creates feature branches based on this

#### Feature Branch Naming
- New features: `feature/feature-description`, e.g., `feature/user-ban-system`
- Bug fixes: `fix/bug-description`, e.g., `fix/cache-invalidation`
- Urgent fixes: `hotfix/issue-description`, e.g., `hotfix/security-patch`
- Documentation updates: `docs/documentation-description`, e.g., `docs/api-documentation`

#### Branch Lifecycle
1. Create feature branch from `develop`
2. Develop and commit on feature branch
3. After development completion, create Pull Request to `develop`
4. After code review approval, merge and delete feature branch

### 3.2 Commit Message Standards

#### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type Categories
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation update
- `style`: Code formatting adjustments (doesn't affect functionality)
- `refactor`: Code refactoring
- `perf`: Performance optimization
- `test`: Testing related
- `chore`: Build tools or auxiliary tools changes
- `revert`: Revert previous commit

#### Scope (Optional)
- `backend`: Dashboard backend
- `frontend`: Dashboard frontend
- `synapse`: Synapse modifications
- `bot`: Bot service
- `db`: Database related
- `ci`: CI/CD configuration

#### Examples
```
feat(backend): Implement user ban API

- Add BanService class to handle ban logic
- Implement Redis cache invalidation mechanism
- Add Pub/Sub event publishing

Closes #123
```

```
fix(synapse): Fix hard ban user message filtering logic

Properly handle cache miss situations when batch querying member status

Fixes #456
```

### 3.3 Code Review Requirements

#### Pull Request Standards
- PR title must clearly describe change content
- PR description must include: reason for change, implementation method, testing situation
- Must associate related Issue
- Must pass all automated tests
- Must have at least one reviewer approval

#### Review Checklist
- [ ] Code complies with project coding standards
- [ ] All new features have corresponding tests
- [ ] Documentation updated (if needed)
- [ ] No new ESLint/Mypy warnings introduced
- [ ] All TODO comments have corresponding Issues
- [ ] Sensitive information removed (passwords, tokens, etc.)
- [ ] Database migration scripts can be rolled back

---

## 4. Environment Configuration Standards

### 4.1 Development Environment (Windows)

#### Essential Tools
- Node.js 20 LTS
- Python 3.11+
- Git for Windows (configure automatic line ending conversion)
- VS Code or other editor supporting EditorConfig
- Docker Desktop (for running PostgreSQL/Redis locally)

#### Git Configuration
```bash
# Configure automatic line ending conversion
git config --global core.autocrlf true

# Set user information
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

#### VS Code Recommended Plugins
- ESLint
- Prettier
- Python
- Pylance
- EditorConfig for VS Code
- GitLens
- Thunder Client (API testing)

#### EditorConfig Configuration
```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2

[*.{py,pyi}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

### 4.2 Production Environment (Ubuntu Server)

#### System Requirements
- Ubuntu Server 22.04 LTS
- Minimum 4GB RAM, recommended 8GB+
- At least 50GB storage space

#### Essential Software
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install PostgreSQL 15
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-15

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx

# Install build tools
sudo apt install -y build-essential libssl-dev libffi-dev
```

#### Firewall Configuration
```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 4.3 Environment Variable Management

#### Dashboard Backend .env Example
```env
# Database configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=synapse
DB_PASSWORD=your_secure_password
DB_NAME=synapse

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT configuration
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRES_IN=24h

# Brevo email configuration
BREVO_API_KEY=your_brevo_api_key

# Cloudflare Turnstile
TURNSTILE_SECRET_KEY=your_turnstile_secret

# MinIO configuration
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=matrix-media

# Service port
PORT=3000

# Log level
LOG_LEVEL=info

# Node environment
NODE_ENV=development
```

#### Environment Variable Validation
All projects must implement environment variable validation, checking if required variables exist at startup:

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DB_HOST: z.string(),
  DB_PORT: z.string().regex(/^\d+$/),
  DB_USER: z.string(),
  DB_PASSWORD: z.string().min(8),
  DB_NAME: z.string(),
  JWT_SECRET: z.string().min(32),
  // ... other variables
});

export const env = envSchema.parse(process.env);
```

---

## 5. Testing Standards

### 5.1 Test Coverage Requirements

- Core business logic (Services): Minimum 80% coverage
- API routes: Minimum 70% coverage
- Utility functions: Minimum 90% coverage
- React components: Minimum 60% coverage

### 5.2 Test Types

#### Unit Tests
- Test independent functions and class methods
- Use Jest (Node.js/React) or pytest (Python)
- Must mock external dependencies (database, Redis, HTTP requests)

#### Integration Tests
- Test multiple modules working together
- Use real test database (automatically created and cleaned)
- Test complete API end-to-end processes

#### E2E Tests
- Test complete user operation workflows
- Use Playwright to test frontend interactions
- Critical workflows must have E2E coverage (registration, login, banning, etc.)

### 5.3 Test Naming Standards

```typescript
// Unit test example
describe('BanService', () => {
  describe('banUser', () => {
    it('should successfully ban user with valid data', async () => {
      // Test normal ban
    });

    it('should throw error when user does not exist', async () => {
      // Test user doesn't exist scenario
    });

    it('should invalidate cache after banning', async () => {
      // Test cache invalidation
    });
  });
});
```

### 5.4 Test Run Commands

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testMatch='**/*.integration.test.ts'",
    "test:e2e": "playwright test"
  }
}
```

---

## 6. Documentation Standards

### 6.1 Code Documentation

#### API Documentation Comments
```typescript
/**
 * Ban user
 * 
 * @param userId - User's database ID
 * @param banType - Ban type: silence (mute), soft_ban (soft ban), hard_ban (hard ban)
 * @param options - Ban options
 * @param options.reason - Ban reason, required
 * @param options.durationHours - Ban duration (hours), blank means permanent
 * @param options.violationLevel - Violation level: minor, normal, severe
 * @param options.adminId - Administrator ID executing the ban
 * @returns Promise<number> Ban record ID
 * 
 * @throws {Error} Throws when database operation fails
 * 
 * @example
 * ```typescript
 * const banId = await banService.banUser(123, 'hard_ban', {
 *   reason: 'Posting prohibited content',
 *   durationHours: 72,
 *   violationLevel: 'severe',
 *   adminId: 'admin_001'
 * });
 * ```
 */
async banUser(
  userId: number,
  banType: 'silence' | 'soft_ban' | 'hard_ban',
  options: BanUserOptions
): Promise<number>
```

### 6.2 Project Documentation

#### Required Documentation
- `README.md`: Project overview, quick start, basic usage
- `ARCHITECTURE.md`: System architecture design
- `API.md`: Complete API endpoint documentation
- `DATABASE_SCHEMA.md`: Database table structure description
- `DEPLOYMENT.md`: Deployment guide
- `CONTRIBUTING.md`: Contribution guide
- `CHANGELOG.md`: Version change record

#### API Documentation Format
```markdown
## POST /api/v1/bans

Ban user

### Request

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>`

**Body:**
```json
{
  "userId": 123,
  "banType": "hard_ban",
  "reason": "Violated community guidelines",
  "durationHours": 72,
  "violationLevel": "severe"
}
```

### Response

**Success (200 OK):**
```json
{
  "success": true,
  "banId": 456
}
```

**Error (400 Bad Request):**
```json
{
  "error": "Invalid ban type"
}
```

### Permission Requirements
- Requires administrator permissions

### Side Effects
- Clear user cache
- Publish Pub/Sub event
- If hard ban, disconnect all user connections
```

---

## 7. Security Standards

### 7.1 Password and Sensitive Information Handling

#### Password Storage
- All user passwords must use bcrypt encryption, minimum work factor 12
- Secondary passwords also use bcrypt encryption
- Prohibit outputting any passwords or key information in logs
- Prohibit exposing specific reasons for password verification failure in error messages

```typescript
// Correct Example
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Incorrect Example - Don't do this
console.log('User password:', userPassword); // Prohibited
throw new Error(`Password too short: ${password}`); // Prohibited
```

#### Sensitive Configuration Management
- All sensitive configurations (API Keys, database passwords, etc.) must be passed through environment variables
- Prohibit hardcoding any sensitive information in code
- `.env` files must be added to `.gitignore`
- Provide `.env.example` as configuration template

```bash
# .gitignore
.env
.env.local
.env.*.local
*.pem
*.key
secrets/
```

#### JWT Token Security
- JWT Secret must be at least 32 character random string
- Token expiration time no more than 24 hours
- Refresh token expiration time no more than 7 days
- Use `HttpOnly` Cookie in response headers to store tokens (optional)

```typescript
// Correct Example
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!; // At least 32 characters
const JWT_EXPIRES_IN = '24h';

function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'matrix-dashboard',
  });
}

function verifyToken(token: string): { userId: number } {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number };
  } catch (error) {
    throw new Error('Invalid token');
  }
}
```

### 7.2 SQL Injection Protection

#### Parameterized Queries
- All database queries must use parameterized queries
- Prohibit using string concatenation to build SQL statements
- When using ORM, must use safe query methods

```typescript
// Correct Example
const result = await pool.query(
  'SELECT * FROM users WHERE username = $1',
  [username]
);

// Incorrect Example - Don't do this
const result = await pool.query(
  `SELECT * FROM users WHERE username = '${username}'`
); // SQL injection risk
```

#### Dynamic Table/Column Name Handling
If dynamic table or column names must be used, must use whitelist validation:

```typescript
const ALLOWED_SORT_COLUMNS = ['created_at', 'username', 'email'];

function buildSortQuery(sortBy: string): string {
  if (!ALLOWED_SORT_COLUMNS.includes(sortBy)) {
    throw new Error('Invalid sort column');
  }
  return `ORDER BY ${sortBy}`;
}
```

### 7.3 XSS Protection

#### Input Validation
- All user input must be validated
- Use validation libraries (like Zod, Joi) to define input schemas
- Reject inputs that don't match format

```typescript
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

// Validate user input
try {
  const validData = registerSchema.parse(req.body);
  // Use validData
} catch (error) {
  res.status(400).json({ error: 'Invalid input' });
}
```

#### Output Escaping
- React escapes output by default, but must manually clean when using `dangerouslySetInnerHTML`
- Use DOMPurify to clean HTML content
- Text content in API responses doesn't need escaping (JSON handles automatically)

```typescript
import DOMPurify from 'dompurify';

// Correct Example
function SafeHTML({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

### 7.4 CSRF Protection

#### For State-Changing Operations
- All POST/PUT/DELETE requests must verify CSRF Token (if using Cookie authentication)
- If using JWT Bearer Token, CSRF Token not needed
- When Dashboard frontend and backend deploy under same domain, use SameSite Cookie

```typescript
// Express configuration
import cookieParser from 'cookie-parser';
import csrf from 'csurf';

app.use(cookieParser());
app.use(csrf({ cookie: true }));

// Include CSRF Token in response
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

### 7.5 Permission Control

#### Role Verification
- All administrative operations must verify user is administrator
- Use middleware to uniformly handle permission checks
- Return 403 Forbidden when permissions insufficient

```typescript
// middleware/auth.ts
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user; // Assume already verified via JWT

  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

// Use middleware
router.post('/bans', requireAdmin, banController.create);
```

#### Data Access Control
- Users can only access their own data (unless administrator)
- Verify user permissions before querying database
- Use row-level security policies (PostgreSQL RLS) for enhanced protection

---

## 8. Performance Optimization Standards

### 8.1 Database Optimization

#### Index Strategy
- All foreign key columns must create indexes
- Frequently queried columns (like username, email) must create indexes
- Create composite indexes for composite queries
- Regularly analyze index usage, delete unused indexes

```sql
-- Correct Example
CREATE INDEX idx_user_profiles_email ON dashboard.user_profiles(email);
CREATE INDEX idx_user_bans_active ON dashboard.user_bans(user_id, status, expires_at);

-- View index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

#### Query Optimization
- Avoid SELECT *, only query needed columns
- Use LIMIT to limit returned result count
- Use pagination for large data volume queries
- Use EXPLAIN ANALYZE to analyze slow queries

```typescript
// Correct Example
const users = await pool.query(
  `SELECT id, username, email, user_group 
   FROM dashboard.user_profiles 
   WHERE status = $1 
   ORDER BY created_at DESC 
   LIMIT $2 OFFSET $3`,
  ['active', pageSize, offset]
);

// Incorrect Example - Don't do this
const users = await pool.query('SELECT * FROM dashboard.user_profiles'); // Unlimited query
```

#### Connection Pool Configuration
```typescript
// Correct connection pool configuration
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000, // Idle connection timeout
  connectionTimeoutMillis: 2000, // Connection timeout
});
```

### 8.2 Cache Strategy

#### Redis Cache Standards
- High-frequency query data must be cached
- Set reasonable TTL, avoid permanent caching
- Cache key naming standard: `resource_type:ID:subtype`
- Use Redis Pipeline for batch operations

```typescript
// Correct Example
class CacheService {
  private readonly USER_ROUTING_TTL = 300; // 5 minutes
  private readonly USER_PROFILE_TTL = 1800; // 30 minutes

  async getUserRouting(userId: number): Promise<any> {
    const key = `user:${userId}:routing`;
    const cached = await redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.loadFromDatabase(userId);
    await redis.setex(key, this.USER_ROUTING_TTL, JSON.stringify(data));
    
    return data;
  }

  // Batch get
  async batchGetUserRouting(userIds: number[]): Promise<any[]> {
    const keys = userIds.map(id => `user:${id}:routing`);
    const results = await redis.mget(keys);
    
    return results.map((r, i) => {
      if (r) return JSON.parse(r);
      return null;
    });
  }
}
```

#### Cache Invalidation Strategy
- Delete corresponding cache immediately when data updates
- Use Pub/Sub to notify other instances to clear cache
- Set TTL as fallback mechanism

### 8.3 API Performance

#### Pagination
- All list interfaces must implement pagination
- Use cursor pagination instead of offset pagination (large data volumes)
- Default 20 items per page, maximum 100 items

```typescript
interface PaginationParams {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

async function getUsers(params: PaginationParams) {
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 20, 100);
  const offset = (page - 1) * pageSize;

  const result = await pool.query(
    `SELECT id, username, email FROM users 
     ORDER BY created_at DESC 
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  const total = await pool.query('SELECT COUNT(*) FROM users');

  return {
    data: result.rows,
    pagination: {
      page,
      pageSize,
      total: parseInt(total.rows[0].count),
      totalPages: Math.ceil(total.rows[0].count / pageSize),
    },
  };
}
```

#### Response Compression
```typescript
import compression from 'compression';

app.use(compression());
```

#### Concurrency Control
- Use rate limiting to prevent API abuse
- Set stricter limits for critical interfaces (login, registration)

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Maximum 100 requests
  message: 'Too many requests, please try again later',
});

app.use('/api/', limiter);

// Stricter login interface
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

app.post('/api/auth/login', loginLimiter, authController.login);
```

### 8.4 Frontend Performance

#### Code Splitting
```typescript
// React lazy loading
import { lazy, Suspense } from 'react';

const Users = lazy(() => import('./pages/Users'));
const Appeals = lazy(() => import('./pages/Appeals'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/users" element={<Users />} />
        <Route path="/appeals" element={<Appeals />} />
      </Routes>
    </Suspense>
  );
}
```

#### Image Optimization
- Use modern image formats (WebP)
- Image lazy loading
- Set appropriate dimensions and quality

#### Bundle Size Control
```json
// package.json
{
  "scripts": {
    "build": "vite build",
    "analyze": "vite-bundle-visualizer"
  }
}
```

---

## 9. Error Handling Standards

### 9.1 Backend Error Handling

#### Unified Error Handling Middleware
```typescript
// middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    logger.warn('Operational error:', {
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
    });

    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Unexpected error
  logger.error('Unexpected error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    error: 'Internal server error',
  });
}
```

#### Usage Example
```typescript
// Throw errors in business logic
if (!user) {
  throw new AppError(404, 'User not found');
}

if (!user.isAdmin) {
  throw new AppError(403, 'Admin access required');
}

// Catch asynchronous errors in routes
router.post('/bans', async (req, res, next) => {
  try {
    const result = await banService.banUser(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
```

### 9.2 Frontend Error Handling

#### Global Error Boundary
```typescript
// components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    logger.error('React error boundary caught:', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Error occurred</h1>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

#### API Error Handling
```typescript
// services/api.ts
import axios from 'axios';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      // Server returned error
      const message = error.response.data.error || 'Request failed';
      toast.error(message);
    } else if (error.request) {
      // Network error
      toast.error('Network error, please check your connection');
    } else {
      toast.error('Unexpected error occurred');
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

## 10. Logging Standards

### 10.1 Log Levels

- **ERROR**: Errors requiring immediate handling
- **WARN**: Warnings, potential issues
- **INFO**: Regular information, key business processes
- **DEBUG**: Debug information, development environment only

### 10.2 Log Format

```typescript
// utils/logger.ts
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 10,
    }),
  ],
});

// Development environment output to console
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}
```

### 10.3 Log Content Standards

#### Must Record Information
- All administrative operations (bans, unbans, etc.)
- User authentication events (login, logout)
- Database errors
- External API call failures
- Security-related events (multiple login failures, etc.)

#### Prohibited Record Information
- User passwords (plaintext or encrypted)
- JWT Token complete content
- API Keys or other secrets
- Personal sensitive information (unless necessary and compliant with privacy policy)

#### Examples
```typescript
// Correct Example
logger.info('User banned', {
  userId: user.id,
  banType: 'hard_ban',
  reason: 'violation',
  adminId: admin.id,
});

logger.error('Database query failed', {
  query: 'SELECT users WHERE...',
  error: error.message,
  duration: 150,
});

// Incorrect Example - Don't do this
logger.info('User login', {
  username: user.username,
  password: user.password, // Prohibited
});

logger.debug('JWT token', {
  token: fullToken, // Prohibited
});
```

---

## 11. Deployment and CI/CD Standards

### 11.1 Dockerization

#### Dockerfile Example
```dockerfile
# Dashboard Backend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

#### docker-compose.yml Production Configuration
```yaml
version: '3.8'

services:
  dashboard-backend:
    build: ./dashboard
    restart: always
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      REDIS_HOST: redis
    depends_on:
      - postgres
      - redis
    networks:
      - matrix-network

  postgres:
    image: postgres:15
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    networks:
      - matrix-network

  redis:
    image: redis:7-alpine
    restart: always
    networks:
      - matrix-network

networks:
  matrix-network:
    driver: bridge

volumes:
  postgres_data:

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### 11.2 CI/CD Process

#### GitHub Actions Example
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: dashboard/package-lock.json
      
      - name: Install dependencies
        working-directory: ./dashboard
        run: npm ci
      
      - name: Run linter
        working-directory: ./dashboard
        run: npm run lint
      
      - name: Run tests
        working-directory: ./dashboard
        run: npm test -- --coverage
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          REDIS_HOST: localhost
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  test-frontend:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: dashboard/frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: ./dashboard/frontend
        run: npm ci
      
      - name: Run linter
        working-directory: ./dashboard/frontend
        run: npm run lint
      
      - name: Build
        working-directory: ./dashboard/frontend
        run: npm run build
```

---

## 12. Development Tools and Configuration

### 12.1 VS Code Configuration

#### settings.json
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.eol": "\n",
  "files.insertFinalNewline": true,
  "files.trimTrailingWhitespace": true,
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.workingDirectories": ["./dashboard", "./dashboard/frontend"],
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "python.linting.enabled": true,
  "python.linting.mypyEnabled": true
}
```

### 12.2 package.json Script Standards

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "db:migrate": "node scripts/migrate.js",
    "db:seed": "node scripts/seed.js"
  }
}
```

---

## 13. Common Issues and Best Practices

### 13.1 Cross-Platform Development Considerations

#### Windows Developer Must-Read
- Use Git Bash or WSL2 to execute shell scripts
- Ensure Git configuration `core.autocrlf = true`
- Use Docker Desktop to run database services
- Pay attention to path separator differences (use `path.join()` instead of string concatenation)

```typescript
// Correct Example
import path from 'path';
const logPath = path.join(__dirname, '..', 'logs', 'app.log');

// Incorrect Example - Windows and Linux path incompatibility
const logPath = __dirname + '/../logs/app.log';
```

### 13.2 Performance Monitoring

#### Key Metrics
- API response time (P50, P95, P99)
- Database query time
- Redis cache hit rate
- Memory usage rate
- CPU usage rate

#### Recommended Monitoring Tools
- Logs: Winston + Elasticsearch + Kibana
- APM: Prometheus + Grafana
- Error tracking: Sentry

### 13.3 Code Review Checklist

- [ ] Code complies with project coding standards
- [ ] All new features have corresponding tests
- [ ] Test coverage meets standards
- [ ] No ESLint/TypeScript errors
- [ ] Sensitive information removed
- [ ] API response time within acceptable range
- [ ] Error handling complete
- [ ] Logging reasonable
- [ ] Documentation updated
- [ ] Database migration scripts can be rolled back

---

## 14. Appendix

### 14.1 Recommended Learning Resources

- TypeScript official documentation: https://www.typescriptlang.org/docs/
- Node.js best practices: https://github.com/goldbergyoni/nodebestpractices
- React official documentation: https://react.dev/
- PostgreSQL official documentation: https://www.postgresql.org/docs/
- Redis official documentation: https://redis.io/docs/

### 14.2 Useful Tools

- API testing: Thunder Client / Postman
- Database management: DBeaver / pgAdmin
- Redis management: RedisInsight
- Log viewing: Logtail / Papertrail
- Performance analysis: Chrome DevTools / Lighthouse

### 14.3 Contact Information

For any questions about code standards, please contact project maintainers or raise them in project Issues.

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-23  
**Maintainer**: KevinEliasSparks
**Administrators**: shijianus; KevinSmart520; dfcpvq
**Studio**: DragonFloatingClub
**Maintainer Email**: shijian.us@gmail.com
**Studio Personal Email**: privchat@outlook.com
**Studio Dedicated Email**: feedback@831511.xyz
**Studio Website**: https://831511.xyz

### 14.4 Technical Watermark

Allowed to use maintainer, administrator, and studio names as core variable names. For differentiation, code can be written from different perspectives (using different styles).

### 15.1 Essential Reading

If you have any uncertainties while reviewing the REQUEST.md document, prioritize asking the user for clarification on the actual steps to take. For specific requirements, refer to the REQUEST.md in detail. Please pay attention to configuration compatibility issues and make sure to read the ATTENTION.md file. Finally, to understand known or recommended configuration methods, review the ADVICE.md and GUIDE.md documents.