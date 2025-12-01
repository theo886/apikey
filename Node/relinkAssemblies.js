const fs = require('fs');
const pathModule = require('path');
const minimist = require('minimist');
const app = require('./lib/app.js');
const onshape = require('./lib/onshape.js');

/**
 * Relink assemblies to use master parts instead of duplicates created during import.
 * This is the critical step to avoid duplicates in the migration.
 *
 * How it works:
 * 1. Get assembly definition (list of instances)
 * 2. For each instance, check if the part exists in master parts mapping
 * 3. If yes, use updatereferences API to point to master part
 * 4. Delete the duplicate part element
 *
 * Usage: node relinkAssemblies.js -a assemblyImportMapping.json -p partMapping.json
 */

const argv = minimist(process.argv.slice(2));

if (argv['h'] || argv['help']) {
  console.log(`
Relink assemblies to use master parts instead of duplicates.

Usage: node relinkAssemblies.js -a <assemblyMapping.json> -p <partMapping.json> [options]

Options:
  -a    Assembly import mapping (from uploadAssemblies.js)
  -p    Part mapping (from uploadStandaloneParts.js)
  -o    Output report file (default: relinkReport.json)
  --dry-run    Analyze without making changes
  -h    Show this help

Process:
1. Reads assembly and part mappings
2. For each assembly, gets definition from Onshape
3. Identifies instances that match master parts by filename/part number
4. Uses updatereferences API to relink to master parts
5. Deletes duplicate elements from assembly document
`);
  process.exit(0);
}

const assemblyMappingFile = argv['a'];
const partMappingFile = argv['p'];
const outputFile = argv['o'] || 'relinkReport.json';
const dryRun = argv['dry-run'] || false;

if (!assemblyMappingFile || !partMappingFile) {
  console.error('Error: Both assembly mapping (-a) and part mapping (-p) are required.');
  process.exit(1);
}

// Load mappings
const assemblyMapping = JSON.parse(fs.readFileSync(assemblyMappingFile, 'utf8'));
const partMapping = JSON.parse(fs.readFileSync(partMappingFile, 'utf8'));

console.log(`Loaded ${Object.keys(assemblyMapping).length} assemblies`);
console.log(`Loaded ${Object.keys(partMapping).length} master parts`);

// Build reverse lookup: filename -> master part info
const filenameToMaster = {};
Object.entries(partMapping).forEach(([partNumber, info]) => {
  filenameToMaster[info.filename] = { partNumber, ...info };
  // Also index by part number
  filenameToMaster[partNumber] = { partNumber, ...info };
});

// Stats
const stats = {
  assembliesProcessed: 0,
  instancesFound: 0,
  relinksPerformed: 0,
  duplicatesDeleted: 0,
  errors: 0
};

const report = {
  processedAt: new Date().toISOString(),
  assemblies: []
};

/**
 * Get assembly definition
 */
function getAssemblyDefinition(docId, workId, elementId, callback) {
  onshape.get({
    path: `/api/assemblies/d/${docId}/w/${workId}/e/${elementId}`,
    query: { includeMateFeatures: false, includeMateConnectors: false }
  }, (data) => {
    callback(JSON.parse(data.toString()));
  });
}

/**
 * Create a version for updatereferences (requires versionId, not workspaceId)
 */
function createVersion(docId, workId, callback) {
  onshape.post({
    path: `/api/documents/d/${docId}/versions`,
    body: {
      name: `Migration version ${new Date().toISOString()}`,
      documentId: docId,
      workspaceId: workId
    }
  }, (data, err) => {
    if (err) {
      callback(null, err);
      return;
    }
    callback(JSON.parse(data.toString()));
  });
}

/**
 * Update references in an assembly to point to a different part
 */
function updateReferences(docId, workId, elementId, referenceUpdates, callback) {
  // updatereferences needs a version, so we create one first
  createVersion(docId, workId, (versionInfo, err) => {
    if (err) {
      callback(null, err);
      return;
    }

    const versionId = versionInfo.id;
    console.log(`    Created version: ${versionId}`);

    onshape.post({
      path: `/api/assemblies/d/${docId}/w/${workId}/e/${elementId}/updatereferences`,
      body: {
        referenceUpdates: referenceUpdates
      }
    }, (data, postErr) => {
      if (postErr) {
        callback(null, postErr);
        return;
      }
      callback(JSON.parse(data.toString()));
    });
  });
}

/**
 * Delete an element from a document
 */
function deleteElement(docId, workId, elementId, callback) {
  onshape.delete({
    path: `/api/documents/d/${docId}/w/${workId}/e/${elementId}`
  }, (data) => {
    callback();
  });
}

/**
 * Process a single assembly
 */
