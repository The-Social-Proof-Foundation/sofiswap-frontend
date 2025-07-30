# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Next.js
- `npm run dev:watch` - Start development server with nodemon file watching (watches app/, components/, lib/, hooks/ directories)
- `npm run build` - Build the application for production (static export)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Build Configuration
- Project is configured for static export (`output: 'export'` in next.config.js)
- ESLint errors are ignored during builds (`ignoreDuringBuilds: true`)
- Images are unoptimized for static export compatibility

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15.4.4 with TypeScript
- **UI Components**: Radix UI with custom shadcn/ui components
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **State Management**: React hooks with context providers
- **Data Fetching**: Apollo Client (GraphQL) and custom MySocial client
- **Email Service**: Resend for transactional emails
- **Animations**: GSAP and Framer Motion
- **Forms**: React Hook Form with Zod validation

### Project Structure
- `app/` - Next.js App Router pages and API routes
  - `app/api/send-welcome-email/` - Resend email API endpoint
  - `app/api/fullnode/` - MySocial network proxy
- `components/` - Reusable UI components
  - `components/ui/` - shadcn/ui base components (40+ components available)
  - `components/sections/` - Page section components
- `lib/` - Utility libraries and providers
  - `lib/resend.ts` - Email service utilities using Resend
- `hooks/` - Custom React hooks

### Key Architecture Patterns

#### Network Configuration
The app supports multiple network environments (mainnet, testnet, localnet) through:
- Cookie-based network selection (`selectedNetwork` cookie)
- Dynamic GraphQL endpoint switching in Apollo Client (`lib/apollo-client.tsx:13-33`)
- MySocial client configuration (`lib/myso-client.tsx`)

#### Theming System
- Dark/light theme support with `next-themes`
- CSS custom properties defined in `app/globals.css`
- Theme-aware favicon switching (`components/theme-favicon.tsx`)
- Default theme is dark mode

#### Client Architecture
- **Apollo Client**: GraphQL client with error handling, logging, and network-only fetch policy
- **MySocial Client**: Custom client for MySocial network interactions via `/api/fullnode/` proxy
- Both clients use singleton patterns with factory functions for recreation

#### Authentication
- Google Auth integration (`hooks/useGoogleAuth.ts`)
- Universal Auth system (`hooks/useUniversalAuth.ts`)
- Currently commented out in layout but infrastructure is ready

### Component Conventions
- All UI components follow shadcn/ui patterns with Radix UI primitives
- Components use `forwardRef` and proper TypeScript typing
- Styling uses Tailwind classes with CSS custom properties for theming
- Form components integrate with React Hook Form

### Development Notes
- The project uses path aliases (`@/*` maps to root directory)
- TypeScript strict mode is enabled
- Currently shows a "Coming Soon" landing page with countdown timer and email signup
- Apollo Client wrapper is commented out in layout but ready for GraphQL features