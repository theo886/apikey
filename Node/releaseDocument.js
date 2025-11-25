const app = require('./lib/app.js');
const onshape = require('./lib/onshape.js');
const minimist = require('minimist');

// Parse command line arguments
const argv = minimist(process.argv.slice(2));

if (argv['h'] || argv['help']) {
  console.log('\nThis script releases all elements in a document using the company\'s release workflow.\n');
  console.log('Usage: node releaseDocument.js -d <documentId> -w <workspaceId> [-c <companyId>]');
  console.log('\nOptions:');
  console.log('  -d    Document ID (required)');
  console.log('  -w    Workspace ID (required)');
  console.log('  -c    Company ID (optional, will be auto-detected if not provided)');
  console.log('  -n    Release name (optional, defaults to "Auto-release")');
  process.exit(0);
}

// Get IDs from command line or use defaults
const documentId = argv['d'] || 'f9d100623f8a44dbda484a3f';
const workspaceId = argv['w'] || '9f48091e2f45930b1e80152e';
const companyId = argv['c'] || '6763516217765c31f9561958';
const releaseName = argv['n'] || 'Auto-release via script';

console.log(`Starting release process for document: ${documentId}`);

// Step 1: Get the release workflow ID from company policies
app.getCompanyPolicies(companyId, (policiesData) => {
  const policies = JSON.parse(policiesData.toString());
  const workflowId = policies.releaseWorkflowId;

  if (!workflowId) {
    console.error('Could not find a release workflow ID for this company.');
    return;
  }
  console.log(`Using workflow ID: ${workflowId}`);

  // Step 2: Get all elements in the document
  app.getElements(documentId, workspaceId, (elementsData) => {
    const elements = JSON.parse(elementsData.toString());
    console.log(`Found ${elements.length} elements in the document:`);
    elements.forEach(e => console.log(`  - ${e.elementType}: ${e.name}`));

    // Collect items to release (BLOBs can be released directly)
    const releaseItems = [];

    // Handle BLOBs
    const blobElements = elements.filter(e => e.elementType === 'BLOB');
    blobElements.forEach(element => {
      releaseItems.push({
        elementId: element.id,
        documentId: documentId,
        workspaceId: workspaceId
      });
    });

    // Handle Part Studios - need to get individual parts
    const partStudioElements = elements.filter(e => e.elementType === 'PARTSTUDIO');
    let pendingPartRequests = partStudioElements.length;

    const proceedWithRelease = () => {
      if (releaseItems.length === 0) {
        console.log('No releasable items found. Exiting.');
        return;
      }

      console.log(`\nCreating release package for ${releaseItems.length} item(s)...`);

      // Step 3: Create release package with the correct endpoint
      onshape.post({
        path: '/api/releasepackages/release/' + workflowId,
        query: { cid: companyId },
        body: { items: releaseItems }
      }, (createData, createErr) => {
        if (createErr) {
          console.error('Failed to create release package:', createErr.body);
          return;
        }

        const releasePackage = JSON.parse(createData.toString());
        const rpid = releasePackage.id;
        console.log(`Release package created: ${rpid}`);

        // Build the update payload with required properties
        const updatePayload = {
          id: rpid,
          href: releasePackage.href,
          documentId: documentId,
          workspaceId: workspaceId,
          properties: [
            { propertyId: '594964b7040fc85d2b418138', value: releaseName }  // Release name
          ],
          items: releasePackage.items.map(item => {
            // Get the revision value assigned by the API (auto-incremented)
            const revisionProp = item.properties?.find(p => p.propertyId === '57f3fb8efa3416c06701d610');
            const revision = revisionProp?.value || '001';

            // Get part number from existing property or derive from name
            const partNumProp = item.properties?.find(p => p.propertyId === '57f3fb8efa3416c06701d60f');
            const partNumber = partNumProp?.value || item.name.replace(/\.[^/.]+$/, '');

            return {
              id: item.id,
              documentId: item.documentId,
              workspaceId: item.workspaceId,
              elementId: item.elementId,
              href: item.href,
              properties: [
                { propertyId: '57f3fb8efa3416c06701d60f', value: partNumber },  // Part number
                { propertyId: '57f3fb8efa3416c06701d610', value: revision }     // Revision (from API)
              ]
            };
          })
        };

        // Step 4: Submit the release with CREATE_AND_RELEASE action
        console.log('Submitting release...');
        onshape.post({
          path: '/api/releasepackages/' + rpid,
          query: { wfaction: 'CREATE_AND_RELEASE' },
          body: updatePayload
        }, (submitData, submitErr) => {
          if (submitErr) {
            console.error('Failed to submit release:', submitErr.body);
            return;
          }

          const result = JSON.parse(submitData.toString());
          const state = result.workflow?.state?.name;

          if (state === 'RELEASED') {
            console.log('\n✓ Release completed successfully!');
            console.log(`  State: ${state}`);
            result.items.forEach(item => {
              console.log(`  - ${item.name}: Released`);
            });
          } else {
            console.log(`Release state: ${state}`);
            console.log('Release may require additional approval.');
          }
        });
      });
    };

    // If no part studios, proceed with BLOBs
    if (partStudioElements.length === 0) {
      proceedWithRelease();
      return;
    }

    // Get parts from each part studio
    partStudioElements.forEach(element => {
      app.getParts(documentId, 'w', workspaceId, element.id, (partsData) => {
        const parts = JSON.parse(partsData.toString());
        parts.forEach(p => {
          releaseItems.push({
            elementId: element.id,
            documentId: documentId,
            workspaceId: workspaceId,
            partId: p.partId
          });
          console.log(`  Added part: ${p.name}`);
        });

        pendingPartRequests--;
        if (pendingPartRequests === 0) {
          proceedWithRelease();
        }
      });
    });
  });
});
