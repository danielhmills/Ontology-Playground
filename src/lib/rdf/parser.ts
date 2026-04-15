import type {
  Ontology,
  EntityType,
  Property,
  Relationship,
  RelationshipAttribute,
  DataBinding,
} from '../../data/ontology';

export class RDFParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RDFParseError';
  }
}

/**
 * Get the text content of a child element by local name within a parent element.
 * Searches across common RDF/OWL namespaces.
 */
function getChildText(
  parent: Element,
  localName: string,
  namespace?: string,
): string | null {
  // Try namespace-aware lookup first
  if (namespace) {
    const els = parent.getElementsByTagNameNS(namespace, localName);
    if (els.length > 0) return els[0].textContent;
  }

  // Fallback: try all children by local name match
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName) {
      return child.textContent;
    }
  }
  return null;
}

/**
 * Get the rdf:resource attribute from a child element.
 */
function getChildResource(
  parent: Element,
  localName: string,
): string | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName) {
      return (
        child.getAttribute('rdf:resource') ||
        child.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'resource')
      );
    }
  }
  return null;
}

/**
 * Get all text values from children with a given local name.
 */
function getChildTexts(parent: Element, localName: string): string[] {
  const results: string[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName && child.textContent) {
      results.push(child.textContent);
    }
  }
  return results;
}

/**
 * Extract the local name (fragment) from a URI.
 * e.g., "http://example.org/ontology/foo/Customer" → "Customer"
 */
function localNameFromUri(uri: string): string {
  const hashIdx = uri.lastIndexOf('#');
  if (hashIdx >= 0) return uri.substring(hashIdx + 1);
  const slashIdx = uri.lastIndexOf('/');
  if (slashIdx >= 0) return uri.substring(slashIdx + 1);
  return uri;
}

/**
 * Uncapitalize the first character.
 */
function uncapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

const VALID_PROPERTY_TYPES = ['string', 'integer', 'decimal', 'double', 'date', 'datetime', 'boolean', 'enum'] as const;
type PropertyType = (typeof VALID_PROPERTY_TYPES)[number];

function isValidPropertyType(t: string): t is PropertyType {
  return (VALID_PROPERTY_TYPES as readonly string[]).includes(t);
}

const XSD_TO_TYPE: Record<string, PropertyType> = {
  string: 'string',
  integer: 'integer',
  int: 'integer',
  long: 'integer',
  decimal: 'decimal',
  float: 'decimal',
  double: 'double',
  date: 'date',
  dateTime: 'datetime',
  boolean: 'boolean',
};

const VALID_CARDINALITIES = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'] as const;
type Cardinality = (typeof VALID_CARDINALITIES)[number];

function isValidCardinality(c: string): c is Cardinality {
  return (VALID_CARDINALITIES as readonly string[]).includes(c);
}

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL_NS = 'http://www.w3.org/2002/07/owl#';

interface ParsedDatatypeProperty {
  about: string;
  label: string;
  domainUri: string | null;
  rangeUri: string | null;
  comment: string | null;
  isIdentifier: boolean;
  unit: string | null;
  enumValues: string | null;
  propertyType: string | null;
  relationshipAttributeOf: string | null;
  attributeType: string | null;
}

/**
 * Parse an RDF/XML (OWL) string into an Ontology and optional DataBindings.
 */
