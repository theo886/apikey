# SolidWorks PDM to Onshape Migration Plan

## Data Summary (from categorization)
- **Total files**: 23,811
- **SolidWorks Parts**: 4,578 (1,793 standalone + 2,785 assembly parts)
- **SolidWorks Assemblies**: 1,370 (607 top-level + 763 sub-assemblies)
- **SolidWorks Drawings**: 4,134
- **Other files**: 13,729 (PDFs, STEP, Excel, DWG, etc.)
- **PDM System**: SolidWorks PDM Pro (SQL Server)

## Requirements
- **No duplicates**: Single source of truth for each part
- **Positions preserved**: Parts must be in correct 3D positions in assemblies
- **Mates not needed**: Geometry only, constraints can be rebuilt
- **Each part in own document**: Parts should NOT be embedded in assembly documents
- **Related files grouped**: PDFs, STEP, Excel files grouped with parts by prefix (before first `.` or `-`)

## Document Naming Convention
Files are grouped into documents by **everything before the first `.` or `-`**:
```
90865.SLDPRT   ─┐
90865.PDF      ─┼─► Document "90865"
90865.STEP     ─┘

123456.SLDPRT  ─┐
123456-01.PDF  ─┼─► Document "123456"
123456.DXF     ─┘
```

## Pre-Upload Verification
Before uploading, generate `uploadPlan.xlsx` spreadsheet with columns:
- **Upload Order**: Sequence number
- **Document Name**: Prefix used for grouping
- **File Name**: Individual file
- **File Type**: SLDPRT, PDF, STEP, etc.
- **File Path**: Source location

User reviews spreadsheet before proceeding with upload.

---

# Final Recommended Approach: Parts-First Upload-Then-Relink

## Phase 1: Extract & Categorize (DONE)
- ✅ Exported references from PDM Pro → `references.csv`
- ✅ Categorized files → `output/*.json`

## Phase 2: Group Files by 5-Digit Prefix
Create document groups matching files by first 5 characters of filename:
- Input: All 23,811 files from Upload List
- Output: `documentGroups.json` mapping prefix → [files]
- Example: `"90865" → ["90865.SLDPRT", "90865.PDF", "90865.STEP"]`

## Phase 3: Upload ALL Parts First
Upload **all 4,578 parts** (not just standalone) with related files:
1. For each part, create document named by 5-digit prefix
2. Upload the .SLDPRT file
3. Upload any related files (PDF, STEP, Excel) to same document
4. Release the part
5. Track mapping: `{ prefix: { documentId, elementId, partId } }`

**Why all parts first?** Parts used in multiple assemblies need a single master. Pack & Go creates duplicates - uploading parts first ensures one source of truth.

## Phase 4: Upload Assemblies with Pack & Go
For each assembly (bottom-up order - sub-assemblies before parents):
1. Use SolidWorks Pack & Go to create ZIP (preserves positions)
2. Upload ZIP to Onshape in its own document
3. This creates duplicates of parts already uploaded in Phase 3
4. Track which elements were created

## Phase 5: Relink Assemblies to Master Parts
For each assembly:
1. Get assembly definition (list of instances)
2. For each instance that references a duplicate part:
   - Match by filename to find master part from Phase 3
   - Use `updatereferences` API to point to master
3. Delete the duplicate part elements from assembly document

## Phase 6: Release Assemblies
After relinking, release all assemblies

## Phase 7: Upload Drawings
Upload drawings after assemblies are released

## Implementation Scripts

### 1. `pdmExportReferences.sql` ✅
SQL query for PDM Pro to extract assembly→part relationships

### 2. `categorizeFiles.js` ✅
- Parse PDM reference export
- Categorize into: standalone parts, assembly parts, assemblies
- Generate upload order

### 3. `groupFilesByPrefix.js` (NEW)
- Group all files by prefix (everything before first `.` or `-`)
- Output: `documentGroups.json` and **`uploadPlan.xlsx`**
- Spreadsheet columns: Upload Order, Document Name, File Name, File Type, File Path
- User reviews spreadsheet before proceeding

### 4. `uploadAllParts.js` (UPDATE from uploadStandaloneParts.js)
- Reads `documentGroups.json` for upload plan
- Upload ALL parts (4,578) not just standalone
- For each document group:
  - Create document named by prefix
  - Upload .SLDPRT first
  - Upload related files (PDF, STEP, etc.) to same document
  - Release
- Save mapping to `partMapping.json`

### 5. `generatePackAndGo.ps1` ✅
- For each assembly, run Pack & Go via SolidWorks API
- Save ZIPs to output folder

### 6. `uploadAssemblies.js` ✅
- Upload Pack & Go ZIPs to Onshape (each in own document)
- Track created elements
- Save to `assemblyImportMapping.json`

### 7. `relinkAssemblies.js` ✅
- For each assembly, get definition
- Match instances to master parts by filename
- Use `updatereferences` to relink to masters
- Delete duplicate elements from assembly document

### 8. `releaseAssemblies.js`
- Release all assemblies after relinking

### 9. `uploadDrawings.js`
- Upload drawing files
- Link to released parts/assemblies

## Data Flow
```
PDM Database
    ↓ (pdmExportReferences.sql)
references.csv ✅
    ↓ (categorizeFiles.js)
output/*.json ✅ (parts, assemblies, drawings categorized)
    ↓ (groupFilesByPrefix.js)
documentGroups.json (files grouped by 5-digit prefix)
    ↓ (uploadAllParts.js)
partMapping.json (all 4,578 parts uploaded with related files)
    ↓ (generatePackAndGo.ps1) [in SolidWorks]
PackAndGo/*.zip
    ↓ (uploadAssemblies.js)
assemblyImportMapping.json
    ↓ (relinkAssemblies.js)
[duplicates removed, references updated to master parts]
    ↓ (releaseAssemblies.js)
[assemblies released]
    ↓ (uploadDrawings.js)
Complete migration
```

## Key Onshape API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /blobelements/...` | Upload files |
| `POST /releasepackages/release/{wfid}` | Create release |
| `POST /releasepackages/{rpid}` | Submit release |
| `GET /assemblies/.../definition` | Get assembly structure |
| `POST /elements/.../updatereferences` | Relink parts |
| `DELETE /elements/...` | Delete duplicate parts |
| `POST /assemblies/.../instances` | Insert instances (if needed) |

## Challenges & Mitigations

| Challenge | Mitigation |
|-----------|------------|
| Pack & Go is manual/slow | Automate with PowerShell + SolidWorks API |
| 1,370 assemblies to process | Batch processing, progress tracking, resume |
| updatereferences API quirks | Use versionId not workspaceId, handle errors |
| Parts in different folders | Onshape doesn't care about folder location for references |
| Sub-assemblies | Process bottom-up (children before parents) |

## Next Steps
1. ✅ PDM SQL query for reference export
2. ✅ Categorization script
3. Create `groupFilesByPrefix.js` to group files by 5-digit prefix
4. Update `uploadAllParts.js` to upload all parts with related files
5. Test full workflow on single part + assembly pair
6. Run full migration in batches
