const xlsx = require('xlsx');
const fs = require('fs');
const pathModule = require('path');
const minimist = require('minimist');
const util = require('./lib/util.js');
const errors = require('./config/errors.js');

// >>> SET YOUR TARGET FOLDER ID HERE <<<
// Manually set the Onshape folder ID where all new documents will be created.
// If this is set to null, documents will be created in your account's root.
const targetFolderId = 'af89b4c072a8fb45084e1757';

// >>> SET YOUR COMPANY ID HERE <<<
const companyId = '6763516217765c31f9561958';

const app = require('./lib/app.js');
const onshape = require('./lib/onshape.js');

// Workflow ID will be fetched at startup
let workflowId = null;

// A map of common Onshape property names to their static property IDs.
const propertyIdMap = {
  'Appearance': '57f3fb8efa3416c06701d60c',
  'Name': '57f3fb8efa3416c06701d60d',
  'Description': '57f3fb8efa3416c06701d60e',
  'Category': '57f3fb8efa3416c06701d625',
  'Part number': '57f3fb8efa3416c06701d60f',
  'Revision': '57f3fb8efa3416c06701d610',
  'State': '57f3fb8efa3416c06701d611',
  'Vendor': '57f3fb8efa3416c06701d612',
  'Project': '57f3fb8efa3416c06701d613',
  'Product line': '57f3fb8efa3416c06701d614',
  'Material': '57f3fb8efa3416c06701d615',
  'Title 1': '57f3fb8efa3416c06701d616',
  'Title 2': '57f3fb8efa3416c06701d617',
  'Title 3': '57f3fb8efa3416c06701d618',
  'Drawn by': '57f3fb8efa3416c06701d619',
  'Approver': '57f3fb8efa3416c06701d61a',
  'Date drawn': '57f3fb8efa3416c06701d61b',
  'Date approved': '57f3fb8efa3416c06701d61c',
  'Not revision managed': '57f3fb8efa3416c06701d61d',
  'Exclude from all BOMs': '57f3fb8efa3416c06701d61e',
  'Start date': '57f3fb8efa3416c06701d61f',
  'Due date': '57f3fb8efa3416c06701d621',
  'Completed date': '57f3fb8efa3416c06701d622',
  'Unit of measure': '57f3fb8efa3416c06701d623',
  'Classification': '57f3fb8efa3416c06701d624',
  'Mass': '57f3fb8efa3416c06701d626',
  'Center of mass': '57f3fb8efa3416c06701d627',
  'Inertia': '57f3fb8efa3416c06701d628',
  'Last changed date': '57f3fb8efa3416c06701d629',
  'Last changed by': '57f3fb8efa3416c06701d62a',
  'Revision description': '57f3fb8efa3416c06701d62b',
  'Priority': '57f3fb8efa3416c06701d62c',
  'Need date': '57f3fb8efa3416c06701d62d',
  'Reason for change': '57f3fb8efa3416c06701d62e',
  'Proposed solution': '57f3fb8efa3416c06701d62f',
  'Inspection count': '57f3fb8efa3416c06701d630',
  'Subassembly BOM behavior': '57f3fb8efa3416c06701d633',
  'Sheet': '57f3fb8efa3416c06701d634',
  'Type': '57f3fb8efa3416c06701d635',
  'Units': '57f3fb8efa3416c06701d636',
  'Nominal value': '57f3fb8efa3416c06701d637',
  'Upper limit': '57f3fb8efa3416c06701d638',
  'Lower limit': '57f3fb8efa3416c06701d639',
  'Tolerance': '57f3fb8efa3416c06701d640',
  'Change number': '57f3fb8efa3416c06701d641',
  'Nominal & tolerance': '57f3fb8efa3416c06701d642',
  'Library label': '57f3fb8efa3416c06701d643',
  'Item': '5ace8269c046ad612c65a0ba',
  'Tessellation quality': '5ace8269c046ad612c65a0bb',
  'Quantity': '5ace84d3c046ad611c65a0dd',
  'Faces': '5ace84d3c046ad611c65a0de',
  'Suppression': '5ace84d3c046ad611c65a0df',
  'ECO': '68b76e59c462aacfb466c5a2',
  'ECO Priority': '68b77329d5d6264db394441f',
  'Urgent ECO': '68b78be43536441c2b575acb',
  'ECO_Import': '68c0f95ea01853b62770d56b',
  'Status': '68c0fa54a1edc754a12826ab',
  'X-Ref PN Import': '68c0fafba01853b6277149eb',
  'Number_Import': '68c0fb29a1edc754a1286937',
  'Checked': '68c0fbf0bdccb1e905e8667f',
  'Date Checked': '68c0fc01bdccb1e905e86a94',
  'DrawingNumber_Import': '68c0fd00bdccb1e905e8ab0f',
  'SWFormatSize_Import': '68c0fe28a1edc754a1295b13',
  'Part Family_Import': '68c0ff72a1edc754a129c663'
};

