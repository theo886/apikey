var onshape = require('./onshape.js');

var getParts = function (documentId, wvm, wvmId, elementId, cb) {
  var opts = {
    d: documentId,
    e: elementId,
    resource: 'parts'
  };
  opts[wvm] = wvmId;
  onshape.get(opts, cb);
}

var getMassProperties = function (documentId, wvm, wvmId, elementId, cb) {
  var opts = {
    d: documentId,
    e: elementId,
    resource: 'partstudios',
    subresource: 'massproperties',
    query: {
      massAsGroup: false
    }
  }
  opts[wvm] = wvmId;
  onshape.get(opts, cb);
}

var createPartStudio = function (documentId, workspaceId, name, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    resource: 'partstudios'
  }
  if (typeof name === 'string') {
    opts.body = {name: name};
  }
  onshape.post(opts, cb);
}

var deleteElement = function (documentId, workspaceId, elementId, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    e: elementId,
    resource: 'elements',
  }
  onshape.delete(opts, cb);
}

var createFolder = function(name, parentId, cb) {
  var opts = {
    name: name,
    parentId: parentId
  }
  onshape.createFolder(opts, cb);
}

var uploadBlobElement = function (documentId, workspaceId, file, mimeType, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    resource: 'blobelements',
    file: file,
    mimeType: mimeType
  }
  onshape.upload(opts, cb);
}

var getDocuments = function(queryObject, cb) {
  var opts = {
    path: '/api/documents',
    query: queryObject
  }
  onshape.get(opts, cb);
}

var getProperties = function(documentId, workspaceId, elementId, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    e: elementId,
    resource: 'metadata'
  }
  onshape.get(opts, cb);
}

var updateProperties = function(documentId, workspaceId, elementId, properties, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    e: elementId,
    resource: 'metadata',
    body: {
      properties: properties
    }
  }
  onshape.post(opts, cb);
}

var getElements = function(documentId, workspaceId, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    path: '/api/documents/d/' + documentId + '/w/' + workspaceId + '/elements'
  }
  onshape.get(opts, cb);
}

var createDocument = function(name, isPublic, folderId, cb) {
  var opts = {
    name: name,
    isPublic: isPublic,
    parentId: folderId
  }
  onshape.createDocument(opts, cb);
}

var moveDocument = function(documentId, workspaceId, folderId, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    folderId: folderId
  }
  onshape.moveDocumentToFolder(opts, cb);
}

var getCompany = function(cb) {
  onshape.getCompany(cb);
}

var getCompanyPolicies = function(companyId, cb) {
  var opts = {
    cid: companyId
  }
  onshape.getCompanyPolicies(opts, cb);
}

var createReleasePackage = function(pkg, companyId, cb) {
  var opts = {
      body: pkg,
      query: {
        cid: companyId
      }
  }
  onshape.createReleasePackage(opts, cb);
}

var submitReleasePackage = function(releasePackageId, cb) {
  var opts = {
    rpid: releasePackageId
  }
  onshape.submitReleasePackage(opts, cb);
}

var partStudioStl = function (documentId, workspaceId, elementId, queryObject, cb) {
  var opts = {
    d: documentId,
    w: workspaceId,
    e: elementId,
    query: queryObject,
    resource: 'partstudios',
    subresource: 'stl',
    headers: {
      'Accept': 'application/vnd.onshape.v1+octet-stream'
    }
  };
  onshape.get(opts, cb);
}

module.exports = {
  getParts: getParts,
  getMassProperties: getMassProperties,
  createPartStudio: createPartStudio,
  deleteElement: deleteElement,
  createFolder: createFolder,
  uploadBlobElement: uploadBlobElement,
  getDocuments: getDocuments,
  getElements: getElements,
  getProperties: getProperties,
  updateProperties: updateProperties,
  createDocument: createDocument,
  deleteElement: deleteElement,
  moveDocument: moveDocument,
  getCompany: getCompany,
  getCompanyPolicies: getCompanyPolicies,
  createReleasePackage: createReleasePackage,
  submitReleasePackage: submitReleasePackage,
  partStudioStl: partStudioStl
}