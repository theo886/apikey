const fs = require('fs');
const xlsx = require('xlsx');
const pathModule = require('path');
const minimist = require('minimist');

/**
 * Categorizes SolidWorks files from PDM export into:
 * - Standalone parts (not in any assembly)
 * - Assembly parts (used in assemblies)
 * - Top-level assemblies (not used in other assemblies)
 * - Sub-assemblies (used in other assemblies)
 *
 * Usage: node categorizeFiles.js -r references.csv -d documents.xlsx -o output/
 */

const argv = minimist(process.argv.slice(2));

if (argv['h'] || argv['help']) {
  console.log(`
Categorize SolidWorks PDM files for Onshape migration.

Usage: node categorizeFiles.js -r <references.csv> -d <documents.xlsx> -o <outputDir>

Options:
  -r    References CSV from PDM SQL query (AssemblyFile, AssemblyPN, ChildFile, ChildPN, Quantity)
  -d    Documents Excel/CSV with all files (from PDM export or Upload List.xlsx)
  -o    Output directory for generated JSON files (default: ./output)
  -h    Show this help

Output files:
  - standaloneParts.json    Parts not referenced by any assembly
  - assemblyParts.json      Parts that are in assemblies
  - topLevelAssemblies.json Assemblies not used in other assemblies
  - subAssemblies.json      Assemblies used in other assemblies
  - uploadOrder.json        Recommended upload order
  - assemblyTree.json       Full dependency tree for each assembly
`);
  process.exit(0);
}

const referencesFile = argv['r'];
const documentsFile = argv['d'];
const outputDir = argv['o'] || './output';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Parse CSV file into array of objects
 * Handles PDM Report Generator format (title row, then headers, then data)
 */
function parseCSV(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // Check if first line is a title (PDM Report Generator adds a title row)
  // Title row typically doesn't have the expected headers
  let headerLineIndex = 0;
  if (!lines[0].includes('AssemblyFile') && !lines[0].includes('Filename') && !lines[0].includes('DocumentID')) {
    headerLineIndex = 1; // Skip title row
  }

  if (lines.length <= headerLineIndex) return [];

  const headers = lines[headerLineIndex].split(',').map(h => h.trim().replace(/"/g, ''));
  const data = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    // Handle CSV with potential commas in quoted values
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || '';
    });
    data.push(obj);
  }
  return data;
}

/**
 * Parse a single CSV line, handling quoted values with commas
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/"/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/"/g, ''));
  return values;
}

/**
 * Parse Excel or CSV file
 */
function parseFile(filePath) {
  const ext = pathModule.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    return parseCSV(filePath);
  } else if (ext === '.xlsx' || ext === '.xls') {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
  }
  throw new Error(`Unsupported file format: ${ext}`);
}

/**
 * Build reference maps from PDM data
 */
function buildReferenceMaps(references) {
  // Map: assembly filename -> array of children
  const assemblyToChildren = new Map();
  // Map: part filename -> array of parent assemblies
  const childToParents = new Map();
  // Set of all files that are referenced as children
  const referencedFiles = new Set();
  // Set of all assemblies
  const assemblies = new Set();

  references.forEach(ref => {
    const assembly = ref.AssemblyFile || ref.assemblyFile;
    const child = ref.ChildFile || ref.childFile;
    const assemblyPN = ref.AssemblyPN || ref.assemblyPN || '';
    const childPN = ref.ChildPN || ref.childPN || '';
    const quantity = parseInt(ref.Quantity || ref.quantity || '1', 10);

    if (!assembly || !child) return;

    assemblies.add(assembly);
    referencedFiles.add(child);

    // Add to assemblyToChildren
    if (!assemblyToChildren.has(assembly)) {
      assemblyToChildren.set(assembly, []);
    }
    assemblyToChildren.get(assembly).push({
      filename: child,
      partNumber: childPN,
      quantity: quantity
    });

    // Add to childToParents
    if (!childToParents.has(child)) {
      childToParents.set(child, []);
    }
    childToParents.get(child).push({
      filename: assembly,
      partNumber: assemblyPN
    });
  });

  return { assemblyToChildren, childToParents, referencedFiles, assemblies };
}

/**
 * Categorize files based on reference data
 */