// Release a single element
const releaseElement = (docId, workId, elementId, elementName, rowData, callback) => {
  if (!workflowId) {
    console.warn('  - Skipping release: no workflow ID configured');
    callback();
    return;
  }

  // Get revision and part number from the Excel row if provided
  const rowRevision = rowData['property:Revision'];
  const rowPartNumber = rowData['property:Part number'];

  console.log(`  - Creating release package for: ${elementName}`);

  // Step 1: Create release package
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
      console.error(`  - Failed to create release package: ${createErr.body}`);
      callback();
      return;
    }

    const releasePackage = JSON.parse(createData.toString());
    const rpid = releasePackage.id;

    const item = releasePackage.items[0];

    // Use revision from Excel row, or fall back to API-assigned value
    const revisionProp = item.properties?.find(p => p.propertyId === '57f3fb8efa3416c06701d610');
    let revision = rowRevision || revisionProp?.value || '00';

    // Auto-pad numeric revisions to 2 digits (00, 01, 02, etc.)
    if (/^\d+$/.test(revision)) {
      revision = String(revision).padStart(2, '0');
    }

    // Use part number from Excel row, or fall back to API value or filename
    const partNumProp = item.properties?.find(p => p.propertyId === '57f3fb8efa3416c06701d60f');
    const partNumber = rowPartNumber || partNumProp?.value || elementName.replace(/\.[^/.]+$/, '');

    // Step 2: Submit the release
    const updatePayload = {
      id: rpid,
      href: releasePackage.href,
      documentId: docId,
      workspaceId: workId,
      properties: [
        { propertyId: '594964b7040fc85d2b418138', value: `Auto-release: ${elementName}` }
      ],
      items: [{
        id: item.id,
        documentId: item.documentId,
        workspaceId: item.workspaceId,
        elementId: item.elementId,
        href: item.href,
        properties: [
          { propertyId: '57f3fb8efa3416c06701d60f', value: partNumber },
          { propertyId: '57f3fb8efa3416c06701d610', value: revision }
        ]
      }]
    };

    onshape.post({
      path: '/api/releasepackages/' + rpid,
      query: { wfaction: 'CREATE_AND_RELEASE' },
      body: updatePayload
    }, (submitData, submitErr) => {
      if (submitErr) {
        console.error(`  - Failed to release: ${submitErr.body}`);
      } else {
        const result = JSON.parse(submitData.toString());
        if (result.workflow?.state?.name === 'RELEASED') {
          console.log(`  - ✓ Released: ${elementName} (Rev ${revision})`);
        } else {
          console.log(`  - Release state: ${result.workflow?.state?.name}`);
        }
      }
      callback();
    });
  });
};

// Function to create a template file if it doesn't exist
const createTemplateIfNotExists = (templatePath) => {
  if (!fs.existsSync(templatePath)) {
    console.log('Creating template file at:', templatePath);
    const data = [
      {
        'document:name': 'My New Document',
        'filePath': '/Users/theo/Documents/GitHub/apikey/Node/example/blobexample.txt',
        'property:Description': 'This is a test file.',
        'property:Vendor': 'Onshape',
        'property:Part number': '123-ABC'
      }
    ];
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, templatePath);
  }
};

const argv = minimist(process.argv.slice(2));

if (argv['generate-template']) {
  createTemplateIfNotExists(pathModule.normalize('Node/example/template.xlsx'));
  process.exit(0);
}

if (argv['u'] || argv['usage'] || argv['h'] || argv['help']) {
  console.log('\nThis app will bulk upload files from an Excel sheet, set their properties, and optionally release them.\n');
  console.log('\tUsage: node bulkUploadFromExcel.js -f <excelFilePath> [--release]');
  console.log('\nOptions:');
  console.log('\t-f <path>          Excel file path (required)');
  console.log('\t--release          Auto-release each file after upload');
  console.log('\t--generate-template Generate a template Excel file');
  process.exit(0);
}

const autoRelease = argv['release'] || false;

if (!argv['f']) {
  util.error({
    'message': 'The Excel file path is missing from the arguments.',
    'code': 6
  });
}

