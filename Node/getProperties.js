var app = require('./lib/app.js');

var getProperties = function () {
  // First, get a list of all documents
  app.getDocuments({owner: 'me', ownerType: 0}, function (data) {
    var docs = JSON.parse(data.toString()).items;
    
    // For each document, get its elements
    docs.forEach(function(doc) {
      if (doc.defaultWorkspace && doc.defaultWorkspace.id) {
        console.log('Fetching elements for document: ' + doc.name);
        
        app.getElements(doc.id, doc.defaultWorkspace.id, function (elementData) {
          var elements = JSON.parse(elementData.toString());
          
          elements.forEach(function(element) {
            // Skip fetching properties for non-editable types like BOM tables
            if (element.elementType !== 'BILLOFMATERIALS') {
              console.log('  - Element Name: ' + element.name + ', ID: ' + element.id + ', Type: ' + element.elementType);
              
              // Get and display the properties for each element
              app.getProperties(doc.id, doc.defaultWorkspace.id, element.id, function(propertiesData) {
                try {
                  var properties = JSON.parse(propertiesData.toString());
                  console.log('    Properties:');
                  if (properties.properties) {
                    properties.properties.forEach(function(prop) {
                      var propValue = prop.value;
                      if (typeof propValue === 'object' && propValue !== null) {
                        propValue = JSON.stringify(propValue);
                      }
                      console.log('      - ' + prop.name + ': ' + propValue);
                    });
                  }
                } catch (e) {
                  console.log('    Could not parse properties for element ' + element.name);
                }
              });
            }
          });
        });
      }
    });
  });
};

getProperties();