function categorizeFiles(documents, refMaps) {
  const { assemblyToChildren, childToParents, referencedFiles, assemblies } = refMaps;

  const standaloneParts = [];
  const assemblyParts = [];
  const topLevelAssemblies = [];
  const subAssemblies = [];
  const drawings = [];
  const otherFiles = [];

  documents.forEach(doc => {
    // Handle different column names from various exports
    const filename = doc['File Name'] || doc.Filename || doc.filename || doc.FileName || '';
    const partNumber = doc['Part Number'] || doc.PartNumber || doc.partNumber || doc.Number || '';
    const revision = doc.Revision || doc.revision || doc.Rev || '';
    const filePath = doc['File Path'] || doc.FilePath || doc.filePath || doc.Path || '';
    const folderPath = doc['Folder Path'] || doc.FolderPath || doc.folderPath || '';

    if (!filename) return;

    const ext = pathModule.extname(filename).toUpperCase();
    const fileInfo = {
      filename,
      partNumber,
      revision,
      filePath,
      folderPath
    };

    if (ext === '.SLDDRW') {
      drawings.push(fileInfo);
    } else if (ext === '.SLDASM') {
      // Is this assembly used in other assemblies?
      if (childToParents.has(filename)) {
        subAssemblies.push({
          ...fileInfo,
          usedIn: childToParents.get(filename),
          children: assemblyToChildren.get(filename) || []
        });
      } else {
        topLevelAssemblies.push({
          ...fileInfo,
          children: assemblyToChildren.get(filename) || []
        });
      }
    } else if (ext === '.SLDPRT') {
      // Is this part referenced by any assembly?
      if (referencedFiles.has(filename)) {
        assemblyParts.push({
          ...fileInfo,
          usedIn: childToParents.get(filename) || []
        });
      } else {
        standaloneParts.push(fileInfo);
      }
    } else {
      otherFiles.push(fileInfo);
    }
  });

  return {
    standaloneParts,
    assemblyParts,
    topLevelAssemblies,
    subAssemblies,
    drawings,
    otherFiles
  };
}

/**
 * Build dependency tree for an assembly (recursive)
 */
function buildDependencyTree(assemblyFilename, assemblyToChildren, visited = new Set()) {
  if (visited.has(assemblyFilename)) {
    return { filename: assemblyFilename, circular: true, children: [] };
  }
  visited.add(assemblyFilename);

  const children = assemblyToChildren.get(assemblyFilename) || [];
  return {
    filename: assemblyFilename,
    children: children.map(child => {
      const ext = pathModule.extname(child.filename).toUpperCase();
      if (ext === '.SLDASM') {
        return buildDependencyTree(child.filename, assemblyToChildren, new Set(visited));
      }
      return { filename: child.filename, partNumber: child.partNumber, quantity: child.quantity };
    })
  };
}

/**
 * Determine upload order (bottom-up for assemblies)
 * Parts first, then sub-assemblies (deepest first), then top-level assemblies
 */
function determineUploadOrder(categorized, assemblyToChildren) {
  const order = [];

  // 1. Standalone parts first
  order.push({
    phase: 1,
    description: 'Standalone Parts (not in any assembly)',
    files: categorized.standaloneParts.map(p => ({
      filename: p.filename,
      partNumber: p.partNumber,
      filePath: p.filePath
    }))
  });

  // 2. Calculate assembly depth (deepest sub-assemblies first)
  function getAssemblyDepth(filename, cache = new Map()) {
    if (cache.has(filename)) return cache.get(filename);
    const children = assemblyToChildren.get(filename) || [];
    let maxChildDepth = 0;
    children.forEach(child => {
      const ext = pathModule.extname(child.filename).toUpperCase();
      if (ext === '.SLDASM') {
        maxChildDepth = Math.max(maxChildDepth, getAssemblyDepth(child.filename, cache) + 1);
      }
    });
    cache.set(filename, maxChildDepth);
    return maxChildDepth;
  }

  // Sort sub-assemblies by depth (deepest first)
  const subAssembliesWithDepth = categorized.subAssemblies.map(asm => ({
    ...asm,
    depth: getAssemblyDepth(asm.filename)
  }));
  subAssembliesWithDepth.sort((a, b) => b.depth - a.depth);

  // Group sub-assemblies by depth level
  const depthGroups = new Map();
  subAssembliesWithDepth.forEach(asm => {
    if (!depthGroups.has(asm.depth)) {
      depthGroups.set(asm.depth, []);
    }
    depthGroups.get(asm.depth).push(asm);
  });

  // 3. Sub-assemblies by depth level
  const depths = Array.from(depthGroups.keys()).sort((a, b) => b - a);
  depths.forEach((depth, idx) => {
    order.push({
      phase: 2 + idx,
      description: `Sub-Assemblies (depth ${depth})`,
      files: depthGroups.get(depth).map(a => ({
        filename: a.filename,
        partNumber: a.partNumber,
        filePath: a.filePath,
        childCount: a.children.length
      }))
    });
  });

  // 4. Top-level assemblies last
  order.push({
    phase: 2 + depths.length,
    description: 'Top-Level Assemblies',
    files: categorized.topLevelAssemblies.map(a => ({
      filename: a.filename,
      partNumber: a.partNumber,
      filePath: a.filePath,
      childCount: a.children.length
    }))
  });

  // 5. Drawings (after assemblies are released)
  order.push({
    phase: 3 + depths.length,
    description: 'Drawings',
    files: categorized.drawings.map(d => ({
      filename: d.filename,
      partNumber: d.partNumber,
      filePath: d.filePath
    }))
  });

  return order;
}

