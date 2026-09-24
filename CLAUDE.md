# vf-clamp-cli — Claude Code Configuration

## Inherited Context
This is a plugin submodule of `@overpunch/vf-clamp`. When working inside the
vf-clamp parent repo checkout, Claude Code will also load `vf-clamp/CLAUDE.md` which
defines the core purpose, API, name table patching approach, and shared conventions.

If working in this repo standalone, read `README.md` for the full context.

## What This Is
A Node.js CLI (`vf-clamp` command) that wraps `@overpunch/vf-clamp`. Font engineers
can restrict variable fonts from the terminal without writing any JavaScript.

## Tech Stack
- TypeScript, ES modules
- Node.js 18+
- commander.js for argument parsing
- `@overpunch/vf-clamp` as the processing engine

## Key Files
| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point, program setup |
| `src/commands/instances.ts` | `vf-clamp instances` command |
| `src/commands/clamp.ts` | `vf-clamp clamp` command |
| `src/utils/font.ts` | File I/O helpers |

## Coding Standards
- Tabs for indentation
- One-line summary comment at top of each file
- Comment every function
- ALL_CAPS for constants
- No extra abstractions — solve the problem directly

## Build & Run
```bash
npm install
npm run build
node dist/index.js --help
```

## Publishing
```bash
npm run build
npm publish --access public
```

## Engineers to Contact If Stuck
See `vf-clamp/CLAUDE.md` → Community section.
For CLI/UX questions specifically: Simon Cozens (@simoncozens), Cosimo Lupo (@anthrotype).