function processAssembly(partNumber, assemblyInfo, callback) {
  const docId = assemblyInfo.documentId;
  const workId = assemblyInfo.workspaceId;

  // Find the assembly element
  const assemblyElement = assemblyInfo.elements.find(e => e.type === 'ASSEMBLY');
  if (!assemblyElement) {
    console.log(`  No assembly element found, skipping`);
    callback();
    return;
  }

  const elementId = assemblyElement.elementId;
  console.log(`  Assembly element: ${elementId}`);

  // Get assembly definition
  getAssemblyDefinition(docId, workId, elementId, (definition) => {
    const instances = definition.rootAssembly?.instances || [];
    console.log(`  Found ${instances.length} instances`);

    // Track what we find
    const assemblyReport = {
      partNumber: partNumber,
      documentId: docId,
      instances: [],
      relinks: [],
      deletedElements: []
    };

    // Elements to potentially delete (duplicates)
    const elementsToDelete = new Set();
    const referenceUpdates = [];

    // Analyze each instance
    instances.forEach(instance => {
      stats.instancesFound++;

      // Get the part's document and element info
      const instanceDocId = instance.documentId;
      const instanceElementId = instance.elementId;
      const instanceName = instance.name;

      // Try to find this part in our master parts
      // Check by name (filename without extension often matches)
      const baseName = instanceName.replace(/\.[^/.]+$/, '');

      assemblyReport.instances.push({
        name: instanceName,
        documentId: instanceDocId,
        elementId: instanceElementId,
        isLocal: instanceDocId === docId
      });

      // If this instance is local (in the same document), it's a duplicate
      if (instanceDocId === docId && instanceElementId !== elementId) {
        // Check if we have a master part with matching name
        const master = filenameToMaster[instanceName] ||
          filenameToMaster[baseName] ||
          filenameToMaster[`${baseName}.SLDPRT`];

        if (master) {
          console.log(`    Found duplicate: ${instanceName} -> master ${master.partNumber}`);

          // Add to relink list
          referenceUpdates.push({
            fromDocumentId: instanceDocId,
            fromElementId: instanceElementId,
            toDocumentId: master.documentId,
            toElementId: master.elementId
          });

          assemblyReport.relinks.push({
            instanceName: instanceName,
            fromElementId: instanceElementId,
            toDocumentId: master.documentId,
            toElementId: master.elementId,
            masterPartNumber: master.partNumber
          });

          // Mark element for deletion (after relink)
          elementsToDelete.add(instanceElementId);
        }
      }
    });

    // If nothing to relink, we're done
    if (referenceUpdates.length === 0) {
      console.log(`  No duplicates to relink`);
      report.assemblies.push(assemblyReport);
      callback();
      return;
    }

    console.log(`  Will relink ${referenceUpdates.length} instances`);

    if (dryRun) {
      console.log(`  [DRY RUN - would relink and delete ${elementsToDelete.size} elements]`);
      report.assemblies.push(assemblyReport);
      callback();
      return;
    }

    // Perform the relink
    updateReferences(docId, workId, elementId, referenceUpdates, (result, err) => {
      if (err) {
        console.error(`  Relink failed: ${err.body || err}`);
        stats.errors++;
        report.assemblies.push(assemblyReport);
        callback();
        return;
      }

      console.log(`  Relinked successfully`);
      stats.relinksPerformed += referenceUpdates.length;

      // Delete duplicate elements
      const elementsArray = Array.from(elementsToDelete);

      const deleteNext = (idx) => {
        if (idx >= elementsArray.length) {
          report.assemblies.push(assemblyReport);
          callback();
          return;
        }

        const elemToDelete = elementsArray[idx];
        console.log(`    Deleting duplicate element: ${elemToDelete}`);

        deleteElement(docId, workId, elemToDelete, () => {
          stats.duplicatesDeleted++;
          assemblyReport.deletedElements.push(elemToDelete);
          deleteNext(idx + 1);
        });
      };

      deleteNext(0);
    });
  });
}

/**
 * Process all assemblies
 */
function processAllAssemblies() {
  const assemblyPNs = Object.keys(assemblyMapping);
  let currentIndex = 0;

  const processNext = () => {
    if (currentIndex >= assemblyPNs.length) {
      // Done - save report
      fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

      console.log('\n' + '='.repeat(60));
      console.log('RELINK COMPLETE');
      console.log('='.repeat(60));
      console.log(`Assemblies processed: ${stats.assembliesProcessed}`);
      console.log(`Instances found: ${stats.instancesFound}`);
      console.log(`Relinks performed: ${stats.relinksPerformed}`);
      console.log(`Duplicates deleted: ${stats.duplicatesDeleted}`);
      console.log(`Errors: ${stats.errors}`);
      console.log(`\nReport saved to: ${outputFile}`);
      return;
    }

    const pn = assemblyPNs[currentIndex];
    const info = assemblyMapping[pn];

    console.log(`\n[${currentIndex + 1}/${assemblyPNs.length}] Processing: ${pn}`);
    stats.assembliesProcessed++;

    processAssembly(pn, info, () => {
      currentIndex++;
      setTimeout(processNext, 500);
    });
  };

  processNext();
}

// Main
if (dryRun) {
  console.log('\n=== DRY RUN MODE ===');
  console.log('Will analyze assemblies without making changes.\n');
}

processAllAssemblies();
