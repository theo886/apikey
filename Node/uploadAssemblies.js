const fs = require('fs');
const pathModule = require('path');
const minimist = require('minimist');
const app = require('./lib/app.js');
const onshape = require('./lib/onshape.js');

/**
 * Upload Pack & Go ZIP files to Onshape.
 * Onshape will extract the ZIP, import the assembly, and preserve component positions.
 *
 * Usage: node uploadAssemblies.js -i manifest.json -f <folderId>
 */

const argv = minimist(process.argv.slice(2));

if (argv['h'] || argv['help']) {
  console.log(`
Upload Pack & Go assembly ZIPs to Onshape.

Usage: node uploadAssemblies.js -i <manifest.json> -f <folderId> [options]

Options:
  -i    Input manifest file (from generatePackAndGo.ps1)
  -f    Onshape folder ID to upload to
  -o    Output mapping file (default: assemblyImportMapping.json)
  --resume     Resume from last successful upload
  --dry-run    Show what would be uploaded without actually uploading
  -h    Show this help

The manifest.json should contain:
{
  "files": [
    { "filename": "ASM001.zip", "path": "/path/to/ASM001.zip", "partNumber": "ASM001" }
  ]
}
`);
  process.exit(0);
}

const inputFile = argv['i'];
const folderId = argv['f'];
const outputFile = argv['o'] || 'assemblyImportMapping.json';
const resume = argv['resume'] || false;
const dryRun = argv['dry-run'] || false;

if (!inputFile) {
  console.error('Error: Input file (-i) is required.');
  process.exit(1);
}

if (!folderId && !dryRun) {
  console.error('Error: Folder ID (-f) is required.');
  process.exit(1);
}

// Load manifest
const manifest = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const assemblies = manifest.files || [];
console.log(`Loaded ${assemblies.length} assembly ZIPs from ${inputFile}`);

// Load existing mapping if resuming
let importMapping = {};
if (resume && fs.existsSync(outputFile)) {
  importMapping = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  console.log(`Resuming: ${Object.keys(importMapping).length} assemblies already uploaded`);
}

// Stats
const stats = {
  total: assemblies.length,
  uploaded: 0,
  skipped: 0,
  errors: 0
};

/**
 * Save current mapping
 */
function saveMapping() {
  fs.writeFileSync(outputFile, JSON.stringify(importMapping, null, 2));
}

/**
 * Wait for translation job to complete
 */
function waitForTranslation(translationId, callback, attempts = 0) {
  const maxAttempts = 60; // 5 minutes max wait
  const pollInterval = 5000; // 5 seconds

  if (attempts >= maxAttempts) {
    callback(null, { error: 'Translation timeout' });
    return;
  }

  onshape.get({
    path: `/api/translations/${translationId}`
  }, (data) => {
    const status = JSON.parse(data.toString());

    if (status.requestState === 'DONE') {
      callback(status);
    } else if (status.requestState === 'FAILED') {
      callback(null, { error: status.failureReason || 'Translation failed' });
    } else {
      // Still processing, wait and check again
      console.log(`    Translation status: ${status.requestState} (attempt ${attempts + 1})`);
      setTimeout(() => {
        waitForTranslation(translationId, callback, attempts + 1);
      }, pollInterval);
    }
  });
}

/**
 * Upload a single assembly ZIP
 */
