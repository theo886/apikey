const app = require('./lib/app.js');

console.log('Fetching ALL Onshape documents to find folders (this may take a moment)...');

app.getAllFolders((folderData) => {
  try {
    const data = JSON.parse(folderData.toString());

    if (data.items && Array.isArray(data.items)) {
      const folders = data.items.filter(item => item.isContainer === true);

      if (folders.length > 0) {
        console.log(`\nFound ${folders.length} folder(s) across all pages:`);
        folders.forEach(folder => {
          console.log(`- Name: "${folder.name}", ID: ${folder.id}`);
        });
      } else {
        console.log(`\nNo folders found in your account after checking ${data.items.length} total documents.`);
      }
    } else {
      console.log('\nThe API response did not contain the expected "items" array after pagination.');
      console.log('Full API response:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error('Failed to parse the response from the Onshape API.', e);
    console.error('Raw response:', folderData.toString());
  }
});

