const identityDocument = require('./identityDocument');
const jewel = require('./jewel');

const DEFAULT_TYPE = identityDocument.type;

const REGISTRY = {
  [identityDocument.type]: identityDocument,
  [jewel.type]: jewel
};

function resolveType(raw) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, raw) ? raw : DEFAULT_TYPE;
}

function getRecognizer(raw) {
  return REGISTRY[resolveType(raw)];
}

module.exports = { getRecognizer, resolveType, DEFAULT_TYPE };