export function parseRDF(rdfXml: string): { ontology: Ontology; bindings: DataBinding[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rdfXml, 'application/xml');

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new RDFParseError(`Malformed XML: ${parseError.textContent?.trim() || 'parse error'}`);
  }

  const root = doc.documentElement;

  // --- Extract ontology metadata ---
  let ontologyName = '';
  let ontologyDescription = '';

  const ontologyEls = root.getElementsByTagNameNS(OWL_NS, 'Ontology');
  if (ontologyEls.length > 0) {
    const ontEl = ontologyEls[0];
    ontologyName = getChildText(ontEl, 'label', RDFS_NS) || '';
    ontologyDescription = getChildText(ontEl, 'comment', RDFS_NS) || '';
  }

  // --- Extract OWL Classes → EntityTypes ---
  const classEls = root.getElementsByTagNameNS(OWL_NS, 'Class');
  const entityMap = new Map<string, EntityType>();

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const className = localNameFromUri(about);
    const entityId = uncapitalize(className);
    const label = getChildText(el, 'label', RDFS_NS) || className;
    const description = getChildText(el, 'comment', RDFS_NS) || '';
    const icon = getChildText(el, 'icon') || '📦';
    const color = getChildText(el, 'color') || '#0078D4';

    entityMap.set(about, {
      id: entityId,
      name: label,
      description,
      icon,
      color,
      properties: [],
    });
  }

  // --- Extract DatatypeProperties → Properties + Relationship Attributes ---
  const dtPropEls = root.getElementsByTagNameNS(OWL_NS, 'DatatypeProperty');
  const parsedDtProps: ParsedDatatypeProperty[] = [];

  for (let i = 0; i < dtPropEls.length; i++) {
    const el = dtPropEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const comments = getChildTexts(el, 'comment');
    const hasIdentifierComment = comments.some(c => /^identifier\s+property$/i.test(c.trim()));
    const descriptionComment = comments.find(c => !/^identifier\s+property$/i.test(c.trim())) ?? null;

    parsedDtProps.push({
      about,
      label: getChildText(el, 'label', RDFS_NS) || localNameFromUri(about),
      domainUri: getChildResource(el, 'domain'),
      rangeUri: getChildResource(el, 'range'),
      comment: descriptionComment,
      isIdentifier: getChildText(el, 'isIdentifier') === 'true' || hasIdentifierComment,
      unit: getChildText(el, 'unit'),
      enumValues: getChildText(el, 'enumValues'),
      propertyType: getChildText(el, 'propertyType'),
      relationshipAttributeOf: getChildText(el, 'relationshipAttributeOf'),
      attributeType: getChildText(el, 'attributeType'),
    });
  }

  // Collect relationship attributes separately
  const relAttrMap = new Map<string, RelationshipAttribute[]>();

  for (const dtProp of parsedDtProps) {
    if (dtProp.relationshipAttributeOf) {
      const relId = dtProp.relationshipAttributeOf;
      if (!relAttrMap.has(relId)) {
        relAttrMap.set(relId, []);
      }
      relAttrMap.get(relId)!.push({
        name: dtProp.label,
        type: dtProp.attributeType || 'string',
      });
      continue;
    }

    // Regular entity property — match to entity by domain URI
    if (!dtProp.domainUri) continue;

    const entity = entityMap.get(dtProp.domainUri);
    if (!entity) continue;

    // Determine property type
    let propType: PropertyType = 'string';
    if (dtProp.propertyType && isValidPropertyType(dtProp.propertyType)) {
      propType = dtProp.propertyType;
    } else if (dtProp.rangeUri) {
      const xsdLocal = localNameFromUri(dtProp.rangeUri);
      if (XSD_TO_TYPE[xsdLocal]) {
        propType = XSD_TO_TYPE[xsdLocal];
      }
    }

    const prop: Property = {
      name: dtProp.label,
      type: propType,
    };

    if (dtProp.isIdentifier) prop.isIdentifier = true;
    if (dtProp.unit) prop.unit = dtProp.unit;
    if (dtProp.enumValues) {
      prop.values = dtProp.enumValues.split(',');
    }
    if (dtProp.comment) prop.description = dtProp.comment;

    entity.properties.push(prop);
  }

  // --- Extract ObjectProperties → Relationships ---
  const objPropEls = root.getElementsByTagNameNS(OWL_NS, 'ObjectProperty');
  const relationships: Relationship[] = [];

  for (let i = 0; i < objPropEls.length; i++) {
    const el = objPropEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const relId = localNameFromUri(about);
    const label = getChildText(el, 'label', RDFS_NS) || relId;
    const description = getChildText(el, 'comment', RDFS_NS) || undefined;

    // Get from/to entity IDs — prefer explicit ont:fromEntityId/toEntityId,
    // fallback to domain/range URI.  Always uncapitalize to match entity IDs.
    let fromId = uncapitalize(getChildText(el, 'fromEntityId') || '');
    let toId = uncapitalize(getChildText(el, 'toEntityId') || '');

    if (!fromId) {
      const domainUri = getChildResource(el, 'domain');
      if (domainUri) fromId = uncapitalize(localNameFromUri(domainUri));
    }
    if (!toId) {
      const rangeUri = getChildResource(el, 'range');
      if (rangeUri) toId = uncapitalize(localNameFromUri(rangeUri));
    }

    const cardinalityStr = getChildText(el, 'cardinality') || 'one-to-many';
    const cardinality: Cardinality = isValidCardinality(cardinalityStr)
      ? cardinalityStr
      : 'one-to-many';

    const rel: Relationship = {
      id: relId,
      name: label,
      from: fromId,
      to: toId,
      cardinality,
    };

    if (description) rel.description = description;

    // Attach relationship attributes
    const attrs = relAttrMap.get(relId);
    if (attrs && attrs.length > 0) {
      rel.attributes = attrs;
    }

    // Skip relationships with unresolved source or target
    if (!rel.from || !rel.to) continue;

    relationships.push(rel);
  }

  // --- Extract DataBindings ---
  const bindings: DataBinding[] = [];
  // Look for ont:DataBinding elements (they use the ontology namespace)
  const allElements = root.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const localName = el.localName || el.tagName.split(':').pop();
    if (localName !== 'DataBinding') continue;

    const entityId = getChildText(el, 'boundEntityId') || '';
    const source = getChildText(el, 'source') || '';
    const table = getChildText(el, 'table') || '';
    const mappingTexts = getChildTexts(el, 'columnMapping');

    const columnMappings: Record<string, string> = {};
    for (const mapping of mappingTexts) {
      const eqIdx = mapping.indexOf('=');
      if (eqIdx > 0) {
        columnMappings[mapping.substring(0, eqIdx)] = mapping.substring(eqIdx + 1);
      }
    }

    if (entityId) {
      bindings.push({ entityTypeId: entityId, source, table, columnMappings });
    }
  }

  // --- Build the Ontology ---
  const entityTypes = Array.from(entityMap.values());

  if (!ontologyName && entityTypes.length === 0) {
    throw new RDFParseError('No ontology metadata or OWL classes found in the RDF document.');
  }

  const ontology: Ontology = {
    name: ontologyName || 'Imported Ontology',
    description: ontologyDescription,
    entityTypes,
    relationships,
  };

  return { ontology, bindings };
}

