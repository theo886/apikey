const fs = require('fs');
const pathModule = require('path');
const minimist = require('minimist');
const app = require('./lib/app.js');
const onshape = require('./lib/onshape.js');

/**
 * Upload standalone parts (parts not in any assembly) to Onshape.
 * These become the "master" parts that assemblies will reference.
 *
 * Usage: node uploadStandaloneParts.js -i standaloneParts.json -f <folderId> [--release]
 */

const argv = minimist(process.argv.slice(2));

if (argv['h'] || argv['help']) {
  console.log(`
Upload standalone parts to Onshape.

Usage: node uploadStandaloneParts.js -i <inputFile> -f <folderId> [options]

Options:
  -i    Input JSON file (standaloneParts.json from categorizeFiles.js)
  -f    Onshape folder ID to upload to
  -c    Company ID (for release workflow)
  -o    Output mapping file (default: partMapping.json)
  --release    Auto-release each part after upload
  --resume     Resume from last successful upload (reads output file)
  --dry-run    Show what would be uploaded without actually uploading
  -h    Show this help
`);
  process.exit(0);
}

const inputFile = argv['i'];
const folderId = argv['f'];
const companyId = argv['c'] || '6763516217765c31f9561958';
const outputFile = argv['o'] || 'partMapping.json';
const autoRelease = argv['release'] || false;
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

// Load input data
const parts = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
console.log(`Loaded ${parts.length} standalone parts from ${inputFile}`);

// Load existing mapping if resuming
let partMapping = {};
if (resume && fs.existsSync(outputFile)) {
  partMapping = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  console.log(`Resuming: ${Object.keys(partMapping).length} parts already uploaded`);
}

// Track statistics
const stats = {
  total: parts.length,
  uploaded: 0,
  released: 0,
  skipped: 0,
  errors: 0
};

let workflowId = null;

/**
 * Save current mapping to file (for resume capability)
 */
function saveMapping() {
  fs.writeFileSync(outputFile, JSON.stringify(partMapping, null, 2));
}

/**
 * Release an uploaded element
 */
function releaseElement(docId, workId, elementId, partNumber, revision, callback) {
  if (!workflowId) {
    console.log('    Skipping release: no workflow configured');
    callback();
    return;
  }

  console.log(`    Creating release package...`);
  onshape.post({
    path: '/api/releasepackages/release/' + workflowId,
    query: { cid: companyId },
    body: {
      items: [{
        elementId: elementId,
        documentId: docId,
        workspaceId: workId
      }]
    }
  }, (createData, createErr) => {
    if (createErr) {
      console.error(`    Release failed: ${createErr.body}`);
      callback();
      return;
    }

    const releasePackage = JSON.parse(createData.toString());
    const rpid = releasePackage.id;
    const item = releasePackage.items[0];

    // Format revision (pad to 2 digits if numeric)
    let formattedRevision = revision || '00';
    if (/^\d+$/.test(formattedRevision)) {
      formattedRevision = String(formattedRevision).padStart(2, '0');
    }

    const updatePayload = {
      id: rpid,
      href: releasePackage.href,
      documentId: docId,
      workspaceId: workId,
      properties: [
        { propertyId: '594964b7040fc85d2b418138', value: `Migration: ${partNumber}` }
      ],
      items: [{
        id: item.id,
        documentId: item.documentId,
        workspaceId: item.workspaceId,
        elementId: item.elementId,
        href: item.href,
        properties: [
          { propertyId: '57f3fb8efa3416c06701d60f', value: partNumber },
          { propertyId: '57f3fb8efa3416c06701d610', value: formattedRevision }
        ]
      }]
    };

    onshape.post({
      path: '/api/releasepackages/' + rpid,
      query: { wfaction: 'CREATE_AND_RELEASE' },
      body: updatePayload
    }, (submitData, submitErr) => {
      if (submitErr) {
        console.error(`    Release submit failed: ${submitErr.body}`);
      } else {
        const result = JSON.parse(submitData.toString());
        if (result.workflow?.state?.name === 'RELEASED') {
          console.log(`    Released: Rev ${formattedRevision}`);
          stats.released++;
        }
      }
      callback();
    });
  });
}

/**
 * Upload a single part
 */
function uploadPart(part, callback) {
  const filename = part.filename;
  const partNumber = part.partNumber || filename.replace(/\.[^/.]+$/, '');
  const revision = part.revision || '00';
  const filePath = part.filePath;

  // Skip if already uploaded (resume mode)
  if (partMapping[partNumber]) {
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

  if (dryRun) {
    console.log('  [DRY RUN - would upload]');
    callback();
    return;
  }

  // Create document
  const docName = partNumber || filename.replace(/\.[^/.]+$/, '');
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
          // Upload the file
          const mimeType = 'application/octet-stream';
          app.uploadBlobElement(docId, workId, filePath, mimeType, (uploadData) => {
            const blobData = JSON.parse(uploadData.toString());
            console.log(`  Uploaded element: ${blobData.id}`);

            // Store mapping
            partMapping[partNumber] = {
              documentId: docId,
              workspaceId: workId,
              elementId: blobData.id,
              filename: filename,
              partNumber: partNumber,
              uploadedAt: new Date().toISOString()
            };
            saveMapping();
            stats.uploaded++;

            // Release if requested
            if (autoRelease) {
              releaseElement(docId, workId, blobData.id, partNumber, revision, callback);
            } else {
              callback();
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
 * Process all parts sequentially
 */
function processAllParts() {
  let currentIndex = 0;

  const processNext = () => {
    if (currentIndex >= parts.length) {
      console.log('\n' + '='.repeat(60));
      console.log('UPLOAD COMPLETE');
      console.log('='.repeat(60));
      console.log(`Total parts: ${stats.total}`);
      console.log(`Uploaded: ${stats.uploaded}`);
      console.log(`Released: ${stats.released}`);
      console.log(`Skipped (already done): ${stats.skipped}`);
      console.log(`Errors: ${stats.errors}`);
      console.log(`\nMapping saved to: ${outputFile}`);
      return;
    }

    const progress = `[${currentIndex + 1}/${parts.length}]`;
    console.log(`\n${progress} Processing part ${currentIndex + 1} of ${parts.length}`);

    uploadPart(parts[currentIndex], () => {
      currentIndex++;
      // Add small delay to avoid rate limiting
      setTimeout(processNext, 100);
    });
  };

  processNext();
}

// Main execution
if (dryRun) {
  console.log('\n=== DRY RUN MODE ===\n');
  parts.forEach((part, idx) => {
    const filename = part.filename;
    const partNumber = part.partNumber || filename.replace(/\.[^/.]+$/, '');
    const exists = fs.existsSync(part.filePath);
    console.log(`${idx + 1}. ${filename}`);
    console.log(`   PN: ${partNumber}`);
    console.log(`   Path: ${part.filePath}`);
    console.log(`   Exists: ${exists ? 'YES' : 'NO'}`);
  });
  console.log(`\nTotal: ${parts.length} parts would be uploaded`);
  process.exit(0);
}

// Fetch workflow ID if releasing
if (autoRelease) {
  console.log('Auto-release enabled. Fetching workflow ID...');
  app.getCompanyPolicies(companyId, (policiesData) => {
    const policies = JSON.parse(policiesData.toString());
    workflowId = policies.releaseWorkflowId;
    if (workflowId) {
      console.log(`Using workflow ID: ${workflowId}\n`);
    } else {
      console.warn('Warning: No workflow found. Parts will not be released.\n');
    }
    processAllParts();
  });
} else {
  processAllParts();
}