// Main execution
console.log('SolidWorks PDM File Categorizer for Onshape Migration\n');

// Check if we have the required files
if (!referencesFile && !documentsFile) {
  // Demo mode with just the Upload List
  const defaultList = '/Users/theo/Documents/GitHub/apikey/Node/PDM/Upload List.xlsx';
  if (fs.existsSync(defaultList)) {
    console.log('No input files specified. Using default Upload List for demo...');
    console.log(`Reading: ${defaultList}\n`);

    const documents = parseFile(defaultList);
    console.log(`Found ${documents.length} files in the upload list.`);

    // Without references, we can only categorize by file extension
    const parts = documents.filter(d => {
      const fn = d['File Name'] || d.Filename || '';
      return fn.toUpperCase().endsWith('.SLDPRT');
    });
    const assemblies = documents.filter(d => {
      const fn = d['File Name'] || d.Filename || '';
      return fn.toUpperCase().endsWith('.SLDASM');
    });
    const drawings = documents.filter(d => {
      const fn = d['File Name'] || d.Filename || '';
      return fn.toUpperCase().endsWith('.SLDDRW');
    });

    console.log(`\nFile breakdown:`);
    console.log(`  - Parts (.SLDPRT): ${parts.length}`);
    console.log(`  - Assemblies (.SLDASM): ${assemblies.length}`);
    console.log(`  - Drawings (.SLDDRW): ${drawings.length}`);
    console.log(`  - Other: ${documents.length - parts.length - assemblies.length - drawings.length}`);

    console.log(`\nTo categorize by assembly references, run:`);
    console.log(`  1. Export references from PDM using: Node/PDM/pdmExportReferences.sql`);
    console.log(`  2. node categorizeFiles.js -r references.csv -d "${defaultList}"`);
    process.exit(0);
  }

  console.error('Error: Please provide input files.');
  console.error('Usage: node categorizeFiles.js -r references.csv -d documents.xlsx');
  process.exit(1);
}

// Load references if provided
let refMaps = {
  assemblyToChildren: new Map(),
  childToParents: new Map(),
  referencedFiles: new Set(),
  assemblies: new Set()
};

if (referencesFile) {
  console.log(`Loading references from: ${referencesFile}`);
  const references = parseFile(referencesFile);
  console.log(`  Found ${references.length} reference relationships.`);
  refMaps = buildReferenceMaps(references);
  console.log(`  ${refMaps.assemblies.size} unique assemblies`);
  console.log(`  ${refMaps.referencedFiles.size} unique referenced files\n`);
}

// Load documents
if (!documentsFile) {
  console.error('Error: Documents file (-d) is required.');
  process.exit(1);
}

console.log(`Loading documents from: ${documentsFile}`);
const documents = parseFile(documentsFile);
console.log(`  Found ${documents.length} documents.\n`);

// Categorize files
console.log('Categorizing files...');
const categorized = categorizeFiles(documents, refMaps);

console.log(`\nResults:`);
console.log(`  - Standalone Parts: ${categorized.standaloneParts.length}`);
console.log(`  - Assembly Parts: ${categorized.assemblyParts.length}`);
console.log(`  - Top-Level Assemblies: ${categorized.topLevelAssemblies.length}`);
console.log(`  - Sub-Assemblies: ${categorized.subAssemblies.length}`);
console.log(`  - Drawings: ${categorized.drawings.length}`);
console.log(`  - Other Files: ${categorized.otherFiles.length}`);

// Determine upload order
console.log(`\nDetermining upload order...`);
const uploadOrder = determineUploadOrder(categorized, refMaps.assemblyToChildren);

// Build assembly trees for top-level assemblies
console.log(`Building assembly dependency trees...`);
const assemblyTrees = {};
categorized.topLevelAssemblies.forEach(asm => {
  assemblyTrees[asm.filename] = buildDependencyTree(asm.filename, refMaps.assemblyToChildren);
});

// Write output files
const outputs = {
  'standaloneParts.json': categorized.standaloneParts,
  'assemblyParts.json': categorized.assemblyParts,
  'topLevelAssemblies.json': categorized.topLevelAssemblies,
  'subAssemblies.json': categorized.subAssemblies,
  'drawings.json': categorized.drawings,
  'otherFiles.json': categorized.otherFiles,
  'uploadOrder.json': uploadOrder,
  'assemblyTrees.json': assemblyTrees
};

console.log(`\nWriting output files to: ${outputDir}/`);
Object.entries(outputs).forEach(([filename, data]) => {
  const outPath = pathModule.join(outputDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  - ${filename}`);
});

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log('UPLOAD ORDER SUMMARY');
console.log('='.repeat(60));
uploadOrder.forEach(phase => {
  console.log(`\nPhase ${phase.phase}: ${phase.description}`);
  console.log(`  Files: ${phase.files.length}`);
});

console.log(`\n${'='.repeat(60)}`);
console.log('Done! Review the output files and proceed with migration.');