// ============================================================================
// TURTLE PARSER
// ============================================================================

/**
 * Parse a Turtle (TTL) string into an Ontology and optional DataBindings.
 * This is a simplified parser that handles common OWL-in-Turtle patterns.
 */
export function parseTurtle(turtle: string): { ontology: Ontology; bindings: DataBinding[] } {
  const lines = turtle.split('\n');
  let ontologyName = '';
  let ontologyDescription = '';
  const entityMap = new Map<string, EntityType>();
  const dtProps: ParsedDatatypeProperty[] = [];
  const relAttrMap = new Map<string, RelationshipAttribute[]>();
  const relationships: Relationship[] = [];
  const bindings: DataBinding[] = [];

  // Helper to extract value from triple pattern
  const extractValue = (line: string, predicate: string): string | null => {
    const regex = new RegExp(`${predicate}\\s+"([^"]+)"`);
    const match = line.match(regex);
    return match ? match[1] : null;
  };

  // Helper to extract URI from triple pattern
  const extractUri = (line: string, predicate: string): string | null => {
    const regex = new RegExp(`${predicate}\\s+(?:<([^>]+)>|([^\\s;]+))`);
    const match = line.match(regex);
    return match ? (match[1] || match[2]) : null;
  };

  // Parse subject blocks (simplified - assumes well-formatted Turtle)
  const blocks: string[] = [];
  let currentBlock = '';
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('@prefix') || trimmed.startsWith('@base')) {
      // Prefix declarations - skip for now
      continue;
    }

    braceDepth += (trimmed.match(/\{/g) || []).length;
    braceDepth -= (trimmed.match(/\}/g) || []).length;

    currentBlock += ' ' + trimmed;

    // Block ends with a period and not inside braces
    if (trimmed.endsWith('.') && braceDepth === 0) {
      blocks.push(currentBlock.trim());
      currentBlock = '';
    }
  }

  // First pass: extract ontology metadata
  for (const block of blocks) {
    const ontMatch = block.match(/<([^>]+)>\s+a\s+(?:owl:|<http:\/\/www\.w3\.org\/2002\/07\/owl#>)Ontology/);
    if (ontMatch) {
      ontologyName = extractValue(block, 'rdfs:label') || extractValue(block, '<http://www.w3.org/2000/01/rdf-schema#label>') || '';
      ontologyDescription = extractValue(block, 'rdfs:comment') || extractValue(block, '<http://www.w3.org/2000/01/rdf-schema#comment>') || '';
    }
  }

  // Second pass: extract OWL Classes
  for (const block of blocks) {
    const classMatch = block.match(/<([^>]+)>\s+a\s+(?:owl:|<http:\/\/www\.w3\.org\/2002\/07\/owl#>)Class/);
    if (classMatch) {
      const about = classMatch[1];
      const className = localNameFromUri(about);
      const entityId = uncapitalize(className);
      const label = extractValue(block, 'rdfs:label') || className;
      const description = extractValue(block, 'rdfs:comment') || '';
      const icon = extractValue(block, 'ont:icon') || extractValue(block, '<http://example.org/ont#icon>') || '📦';
      const color = extractValue(block, 'ont:color') || extractValue(block, '<http://example.org/ont#color>') || '#0078D4';

      entityMap.set(entityId, {
        id: entityId,
        name: label,
        description,
        icon,
        color,
        properties: [],
      });
    }
  }

  // Third pass: extract DatatypeProperties
  for (const block of blocks) {
    const propMatch = block.match(/<([^>]+)>\s+a\s+(?:owl:|<http:\/\/www\.w3\.org\/2002\/07\/owl#>)DatatypeProperty/);
    if (propMatch) {
      const about = propMatch[1];
      const label = extractValue(block, 'rdfs:label') || localNameFromUri(about);
      const domainUri = extractUri(block, 'rdfs:domain') || extractUri(block, '<http://www.w3.org/2000/01/rdf-schema#domain>');
      const rangeUri = extractUri(block, 'rdfs:range') || extractUri(block, '<http://www.w3.org/2000/01/rdf-schema#range>');
      const comment = extractValue(block, 'rdfs:comment') || extractValue(block, '<http://www.w3.org/2000/01/rdf-schema#comment>');
      const isIdentifierStr = extractValue(block, 'ont:isIdentifier') || extractValue(block, '<http://example.org/ont#isIdentifier>');
      const unit = extractValue(block, 'ont:unit') || extractValue(block, '<http://example.org/ont#unit>');
      const enumValues = extractValue(block, 'ont:enumValues') || extractValue(block, '<http://example.org/ont#enumValues>');
      const propertyType = extractValue(block, 'ont:propertyType') || extractValue(block, '<http://example.org/ont#propertyType>');
      const relationshipAttributeOf = extractValue(block, 'ont:relationshipAttributeOf') || extractValue(block, '<http://example.org/ont#relationshipAttributeOf>');
      const attributeType = extractValue(block, 'ont:attributeType') || extractValue(block, '<http://example.org/ont#attributeType>');

      dtProps.push({
        about,
        label,
        domainUri,
        rangeUri,
        comment,
        isIdentifier: isIdentifierStr === 'true',
        unit,
        enumValues,
        propertyType,
        relationshipAttributeOf,
        attributeType,
      });
    }
  }

  // Fourth pass: extract ObjectProperties (Relationships)
  for (const block of blocks) {
    const propMatch = block.match(/<([^>]+)>\s+a\s+(?:owl:|<http:\/\/www\.w3\.org\/2002\/07\/owl#>)ObjectProperty/);
    if (propMatch) {
      const about = propMatch[1];
      const relId = localNameFromUri(about);
      const label = extractValue(block, 'rdfs:label') || relId;
      const description = extractValue(block, 'rdfs:comment') || '';

      let fromId = uncapitalize(extractValue(block, 'ont:fromEntityId') || extractValue(block, '<http://example.org/ont#fromEntityId>') || '');
      let toId = uncapitalize(extractValue(block, 'ont:toEntityId') || extractValue(block, '<http://example.org/ont#toEntityId>') || '');

      if (!fromId) {
        const domainUri = extractUri(block, 'rdfs:domain') || extractUri(block, '<http://www.w3.org/2000/01/rdf-schema#domain>');
        if (domainUri) fromId = uncapitalize(localNameFromUri(domainUri));
      }
      if (!toId) {
        const rangeUri = extractUri(block, 'rdfs:range') || extractUri(block, '<http://www.w3.org/2000/01/rdf-schema#range>');
        if (rangeUri) toId = uncapitalize(localNameFromUri(rangeUri));
      }

      const cardinalityStr = extractValue(block, 'ont:cardinality') || extractValue(block, '<http://example.org/ont#cardinality>') || 'one-to-many';
      const cardinality: Cardinality = isValidCardinality(cardinalityStr) ? cardinalityStr : 'one-to-many';

      const rel: Relationship = {
        id: relId,
        name: label,
        from: fromId,
        to: toId,
        cardinality,
      };

      if (description) rel.description = description;

      // Attach relationship attributes
      const attrs = relAttrMap.get(relId);
      if (attrs && attrs.length > 0) {
        rel.attributes = attrs;
      }

      if (rel.from && rel.to) {
        relationships.push(rel);
      }
    }
  }

  // Fifth pass: extract DataBindings
  for (const block of blocks) {
    const bindingMatch = block.match(/_:\w+\s+a\s+(?:ont:|<http:\/\/example\.org\/ont#>)DataBinding/);
    if (bindingMatch) {
      const entityId = uncapitalize(extractValue(block, 'ont:boundEntityId') || extractValue(block, '<http://example.org/ont#boundEntityId>') || '');
      const source = extractValue(block, 'ont:source') || extractValue(block, '<http://example.org/ont#source>') || '';
      const table = extractValue(block, 'ont:table') || extractValue(block, '<http://example.org/ont#table>') || '';

      const columnMappings: Record<string, string> = {};
      // Parse columnMappings array pattern: ont:columnMapping "prop=col", "prop2=col2"
      const mappingMatch = block.match(/(?:ont:columnMapping|<http:\/\/example\.org\/ont#columnMapping>)\s+((?:"[^"]+"\s*,\s*)*"[^"]+")/);
      if (mappingMatch) {
        const mappingsStr = mappingMatch[1];
        const mappings = mappingsStr.match(/"([^"]+)"/g);
        if (mappings) {
          for (const m of mappings) {
            const clean = m.replace(/"/g, '');
            const eqIdx = clean.indexOf('=');
            if (eqIdx > 0) {
              columnMappings[clean.substring(0, eqIdx)] = clean.substring(eqIdx + 1);
            }
          }
        }
      }

      if (entityId) {
        bindings.push({ entityTypeId: entityId, source, table, columnMappings });
      }
    }
  }

  // Attach properties to entities
  for (const dtProp of dtProps) {
    if (!dtProp.domainUri) continue;
    const entityId = uncapitalize(localNameFromUri(dtProp.domainUri));
    const entity = entityMap.get(entityId);
    if (!entity) continue;

    let propType: PropertyType = 'string';
    if (dtProp.rangeUri) {
      const xsdLocal = localNameFromUri(dtProp.rangeUri);
      if (XSD_TO_TYPE[xsdLocal]) {
        propType = XSD_TO_TYPE[xsdLocal];
      }
    }
    if (dtProp.propertyType && isValidPropertyType(dtProp.propertyType)) {
      propType = dtProp.propertyType;
    }

    const prop: Property = {
      name: dtProp.label,
      type: propType,
    };

    if (dtProp.isIdentifier) prop.isIdentifier = true;
    if (dtProp.unit) prop.unit = dtProp.unit;
    if (dtProp.enumValues) prop.values = dtProp.enumValues.split(',');
    if (dtProp.comment) prop.description = dtProp.comment;

    entity.properties.push(prop);
  }

  const entityTypes = Array.from(entityMap.values());

  if (!ontologyName && entityTypes.length === 0) {
    throw new RDFParseError('No ontology metadata or OWL classes found in the Turtle document.');
  }

  const ontology: Ontology = {
    name: ontologyName || 'Imported Ontology',
    description: ontologyDescription,
    entityTypes,
    relationships,
  };

  return { ontology, bindings };
}

// ============================================================================
// JSON-LD PARSER
// ============================================================================

/**
 * Parse a JSON-LD string into an Ontology and optional DataBindings.
 */
export function parseJSONLD(jsonld: string): { ontology: Ontology; bindings: DataBinding[] } {
  let doc: unknown;
  try {
    doc = JSON.parse(jsonld);
  } catch (err) {
    throw new RDFParseError(`Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
  }

  if (!doc || typeof doc !== 'object') {
    throw new RDFParseError('JSON-LD document must be an object');
  }

  const docObj = doc as Record<string, unknown>;

  // Check if this is our native format (has ontology property)
  if (docObj.ontology && typeof docObj.ontology === 'object') {
    const ontology = docObj.ontology as Ontology;
    const bindings = (docObj.bindings as DataBinding[]) || [];
    if (!ontology.entityTypes || !Array.isArray(ontology.entityTypes)) {
      throw new RDFParseError('Invalid ontology structure: missing entityTypes array');
    }
    return { ontology, bindings };
  }

  // Otherwise, treat as generic JSON-LD and extract OWL patterns
  let ontologyName = '';
  let ontologyDescription = '';
  const entityMap = new Map<string, EntityType>();
  const relationships: Relationship[] = [];
  const bindings: DataBinding[] = [];

  // Extract graph - could be @graph or the document itself
  let graph: unknown[] = [];
  if (docObj['@graph'] && Array.isArray(docObj['@graph'])) {
    graph = docObj['@graph'];
  } else if (Array.isArray(doc)) {
    graph = doc;
  } else {
    graph = [doc];
  }

  // Helper to get @type values
  const getTypes = (obj: Record<string, unknown>): string[] => {
    const type = obj['@type'];
    if (!type) return [];
    if (typeof type === 'string') return [type];
    if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string');
    return [];
  };

  // Helper to get property value (handles @value and direct values)
  const getValue = (obj: Record<string, unknown>, key: string): string | null => {
    const val = obj[key];
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && '@value' in first) {
        return String(first['@value']);
      }
    }
    if (val && typeof val === 'object' && '@value' in val) {
      return String(val['@value']);
    }
    return null;
  };

  // Helper to get ID
  const getId = (obj: Record<string, unknown>): string | null => {
    const id = obj['@id'];
    return typeof id === 'string' ? id : null;
  };

  // Helper to check if type matches
  const hasType = (obj: Record<string, unknown>, typeName: string): boolean => {
    const types = getTypes(obj);
    return types.some(t => {
      if (t === typeName) return true;
      if (t === `owl:${typeName}`) return true;
      if (t === `http://www.w3.org/2002/07/owl#${typeName}`) return true;
      return false;
    });
  };

  // First pass: find Ontology metadata
  for (const item of graph) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (hasType(obj, 'Ontology')) {
      ontologyName = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#label') ||
                     getValue(obj, 'rdfs:label') ||
                     getValue(obj, 'http://purl.org/dc/elements/1.1/title') ||
                     getValue(obj, 'dc:title') ||
                     getValue(obj, 'http://purl.org/dc/terms/title') ||
                     '';
      ontologyDescription = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#comment') ||
                            getValue(obj, 'rdfs:comment') ||
                            getValue(obj, 'http://purl.org/dc/elements/1.1/description') ||
                            '';
    }
  }

  // Second pass: find Classes
  for (const item of graph) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (hasType(obj, 'Class')) {
      const about = getId(obj);
      if (!about) continue;

      const className = localNameFromUri(about);
      const entityId = uncapitalize(className);
      const label = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#label') ||
                    getValue(obj, 'rdfs:label') ||
                    className;
      const description = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#comment') ||
                          getValue(obj, 'rdfs:comment') ||
                          '';
      const icon = getValue(obj, 'http://example.org/ont#icon') ||
                   getValue(obj, 'ont:icon') ||
                   '📦';
      const color = getValue(obj, 'http://example.org/ont#color') ||
                    getValue(obj, 'ont:color') ||
                    '#0078D4';

      const properties: Property[] = [];

      // Look for properties embedded in the class (our specific extension)
      const props = obj['http://example.org/ont#properties'] || obj['ont:properties'];
      if (Array.isArray(props)) {
        for (const p of props) {
          if (!p || typeof p !== 'object') continue;
          const propObj = p as Record<string, unknown>;
          const name = getValue(propObj, 'name') || '';
          const type = getValue(propObj, 'type') || 'string';
          const prop: Property = { name, type: isValidPropertyType(type) ? type : 'string' };
          if (propObj.isIdentifier === true) prop.isIdentifier = true;
          const unit = getValue(propObj, 'unit');
          if (unit) prop.unit = unit;
          const values = propObj.values;
          if (Array.isArray(values)) prop.values = values.filter((v): v is string => typeof v === 'string');
          const desc = getValue(propObj, 'description');
          if (desc) prop.description = desc;
          properties.push(prop);
        }
      }

      entityMap.set(entityId, {
        id: entityId,
        name: label,
        description,
        icon,
        color,
        properties,
      });
    }
  }

  // Third pass: find DatatypeProperties
  for (const item of graph) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (hasType(obj, 'DatatypeProperty')) {
      const about = getId(obj);
      if (!about) continue;

      const label = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#label') ||
                    getValue(obj, 'rdfs:label') ||
                    localNameFromUri(about);
      const domainUri = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#domain') ||
                          getValue(obj, 'rdfs:domain');
      const rangeUri = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#range') ||
                       getValue(obj, 'rdfs:range');
      const comment = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#comment') ||
                      getValue(obj, 'rdfs:comment');
      const isIdentifier = getValue(obj, 'http://example.org/ont#isIdentifier') === 'true';
      const unit = getValue(obj, 'http://example.org/ont#unit') ||
                   getValue(obj, 'ont:unit') ||
                   null;
      const enumValues = getValue(obj, 'http://example.org/ont#enumValues') ||
                         getValue(obj, 'ont:enumValues');
      const propertyType = getValue(obj, 'http://example.org/ont#propertyType') ||
                           getValue(obj, 'ont:propertyType');

      if (!domainUri) continue;
      const entityId = uncapitalize(localNameFromUri(domainUri));
      const entity = entityMap.get(entityId);
      if (!entity) continue;

      let propType: PropertyType = 'string';
      if (rangeUri) {
        const xsdLocal = localNameFromUri(rangeUri);
        if (XSD_TO_TYPE[xsdLocal]) {
          propType = XSD_TO_TYPE[xsdLocal];
        }
      }
      if (propertyType && isValidPropertyType(propertyType)) {
        propType = propertyType;
      }

      const prop: Property = { name: label, type: propType };
      if (isIdentifier) prop.isIdentifier = true;
      if (unit) prop.unit = unit;
      if (enumValues) prop.values = enumValues.split(',');
      if (comment) prop.description = comment;

      entity.properties.push(prop);
    }
  }

  // Fourth pass: find ObjectProperties (Relationships)
  for (const item of graph) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (hasType(obj, 'ObjectProperty')) {
      const about = getId(obj);
      if (!about) continue;

      const relId = localNameFromUri(about);
      const label = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#label') ||
                    getValue(obj, 'rdfs:label') ||
                    relId;
      const description = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#comment') ||
                          getValue(obj, 'rdfs:comment') ||
                          undefined;

      let fromId = uncapitalize(getValue(obj, 'http://example.org/ont#fromEntityId') ||
                                  getValue(obj, 'ont:fromEntityId') ||
                                  '');
      let toId = uncapitalize(getValue(obj, 'http://example.org/ont#toEntityId') ||
                                getValue(obj, 'ont:toEntityId') ||
                                '');

      if (!fromId) {
        const domainUri = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#domain') ||
                            getValue(obj, 'rdfs:domain');
        if (domainUri) fromId = uncapitalize(localNameFromUri(domainUri));
      }
      if (!toId) {
        const rangeUri = getValue(obj, 'http://www.w3.org/2000/01/rdf-schema#range') ||
                          getValue(obj, 'rdfs:range');
        if (rangeUri) toId = uncapitalize(localNameFromUri(rangeUri));
      }

      const cardinalityStr = getValue(obj, 'http://example.org/ont#cardinality') ||
                             getValue(obj, 'ont:cardinality') ||
                             'one-to-many';
      const cardinality: Cardinality = isValidCardinality(cardinalityStr) ? cardinalityStr : 'one-to-many';

      const rel: Relationship = {
        id: relId,
        name: label,
        from: fromId,
        to: toId,
        cardinality,
      };

      if (description) rel.description = description;

      if (rel.from && rel.to) {
        relationships.push(rel);
      }
    }
  }

  // Fifth pass: find DataBindings
  for (const item of graph) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (hasType(obj, 'DataBinding')) {
      const entityId = uncapitalize(getValue(obj, 'http://example.org/ont#boundEntityId') ||
                                    getValue(obj, 'ont:boundEntityId') ||
                                    '');
      const source = getValue(obj, 'http://example.org/ont#source') ||
                     getValue(obj, 'ont:source') ||
                     '';
      const table = getValue(obj, 'http://example.org/ont#table') ||
                    getValue(obj, 'ont:table') ||
                    '';

      const columnMappings: Record<string, string> = {};
      const mappings = obj['http://example.org/ont#columnMapping'] || obj['ont:columnMapping'];
      if (Array.isArray(mappings)) {
        for (const m of mappings) {
          const mappingStr = typeof m === 'string' ? m : getValue(m as Record<string, unknown>, '@value');
          if (mappingStr) {
            const eqIdx = mappingStr.indexOf('=');
            if (eqIdx > 0) {
              columnMappings[mappingStr.substring(0, eqIdx)] = mappingStr.substring(eqIdx + 1);
            }
          }
        }
      }

      if (entityId) {
        bindings.push({ entityTypeId: entityId, source, table, columnMappings });
      }
    }
  }

  const entityTypes = Array.from(entityMap.values());

  if (!ontologyName && entityTypes.length === 0) {
    throw new RDFParseError('No ontology metadata or OWL classes found in the JSON-LD document.');
  }

  const ontology: Ontology = {
    name: ontologyName || 'Imported Ontology',
    description: ontologyDescription,
    entityTypes,
    relationships,
  };

  return { ontology, bindings };
}
