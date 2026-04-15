import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Download, FileJson, AlertCircle, CheckCircle, RotateCcw, Copy, FileText, Table, Share2, Cloud, Link, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { serializeToRDF, serializeToTurtle, serializeToJSONLD } from '../lib/rdf/serializer';
import { parseRDF, parseTurtle, parseJSONLD, RDFParseError } from '../lib/rdf/parser';
import type { Ontology, DataBinding } from '../data/ontology';

const LEGACY_FORMATS_ENABLED = import.meta.env.VITE_ENABLE_LEGACY_FORMATS === 'true';

interface ImportExportModalProps {
  onClose: () => void;
  onFabricPush?: () => void;
}

const sampleSchema = `{
  "ontology": {
    "name": "My Ontology",
    "description": "Description here",
    "entityTypes": [
      {
        "id": "entity1",
        "name": "Entity Name",
        "description": "What this entity represents",
        "icon": "📦",
        "color": "#0078D4",
        "properties": [
          { "name": "id", "type": "string", "isIdentifier": true },
          { "name": "name", "type": "string" }
        ]
      }
    ],
    "relationships": [
      {
        "id": "rel1",
        "name": "connects_to",
        "from": "entity1",
        "to": "entity2",
        "cardinality": "1:n"
      }
    ]
  },
  "bindings": []
}`;

