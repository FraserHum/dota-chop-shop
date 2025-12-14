# Agent Guidelines for dota-chop-shop

**IMPORTANT**: Use the correct directory: `/Users/fraser/workspace/github.com/fraserhum/dota-chop-shop` (NOT frasershop)

## Build/Test/Lint Commands

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/buildProgression.test.ts

# Run single test by name pattern
bun test --match "*respects stage-specific itemCount*"

# Type check
bun x tsc --noEmit

# Run CLI locally
bun run src/cli/index.ts progression -t 1500,2500

# Install dependencies
bun install
```

## Code Style Guidelines

**Imports**: Group imports in three sections (stdlib → local): `import { ... } from "module"; import { ... } from "../path";`

**Formatting**: 80-120 char lines, 2-space indent. Use TypeScript strict mode.

**Types**: Explicit readonly interfaces; avoid `any`; prefer union types over overloads.

**Naming**: camelCase for functions/variables; PascalCase for types/interfaces; snake_case for data keys (item names).

**Error Handling**: Return `{ error: string }` from helpers; use typed Result types for operations.

**Functions**: Max 2 args → use options object per Deno style guide; pure functions preferred; document complex logic.

**Files**: One concept per file; tests in `__tests__/` parallel source structure; use `_testing` export for test-only helpers.

## No Custom Rules

No `.cursorrules`, `.cursor/rules/`, or copilot instructions exist. Follow standard TypeScript best practices.
