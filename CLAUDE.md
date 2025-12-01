# Project Context for Claude Agents

This file provides essential context for Claude agents working on this codebase.

## Project Overview

**Onshape API Key Sample Apps** - A collection of Node.js sample applications demonstrating Onshape API key authentication and usage.

## Repository Structure

```
apikey/
├── Node/                    # Node.js sample applications
│   ├── config/              # Configuration files (API keys go here)
│   │   ├── apikey.js        # Your API credentials (create from apikeyexample.js)
│   │   ├── apikeyexample.js # Template for API credentials
│   │   └── errors.js        # Error handling utilities
│   ├── lib/                 # Shared libraries
│   │   ├── app.js           # Application utilities
│   │   ├── onshape.js       # Onshape API client
│   │   └── util.js          # General utilities
│   ├── example/             # Example files for testing
│   ├── massByMaterial.js    # Sample: Calculate mass by material
│   ├── expensiveDoNothing.js # Sample: Create/delete element demo
│   ├── uploadBlob.js        # Sample: Upload file as blob
│   ├── getDocuments.js      # Sample: List documents
│   ├── exportStl.js         # Sample: Export part studio as STL
│   └── package.json         # Node.js dependencies
├── claude-progress.txt      # Agent progress tracking file
├── CLAUDE.md                # This file - project context
└── README.md                # Main project documentation
```

## Key Technical Details

- **Runtime**: Node.js (v20 recommended)
- **Authentication**: HMAC-SHA256 signed API requests
- **API Base**: `cad.onshape.com` (configurable)

## Development Commands

```bash
# Install dependencies
cd Node && npm install

# Run a sample app
node Node/<app-name>.js --usage  # Show usage info
node Node/getDocuments.js        # Example: list documents
```

## Agent Workflow

This project uses the long-running agent harness pattern. When working on tasks:

1. **Always read `claude-progress.txt` first** - Understand the current state
2. **Update progress regularly** - Document what you've done and what's next
3. **Commit frequently** - Small, logical commits with clear messages
4. **Prepare for handoff** - Write notes for the next context window

## Important Files to Check

When starting a new session:
- `claude-progress.txt` - Current task state and history
- `git log --oneline -10` - Recent changes
- `git status` - Uncommitted work

## API Key Security

- Never commit actual API keys
- Use `config/apikey.js` for credentials (gitignored)
- The `config/apikeyexample.js` is a template only