function uploadAssembly(assembly, callback) {
  const filename = assembly.filename;
  const filePath = assembly.path;
  const partNumber = assembly.partNumber;

  // Skip if already uploaded
  if (importMapping[partNumber]) {
    console.log(`Skipping ${filename} (already uploaded)`);
    stats.skipped++;
    callback();
    return;
  }

  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    stats.errors++;
    callback();
    return;
  }

  console.log(`\nUploading: ${filename}`);
  console.log(`  Part Number: ${partNumber}`);
  console.log(`  File Path: ${filePath}`);
  console.log(`  Size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB`);

  if (dryRun) {
    console.log('  [DRY RUN - would upload]');
    callback();
    return;
  }

  // Create document for the assembly
  const docName = partNumber || filename.replace(/\.zip$/i, '');
  app.createDocument(docName, false, folderId, (createData) => {
    const docInfo = JSON.parse(createData.toString());
    const docId = docInfo.id;
    const workId = docInfo.defaultWorkspace.id;

    console.log(`  Document created: ${docId}`);

    // Delete default elements
    app.getElements(docId, workId, (elementsData) => {
      const elements = JSON.parse(elementsData.toString());
      const toDelete = elements.filter(e => e.name === 'Part Studio 1' || e.name === 'Assembly 1');

      const deleteNext = (idx) => {
        if (idx >= toDelete.length) {
          // Upload the ZIP file as a translation
          console.log('  Uploading ZIP file...');

          // For ZIP files containing assemblies, we use the blob upload
          // and Onshape will translate them
          const mimeType = 'application/zip';

          onshape.upload({
            d: docId,
            w: workId,
            resource: 'blobelements',
            file: filePath,
            mimeType: mimeType,
            body: {
              allowFaultyParts: true,
              createComposite: false,
              createDrawingIfPossible: false,
              flattenAssemblies: false,
              yAxisIsUp: false,
              importWithinDocument: true,
              splitAssembliesIntoMultipleDocuments: false
            }
          }, (uploadData) => {
            console.log('  ZIP uploaded, processing...');

            // The upload returns translation info
            let uploadResult;
            try {
              uploadResult = JSON.parse(uploadData.toString());
            } catch (e) {
              console.log('  Upload response:', uploadData.toString());
              uploadResult = { id: 'pending' };
            }

            // If it's a translation, wait for it
            if (uploadResult.id && uploadResult.requestState) {
              console.log(`  Translation ID: ${uploadResult.id}`);
              waitForTranslation(uploadResult.id, (result, err) => {
                if (err) {
                  console.error(`  Translation error: ${err.error}`);
                  stats.errors++;
                  callback();
                  return;
                }

                console.log('  Translation complete!');

                // Get the elements created
                app.getElements(docId, workId, (newElementsData) => {
                  const newElements = JSON.parse(newElementsData.toString());
                  console.log(`  Created ${newElements.length} elements`);

                  // Store mapping
                  importMapping[partNumber] = {
                    documentId: docId,
                    workspaceId: workId,
                    elements: newElements.map(e => ({
                      elementId: e.id,
                      name: e.name,
                      type: e.elementType
                    })),
                    sourceZip: filename,
                    uploadedAt: new Date().toISOString()
                  };
                  saveMapping();
                  stats.uploaded++;
                  callback();
                });
              });
            } else {
              // Direct upload (non-translation)
              console.log('  Upload complete');

              // Get elements
              setTimeout(() => {
                app.getElements(docId, workId, (newElementsData) => {
                  const newElements = JSON.parse(newElementsData.toString());
                  console.log(`  Created ${newElements.length} elements`);

                  importMapping[partNumber] = {
                    documentId: docId,
                    workspaceId: workId,
                    elements: newElements.map(e => ({
                      elementId: e.id,
                      name: e.name,
                      type: e.elementType
                    })),
                    sourceZip: filename,
                    uploadedAt: new Date().toISOString()
                  };
                  saveMapping();
                  stats.uploaded++;
                  callback();
                });
              }, 2000); // Wait for processing
            }
          });
          return;
        }

        app.deleteElement(docId, workId, toDelete[idx].id, () => {
          deleteNext(idx + 1);
        });
      };

      deleteNext(0);
    });
  });
}

/**
 * Process all assemblies sequentially
 */
function processAllAssemblies() {
  let currentIndex = 0;

  const processNext = () => {
    if (currentIndex >= assemblies.length) {
      console.log('\n' + '='.repeat(60));
      console.log('ASSEMBLY UPLOAD COMPLETE');
      console.log('='.repeat(60));
      console.log(`Total assemblies: ${stats.total}`);
      console.log(`Uploaded: ${stats.uploaded}`);
      console.log(`Skipped (already done): ${stats.skipped}`);
      console.log(`Errors: ${stats.errors}`);
      console.log(`\nMapping saved to: ${outputFile}`);
      console.log(`\nNext step: Run relinkAssemblies.js to fix duplicate references`);
      return;
    }

    const progress = `[${currentIndex + 1}/${assemblies.length}]`;
    console.log(`\n${progress} Processing assembly ${currentIndex + 1} of ${assemblies.length}`);

    uploadAssembly(assemblies[currentIndex], () => {
      currentIndex++;
      // Add delay between uploads
      setTimeout(processNext, 1000);
    });
  };

  processNext();
}

// Main execution
if (dryRun) {
  console.log('\n=== DRY RUN MODE ===\n');
  assemblies.forEach((asm, idx) => {
    const exists = fs.existsSync(asm.path);
    const size = exists ? (fs.statSync(asm.path).size / 1024 / 1024).toFixed(2) : 0;
    console.log(`${idx + 1}. ${asm.filename}`);
    console.log(`   PN: ${asm.partNumber}`);
    console.log(`   Path: ${asm.path}`);
    console.log(`   Exists: ${exists ? 'YES' : 'NO'}`);
    console.log(`   Size: ${size} MB`);
  });
  console.log(`\nTotal: ${assemblies.length} assemblies would be uploaded`);
  process.exit(0);
}

processAllAssemblies();