export function ImportExportModal({ onClose, onFabricPush }: ImportExportModalProps) {
  const { currentOntology, dataBindings, loadOntology, resetToDefault, exportOntology } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'yaml' | 'csv' | 'rdf'>('rdf');
  const [rdfDropdownOpen, setRdfDropdownOpen] = useState(false);
  const rdfDropdownRef = useRef<HTMLDivElement>(null);
  const [jsonldSubmenuOpen, setJsonldSubmenuOpen] = useState(false);

  const [urlInput, setUrlInput] = useState('');
  const [urlImportStatus, setUrlImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [urlErrorMessage, setUrlErrorMessage] = useState('');

  const parseImportContent = (content: string, fileName: string): { ontology: Ontology; bindings: DataBinding[] } => {
    const trimmed = content.trimStart();
    const lowerName = fileName.toLowerCase();

    // Detect format by extension and content
    const isRdfXml = lowerName.endsWith('.rdf') || lowerName.endsWith('.owl') || lowerName.endsWith('.iq') ||
                     trimmed.startsWith('<?xml') || trimmed.startsWith('<rdf:RDF') || trimmed.startsWith('<Ontology');
    const isTurtle = lowerName.endsWith('.ttl') || lowerName.endsWith('.n3') ||
                     (trimmed.startsWith('@prefix') || trimmed.startsWith('@base') ||
                      /^\s*PREFIX\s+/i.test(trimmed) || /\s+a\s+owl:Class\s+/.test(trimmed));
    const isJsonLd = lowerName.endsWith('.jsonld') || lowerName.endsWith('.json') ||
                     trimmed.startsWith('{') || trimmed.startsWith('[');

    if (isRdfXml) {
      return parseRDF(content);
    } else if (isTurtle) {
      return parseTurtle(content);
    } else if (isJsonLd) {
      return parseJSONLD(content);
    } else if (LEGACY_FORMATS_ENABLED && trimmed.startsWith('{')) {
      // Legacy JSON format
      const parsed = JSON.parse(content);
      if (!parsed.ontology || !parsed.ontology.entityTypes || !parsed.ontology.relationships) {
        throw new Error('Invalid ontology structure. Must have ontology.entityTypes and ontology.relationships.');
      }
      return { ontology: parsed.ontology, bindings: parsed.bindings || [] };
    }

    throw new Error(`Cannot detect format for "${fileName}". Supported formats: RDF/XML (.rdf, .owl), Turtle (.ttl), JSON-LD (.jsonld, .json)`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const { ontology, bindings } = parseImportContent(content, file.name);

        // Fall back to filename (without extension) if no ontology name was parsed
        if (!ontology.name) {
          ontology.name = file.name.replace(/\.[^.]+$/, '');
        }

        loadOntology(ontology, bindings);
        setImportStatus('success');
        setErrorMessage('');
        
        // Auto-close after success
        setTimeout(() => onClose(), 1500);
      } catch (err) {
        setImportStatus('error');
        if (err instanceof RDFParseError) {
          setErrorMessage(`RDF parse error: ${err.message}`);
        } else {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to parse file');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setUrlImportStatus('loading');
    setUrlErrorMessage('');

    try {
      const response = await fetch(urlInput.trim());
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      const content = await response.text();

      // Try to extract filename from URL for format detection
      const urlPath = new URL(urlInput.trim()).pathname;
      const fileName = urlPath.split('/').pop() || 'ontology.rdf';

      const { ontology, bindings } = parseImportContent(content, fileName);

      if (!ontology.name) {
        ontology.name = fileName.replace(/\.[^.]+$/, '') || 'Imported from URL';
      }

      loadOntology(ontology, bindings);
      setUrlImportStatus('success');
      setTimeout(() => {
        setUrlImportStatus('idle');
        setUrlInput('');
        onClose();
      }, 1500);
    } catch (err) {
      setUrlImportStatus('error');
      if (err instanceof RDFParseError) {
        setUrlErrorMessage(`RDF parse error: ${err.message}`);
      } else {
        setUrlErrorMessage(err instanceof Error ? err.message : 'Failed to import from URL');
      }
    }
  };

  const handleExport = () => {
    let content: string;
    let mimeType: string;
    let extension: string;

    if (exportFormat === 'yaml') {
      content = exportAsYAML();
      mimeType = 'text/yaml';
      extension = 'yaml';
    } else if (exportFormat === 'csv') {
      content = exportAsCSV();
      mimeType = 'text/csv';
      extension = 'csv';
    } else if (exportFormat === 'rdf') {
      content = serializeToRDF(currentOntology, dataBindings);
      mimeType = 'application/rdf+xml';
      extension = 'rdf';
    } else {
      content = exportOntology();
      mimeType = 'application/json';
      extension = 'json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentOntology.name.toLowerCase().replace(/\s+/g, '-')}-ontology.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rdfDropdownRef.current && !rdfDropdownRef.current.contains(event.target as Node)) {
        setRdfDropdownOpen(false);
      }
    };
    if (rdfDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [rdfDropdownOpen]);

  const handleExportJSONLD = (withContext: boolean) => {
    const content = serializeToJSONLD(currentOntology, dataBindings, withContext);
    const blob = new Blob([content], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentOntology.name.toLowerCase().replace(/\s+/g, '-')}-ontology${withContext ? '' : '-no-context'}.jsonld`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportTurtle = () => {
    const content = serializeToTurtle(currentOntology, dataBindings);
    const blob = new Blob([content], { type: 'text/turtle' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentOntology.name.toLowerCase().replace(/\s+/g, '-')}-ontology.ttl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Simple YAML exporter (no external dependencies)
  const exportAsYAML = (): string => {
    const indent = (level: number) => '  '.repeat(level);
    let yaml = '';

    yaml += 'ontology:\n';
    yaml += `${indent(1)}name: "${currentOntology.name}"\n`;
    yaml += `${indent(1)}description: "${currentOntology.description || ''}"\n`;
    yaml += `${indent(1)}entityTypes:\n`;

    for (const entity of currentOntology.entityTypes) {
      yaml += `${indent(2)}- id: "${entity.id}"\n`;
      yaml += `${indent(3)}name: "${entity.name}"\n`;
      yaml += `${indent(3)}description: "${entity.description || ''}"\n`;
      yaml += `${indent(3)}icon: "${entity.icon}"\n`;
      yaml += `${indent(3)}color: "${entity.color}"\n`;
      yaml += `${indent(3)}properties:\n`;
      for (const prop of entity.properties) {
        yaml += `${indent(4)}- name: "${prop.name}"\n`;
        yaml += `${indent(5)}type: "${prop.type}"\n`;
        if (prop.isIdentifier) yaml += `${indent(5)}isIdentifier: true\n`;
      }
    }

    yaml += `${indent(1)}relationships:\n`;
    for (const rel of currentOntology.relationships) {
      yaml += `${indent(2)}- id: "${rel.id}"\n`;
      yaml += `${indent(3)}name: "${rel.name}"\n`;
      yaml += `${indent(3)}from: "${rel.from}"\n`;
      yaml += `${indent(3)}to: "${rel.to}"\n`;
      yaml += `${indent(3)}cardinality: "${rel.cardinality}"\n`;
    }

    if (dataBindings.length > 0) {
      yaml += '\nbindings:\n';
      for (const binding of dataBindings) {
        yaml += `${indent(1)}- entityTypeId: "${binding.entityTypeId}"\n`;
        yaml += `${indent(2)}source: "${binding.source}"\n`;
      }
    }

    return yaml;
  };

  // Export entities and relationships as CSV tables
  const exportAsCSV = (): string => {
    let csv = '';

    // Entity Types table
    csv += '# ENTITY TYPES\n';
    csv += 'id,name,description,icon,color,properties\n';
    for (const entity of currentOntology.entityTypes) {
      const props = entity.properties.map(p => p.name).join(';');
      csv += `"${entity.id}","${entity.name}","${entity.description || ''}","${entity.icon}","${entity.color}","${props}"\n`;
    }

    csv += '\n';

    // Relationships table
    csv += '# RELATIONSHIPS\n';
    csv += 'id,name,from,to,cardinality,description\n';
    for (const rel of currentOntology.relationships) {
      csv += `"${rel.id}","${rel.name}","${rel.from}","${rel.to}","${rel.cardinality}","${rel.description || ''}"\n`;
    }

    // Properties detail table
    csv += '\n# PROPERTIES BY ENTITY\n';
    csv += 'entity_id,property_name,property_type,is_identifier\n';
    for (const entity of currentOntology.entityTypes) {
      for (const prop of entity.properties) {
        csv += `"${entity.id}","${prop.name}","${prop.type}","${prop.isIdentifier || false}"\n`;
      }
    }

    return csv;
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(sampleSchema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    resetToDefault();
    setImportStatus('success');
    setErrorMessage('');
    setTimeout(() => onClose(), 1000);
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 650, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>Import / Export Ontology</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
              Load your own ontology or export the current one
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content wrapper */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {/* Current Ontology Info */}
        <div style={{ 
          padding: 16, 
          background: 'var(--bg-tertiary)', 
          borderRadius: 'var(--radius-md)',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>Currently Loaded</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{currentOntology.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {currentOntology.entityTypes.length} entity types, {currentOntology.relationships.length} relationships
            </div>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={handleReset}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={14} />
            Reset to Default
          </button>
        </div>

        {/* Status Messages */}
        {importStatus === 'success' && (
          <div style={{ 
            padding: 12, 
            background: 'rgba(15, 123, 15, 0.15)', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--ms-green)'
          }}>
            <CheckCircle size={18} />
            <span>Ontology loaded successfully!</span>
          </div>
        )}

        {importStatus === 'error' && (
          <div style={{ 
            padding: 12, 
            background: 'rgba(209, 52, 56, 0.15)', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: 20,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            color: '#D13438'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Import/Export Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div 
            style={{ 
              padding: 24, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-lg)',
              border: '2px dashed var(--border-primary)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInputRef.current.files = dataTransfer.files;
                fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }}
          >
            <input 
              ref={fileInputRef}
              type="file"
              accept={LEGACY_FORMATS_ENABLED ? '.json,.jsonld,.rdf,.owl,.iq,.ttl,.n3' : '.jsonld,.rdf,.owl,.iq,.ttl,.n3'}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div style={{ 
              width: 48, 
              height: 48, 
              background: 'rgba(0, 120, 212, 0.15)', 
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px'
            }}>
              <Upload size={24} color="var(--ms-blue)" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Import Ontology</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Drop RDF/XML, Turtle, JSON-LD, or JSON file here
            </div>

            {/* URL Import */}
            <div
              style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                placeholder="Or enter URL to ontology..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlImport()}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: 12,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUrlImport();
                }}
                disabled={!urlInput.trim() || urlImportStatus === 'loading'}
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: urlImportStatus === 'success' ? 'var(--ms-green)' : 'var(--ms-blue)',
                  color: 'white',
                  cursor: urlInput.trim() && urlImportStatus !== 'loading' ? 'pointer' : 'not-allowed',
                  opacity: urlInput.trim() && urlImportStatus !== 'loading' ? 1 : 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {urlImportStatus === 'loading' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Link size={14} />}
                {urlImportStatus === 'success' ? 'Imported!' : 'Import'}
              </button>
            </div>
            {urlImportStatus === 'error' && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ms-red)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                <AlertCircle size={12} /> {urlErrorMessage}
              </div>
            )}
            {urlImportStatus === 'success' && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ms-green)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                <CheckCircle size={12} /> Successfully imported from URL!
              </div>
            )}
          </div>

          <div 
            style={{ 
              padding: 24, 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-lg)',
              border: '2px solid transparent',
              textAlign: 'center'
            }}
          >
            <div style={{ 
              width: 48, 
              height: 48, 
              background: 'rgba(15, 123, 15, 0.15)', 
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px'
            }}>
              <Download size={24} color="var(--ms-green)" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Export Current</div>
            
            {/* Format Selector — only shown when legacy formats are enabled */}
            {LEGACY_FORMATS_ENABLED && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
                <button
                  onClick={() => setExportFormat('json')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'json' ? 'var(--ms-blue)' : 'var(--bg-secondary)',
                    color: exportFormat === 'json' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <FileJson size={12} />
                  JSON
                </button>
                <button
                  onClick={() => setExportFormat('yaml')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'yaml' ? 'var(--ms-purple)' : 'var(--bg-secondary)',
                    color: exportFormat === 'yaml' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <FileText size={12} />
                  YAML
                </button>
                <button
                  onClick={() => setExportFormat('csv')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'csv' ? 'var(--ms-green)' : 'var(--bg-secondary)',
                    color: exportFormat === 'csv' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Table size={12} />
                  CSV
                </button>
                <button
                  onClick={() => setExportFormat('rdf')}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: exportFormat === 'rdf' ? '#E74C3C' : 'var(--bg-secondary)',
                    color: exportFormat === 'rdf' ? 'white' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title="RDF/XML format for MS Fabric"
                >
                  <Share2 size={12} />
                  RDF
                </button>
              </div>
            )}
            
            {/* RDF Export Dropdown */}
            <div ref={rdfDropdownRef} style={{ position: 'relative', width: '100%' }}>
              <button 
                className="btn btn-primary"
                onClick={() => setRdfDropdownOpen(!rdfDropdownOpen)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Share2 size={16} />
                Download RDF
                <span style={{ marginLeft: 4, fontSize: 10 }}>{rdfDropdownOpen ? '▲' : '▼'}</span>
              </button>
              
              {rdfDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  maxHeight: 320,
                  overflowY: 'auto'
                }}>
                  <button
                    onClick={() => { handleExportTurtle(); setRdfDropdownOpen(false); }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 'var(--radius-sm)',
                      margin: 4
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <FileText size={14} color="#3498DB" />
                    <div>
                      <div style={{ fontWeight: 500 }}>Download Turtle</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>.ttl format</div>
                    </div>
                  </button>
                  <div style={{ height: 1, background: 'var(--border-primary)', margin: '0 8px' }} />
                  <button
                    onClick={() => { handleExport(); setRdfDropdownOpen(false); }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 'var(--radius-sm)',
                      margin: 4
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Share2 size={14} color="#E74C3C" />
                    <div>
                      <div style={{ fontWeight: 500 }}>RDF/XML</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>.rdf format (MS Fabric)</div>
                    </div>
                  </button>
                  <div style={{ height: 1, background: 'var(--border-primary)', margin: '0 8px' }} />
                  {/* JSON-LD with submenu */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setJsonldSubmenuOpen(!jsonldSubmenuOpen)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        textAlign: 'left',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 'var(--radius-sm)',
                        margin: 4
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileJson size={14} color="#F39C12" />
                        <div>
                          <div style={{ fontWeight: 500 }}>JSON-LD</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>.jsonld format</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 10 }}>{jsonldSubmenuOpen ? '▲' : '▼'}</span>
                    </button>
                    
                    {jsonldSubmenuOpen && (
                      <div style={{
                        marginLeft: 28,
                        marginTop: 4,
                        marginBottom: 4,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        <button
                          onClick={() => { handleExportJSONLD(true); setJsonldSubmenuOpen(false); setRdfDropdownOpen(false); }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            textAlign: 'left',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--text-primary)',
                            fontSize: 12,
                            borderRadius: 'var(--radius-sm)'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ fontWeight: 500 }}>With @context</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Includes JSON-LD context</div>
                        </button>
                        <div style={{ height: 1, background: 'var(--border-primary)', margin: '0 8px' }} />
                        <button
                          onClick={() => { handleExportJSONLD(false); setJsonldSubmenuOpen(false); setRdfDropdownOpen(false); }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            textAlign: 'left',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--text-primary)',
                            fontSize: 12,
                            borderRadius: 'var(--radius-sm)'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ fontWeight: 500 }}>Without @context</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Plain JSON structure</div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {onFabricPush && (
              <button
                className="btn btn-secondary"
                onClick={onFabricPush}
                style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Cloud size={14} />
                Push to Microsoft Fabric
              </button>
            )}
          </div>
        </div>

        {/* Schema Reference — only shown when legacy JSON format is enabled */}
        {LEGACY_FORMATS_ENABLED && (
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 12 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileJson size={16} color="var(--text-tertiary)" />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  JSON Schema Reference
                </span>
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={handleCopySchema}
              >
                <Copy size={12} style={{ marginRight: 4 }} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre style={{ 
              padding: 16, 
              background: 'var(--bg-primary)', 
              borderRadius: 'var(--radius-md)',
              fontSize: 11,
              lineHeight: 1.5,
              overflow: 'auto',
              maxHeight: 200,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)'
            }}>
              {sampleSchema}
            </pre>
          </div>
        )}

        </div>

        <div style={{ marginTop: 20, textAlign: 'center', flexShrink: 0 }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
