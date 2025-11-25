const app = require('./lib/app.js');
const onshape = require('./lib/onshape.js');

console.log('Running API diagnostic test...');

// Hypothesis 3: Test if a more complete payload changes the response
const companyId = '6763516217765c31f9561958';
const workflowId = '59b944bcd71eb79518f2176c';

const testPath = '/api/v10/releasepackages';

const testPayload = {
  workflowId: workflowId,
  items: [] // Including an empty items array
};

console.log(`\n--- Testing POST to ${testPath} with a more complete payload ---`);
const testOpts = {
  path: testPath,
  query: { cid: companyId },
  body: testPayload
};
onshape.post(testOpts, (data, err) => {
  if (err) {
    console.log(`Result: Failed with error object:`);
    console.log(JSON.stringify(err, null, 2));
  } else {
    console.log(`Result: Succeeded. Response:`);
    console.log(data.toString());
  }
  console.log('\n--- Test Complete ---');
});