const processExcelFile = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      console.error('Excel file is empty.');
      return;
    }

    if (!data[0]['document:name']) {
      util.error({
        'message': 'The "document:name" column is missing or empty in the first row. A document name is required to begin.',
        'code': 8
      });
      return;
    }

    const uploadFileAndSetProperties = (docId, workId, row, callback) => {
      const localFilePath = row['filePath'];
      if (!localFilePath) {
        console.warn('Skipping row due to missing "filePath":', row);
        callback();
        return;
      }

      if (!fs.existsSync(localFilePath)) {
        console.error('File not found, skipping:', localFilePath);
        callback();
        return;
      }

      const mimeType = require('mime-types').lookup(localFilePath) || 'application/octet-stream';

      console.log(`Uploading file: ${localFilePath} to document ID: ${docId}`);
      app.uploadBlobElement(docId, workId, localFilePath, mimeType, (uploadData) => {
        const blobData = JSON.parse(uploadData.toString());
        console.log('  - Successfully uploaded as element ID:', blobData.id);

        const propertiesToUpdate = [];
        for (const key in row) {
          if (key.startsWith('property:')) {
            const propertyName = key.split(':')[1];
            const propertyId = propertyIdMap[propertyName];

            if (propertyId) {
              propertiesToUpdate.push({
                propertyId: propertyId,
                value: row[key]
              });
            } else {
              console.warn(`  - Warning: Property "${propertyName}" is not in the recognized list. Skipping.`);
            }
          }
        }

        const afterPropertiesUpdated = () => {
          if (autoRelease) {
            releaseElement(docId, workId, blobData.id, blobData.name, row, callback);
          } else {
            callback();
          }
        };

        if (propertiesToUpdate.length > 0) {
          console.log('  - Updating properties for element:', blobData.id);
          app.updateProperties(docId, workId, blobData.id, propertiesToUpdate, (updateData) => {
            console.log('  - Successfully updated properties.');
            afterPropertiesUpdated();
          });
        } else {
          afterPropertiesUpdated();
        }
      });
    };

    const processRowsSequentially = (index, lastDocName, lastDocId, lastWorkId) => {
      if (index >= data.length) {
        console.log('Finished processing all rows.');
        return;
      }

      const row = data[index];
      const currentDocumentName = row['document:name'];

      const onComplete = (nextDocName, nextDocId, nextWorkId) => {
        processRowsSequentially(index + 1, nextDocName, nextDocId, nextWorkId);
      };

      if (currentDocumentName && currentDocumentName !== lastDocName) {
        console.log(`Creating new document named: "${currentDocumentName}"`);
        app.createDocument(currentDocumentName, false, targetFolderId, (createData) => {
          const docInfo = JSON.parse(createData.toString());
          const newDocId = docInfo.id;
          const newWorkId = docInfo.defaultWorkspace.id;
          console.log(`  - Document created with ID: ${newDocId}`);
          console.log(`  - Default workspace ID: ${newWorkId}`);

          app.getElements(newDocId, newWorkId, (elementsData) => {
            const elements = JSON.parse(elementsData.toString());
            const deletePromises = elements.filter(element => element.name === 'Part Studio 1' || element.name === 'Assembly 1').map(element => {
              return new Promise((resolve) => {
                console.log(`  - Deleting default element: ${element.name}`);
                app.deleteElement(newDocId, newWorkId, element.id, () => {
                  resolve();
                });
              });
            });

            Promise.all(deletePromises).then(() => {
              uploadFileAndSetProperties(newDocId, newWorkId, row, () => {
                onComplete(currentDocumentName, newDocId, newWorkId);
              });
            });
          });
        });
      } else {
        uploadFileAndSetProperties(lastDocId, lastWorkId, row, () => {
          onComplete(lastDocName, lastDocId, lastWorkId);
        });
      }
    };

    processRowsSequentially(0, null, null, null);

  } catch (error) {
    console.error('Error processing Excel file:', error);
  }
};

// Main execution
const excelFilePath = pathModule.normalize(argv['f']);

if (autoRelease) {
  console.log('Auto-release enabled. Fetching workflow ID...');
  app.getCompanyPolicies(companyId, (policiesData) => {
    const policies = JSON.parse(policiesData.toString());
    workflowId = policies.releaseWorkflowId;
    if (workflowId) {
      console.log(`Using workflow ID: ${workflowId}\n`);
    } else {
      console.warn('Warning: No release workflow found. Files will be uploaded but not released.\n');
    }
    processExcelFile(excelFilePath);
  });
} else {
  processExcelFile(excelFilePath);
}
