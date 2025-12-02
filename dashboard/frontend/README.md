# Matrix Dashboard Frontend

React/TypeScript frontend for the Matrix Synapse Dashboard administrative management system.

## Features

- **Modern React Architecture**: Built with React 18, TypeScript, and Vite
- **Responsive Design**: Tailwind CSS with mobile-first approach
- **State Management**: Zustand for lightweight, scalable state management
- **Authentication**: JWT-based auth with role-based access control (RBAC)
- **API Integration**: Axios-based service layer with error handling
- **Component Library**: Reusable UI components with consistent design
- **Development Tools**: Hot reload, TypeScript strict mode, ESLint

## Technology Stack

- **Core**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + Headless UI
- **State**: Zustand
- **Routing**: React Router v6
- **Data Fetching**: Axios + React Query
- **Forms**: React Hook Form + Zod validation
- **Testing**: Vitest + React Testing Library
- **Icons**: Heroicons
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Project Structure

```
src/
├── components/
│   ├── ui/             # Basic UI elements (Button, Input, Modal)
│   ├── layout/         # Layout components (Header, Sidebar, Footer)
│   └── features/       # Feature-specific components
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── store/              # Zustand state management
├── services/           # API service layer
├── types/              # TypeScript definitions
├── utils/              # Utility functions
└── styles/             # Global styles and Tailwind config
```

## Authentication

The dashboard uses JWT-based authentication with role-based access control (RBAC):

### User Roles
- **Super Admin**: Full system access
- **Admin**: Administrative access to most features
- **Moderator**: Content moderation capabilities
- **Operator**: Limited operational access
- **Viewer**: Read-only access

## API Integration

The frontend communicates with the backend API through a centralized service layer:

```typescript
import { apiService } from '../services/api';

// Get users with pagination and filtering
const users = await apiService.getUsers(
  { page: 1, limit: 20 },
  { search: 'john', userGroup: 'premium' }
);
```

## Docker Deployment

Build and run with Docker:

```bash
# Build image
docker build -t matrix-dashboard-frontend .

# Run container
docker run -p 5173:5173 matrix-dashboard-frontend
```

## Status

**Current Version**: 1.0.0-alpha
**Status**: Foundation complete, ready for backend integration

### Completed Features
- ✅ React + TypeScript setup
- ✅ Tailwind CSS configuration
- ✅ Authentication store (Zustand)
- ✅ API service layer
- ✅ Basic UI components
- ✅ Docker configuration
- ✅ Project structure

### Next Steps
- Connect to backend API
- Implement user management pages
- Add ban control interface
- Create appeal processing workflow
- Add real-time updates

## License

This project is part of the Matrix Synapse Dashboard system.
