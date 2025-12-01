# Project Context for Claude Agents

This file provides essential context for Claude agents working on this codebase.

## Project Overview

**SolidWorks PDM to Onshape Migration Toolkit** - A comprehensive Node.js toolset for migrating ~24,000 files from SolidWorks PDM Pro to Onshape, including parts, assemblies, drawings, and related documents.

Originally started from Onshape's API key sample apps, this repo has evolved into a full enterprise migration solution.

## Migration Stats
- **Total files**: ~23,811
- **SolidWorks Parts**: 4,578 (1,793 standalone + 2,785 assembly parts)
- **SolidWorks Assemblies**: 1,370 (607 top-level + 763 sub-assemblies)
- **SolidWorks Drawings**: 4,134
- **Other files**: 13,729 (PDFs, STEP, Excel, DWG, etc.)

## Repository Structure

```
apikey/
├── Node/
│   ├── config/
│   │   ├── apikey.js             # Your API credentials (create from apikeyexample.js)
│   │   ├── apikeyexample.js      # Template for credentials
│   │   └── errors.js             # Error handling
│   ├── lib/
│   │   ├── app.js                # High-level Onshape operations
│   │   ├── onshape.js            # Low-level API client (HMAC auth)
│   │   └── util.js               # Utilities
│   │
│   │  ## MIGRATION SCRIPTS
│   ├── categorizeFiles.js        # Parse PDM export, categorize by type & dependencies
│   ├── uploadStandaloneParts.js  # Upload parts not in assemblies (master parts)
│   ├── uploadAssemblies.js       # Upload Pack & Go ZIPs
│   ├── relinkAssemblies.js       # Relink duplicates to master parts
│   ├── generatePackAndGoList.js  # Generate list for SolidWorks Pack & Go
│   │
│   │  ## PDM TOOLS
│   ├── bulkUploadFromExcel.js    # Bulk upload from Excel with properties & release
│   ├── releaseDocument.js        # Release all elements in a document
│   ├── getProperties.js          # Fetch properties for all elements
│   ├── getFolders.js             # List all folders
│   ├── apiTest.js                # API diagnostics
│   │
│   │  ## ORIGINAL SAMPLES
│   ├── massByMaterial.js         # Calculate mass by material
│   ├── uploadBlob.js             # Upload single file
│   ├── getDocuments.js           # List documents
│   ├── exportStl.js              # Export STL
│   │
│   ├── PDM/                      # Migration data & scripts
│   │   ├── MigrationPlan.md      # Detailed migration strategy
│   │   ├── references.csv        # PDM reference export (13k+ rows)
│   │   ├── assemblies_to_pack.csv # Assemblies for Pack & Go
│   │   ├── pdmExportReferences.sql # SQL query for PDM
│   │   ├── generatePackAndGo.ps1 # PowerShell for Pack & Go automation
│   │   └── Upload List.xlsx      # Master file list
│   │
│   └── output/                   # Generated categorization files
│       ├── standaloneParts.json
│       ├── assemblyParts.json
│       ├── topLevelAssemblies.json
│       ├── subAssemblies.json
│       ├── assemblyTrees.json
│       └── uploadOrder.json
│
├── claude-progress.txt           # Agent progress tracking
├── CLAUDE.md                     # This file
└── README.md                     # Original Onshape docs
```

## Migration Workflow

See `Node/PDM/MigrationPlan.md` for full details.

### Phase 1: Extract & Categorize (DONE)
```bash
node categorizeFiles.js -r PDM/references.csv -d "PDM/Upload List.xlsx" -o output/
```

### Phase 2: Upload Parts First
Upload all 4,578 parts as master copies:
```bash
node uploadStandaloneParts.js -i output/standaloneParts.json -f <folderId> --release
```

### Phase 3: Pack & Go Assemblies
Run PowerShell script in SolidWorks to create ZIPs:
```powershell
./PDM/generatePackAndGo.ps1
```

### Phase 4: Upload Assemblies
```bash
node uploadAssemblies.js -i manifest.json -f <folderId>
```

### Phase 5: Relink to Master Parts
Replace duplicates with references to masters:
```bash
node relinkAssemblies.js -a assemblyImportMapping.json -p partMapping.json
```

### Phase 6: Release & Drawings
Release assemblies, then upload drawings.

## Key Technical Details

- **Runtime**: Node.js v20
- **Authentication**: HMAC-SHA256 signed API requests
- **API Base**: `cad.onshape.com`
- **Company ID**: `6763516217765c31f9561958`
- **Target Folder**: `af89b4c072a8fb45084e1757`

## Key Onshape API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /blobelements/...` | Upload files |
| `POST /releasepackages/release/{wfid}` | Create release |
| `GET /assemblies/.../definition` | Get assembly structure |
| `POST /elements/.../updatereferences` | Relink parts |
| `DELETE /elements/...` | Delete duplicates |

## Property ID Map (in bulkUploadFromExcel.js)
Maps 40+ Onshape property names to IDs including:
- Part number, Revision, Description, Vendor
- Custom: ECO, Status, ECO Priority, etc.

## Agent Workflow

This project uses the long-running agent harness pattern:

1. **Read `claude-progress.txt` first** - Understand current state
2. **Update progress regularly** - Document what's done and next steps
3. **Commit frequently** - Small, logical commits
4. **Prepare for handoff** - Write notes for next context window

## Important Files to Check

When starting a new session:
- `claude-progress.txt` - Current task state
- `Node/PDM/MigrationPlan.md` - Overall strategy
- `git log --oneline -10` - Recent changes
- `git status` - Uncommitted work

## API Key Security

- Never commit actual API keys
- Use `config/apikey.js` for credentials (gitignored)
