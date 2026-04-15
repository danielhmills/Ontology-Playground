import { useState, useEffect, useRef } from 'react';
import { Download, AlertTriangle, CheckCircle, Upload, Github, FilePlus, Undo2, Redo2, FileText, FileJson, Share2 } from 'lucide-react';
import { useDesignerStore } from '../../store/designerStore';
import type { ValidationError } from '../../store/designerStore';
import { useAppStore } from '../../store/appStore';
import { serializeToRDF, serializeToTurtle, serializeToJSONLD } from '../../lib/rdf/serializer';
import { navigate } from '../../lib/router';
import { SubmitCatalogueModal } from './SubmitCatalogueModal';

/**
 * Toolbar buttons — rendered in the designer topbar.
 */
export function DesignerToolbar() {
  const { ontology, validate, resetDraft, undo, redo, _past, _future } = useDesignerStore();
  const loadOntology = useAppStore((s) => s.loadOntology);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const canUndo = _past.length > 0;
  const canRedo = _future.length > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [exportDropdownOpen]);

  const handleValidate = () => {
    validate();
  };

  const handleExport = (format: 'turtle' | 'jsonld' | 'rdfxml') => {
    const errors = validate();
    try {
      let content: string;
      let mimeType: string;
      let extension: string;
      const suffix = errors.length > 0 ? '-draft' : '';
      const baseName = `${ontology.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'ontology'}${suffix}`;

      if (format === 'turtle') {
        content = serializeToTurtle(ontology, []);
        mimeType = 'text/turtle';
        extension = '.ttl';
      } else if (format === 'jsonld') {
        content = serializeToJSONLD(ontology, [], true);
        mimeType = 'application/ld+json';
        extension = '.jsonld';
      } else {
        content = serializeToRDF(ontology, []);
        mimeType = 'application/rdf+xml';
        extension = '.rdf';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // serialization failed — validation errors are shown in sidebar
    }
    setExportDropdownOpen(false);
  };

  const handleLoadInPlayground = () => {
    const errors = validate();
    if (errors.length > 0) return;
    loadOntology(ontology, []);
    navigate({ page: 'home' });
  };

  const handleNewOntology = () => {
    resetDraft();
  };

  const handleSubmitToCatalogue = () => {
    const errors = validate();
    if (errors.length > 0) return;
    setShowSubmitModal(true);
  };

  return (
    <>
      <div className="designer-toolbar">
        <button className="designer-toolbar-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button className="designer-toolbar-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={14} />
        </button>
        <div className="designer-toolbar-sep" />
        <button className="designer-toolbar-btn" onClick={handleNewOntology} title="New ontology">
          <FilePlus size={14} /> New
        </button>
        <button className="designer-toolbar-btn" onClick={handleValidate} title="Validate ontology">
          <CheckCircle size={14} /> Validate
        </button>
        <div className="designer-toolbar-sep" />
        <div ref={exportDropdownRef} style={{ position: 'relative' }}>
          <button
            className="designer-toolbar-btn"
            onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
            title="Export RDF"
          >
            <Download size={14} /> Export RDF {exportDropdownOpen ? '▲' : '▼'}
          </button>
          {exportDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              background: 'var(--bg-primary, #fff)',
              border: '1px solid var(--border-primary, #ddd)',
              borderRadius: 'var(--radius-md, 4px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: 160
            }}>
              <button
                className="designer-toolbar-dropdown-item"
                onClick={() => handleExport('turtle')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary, #f5f5f5)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FileText size={14} color="#3498DB" />
                <span style={{ color: 'white' }}>Turtle</span>
              </button>
              <button
                className="designer-toolbar-dropdown-item"
                onClick={() => handleExport('jsonld')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary, #f5f5f5)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FileJson size={14} color="#F39C12" />
                <span style={{ color: 'white' }}>JSON-LD</span>
              </button>
              <button
                className="designer-toolbar-dropdown-item"
                onClick={() => handleExport('rdfxml')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary, #f5f5f5)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Share2 size={14} color="#E74C3C" />
                <span style={{ color: 'white' }}>RDF/XML</span>
              </button>
            </div>
          )}
        </div>
        <button className="designer-toolbar-btn" onClick={handleLoadInPlayground} title="Load in Playground">
          <Upload size={14} /> Load in Playground
        </button>
        <button className="designer-toolbar-btn submit" onClick={handleSubmitToCatalogue} title="Submit to community catalogue">
          <Github size={14} /> Submit to Catalogue
        </button>
      </div>

      {showSubmitModal && (
        <SubmitCatalogueModal onClose={() => setShowSubmitModal(false)} />
      )}
    </>
  );
}

/**
 * Validation feedback — rendered in the sidebar.
 */
export function DesignerValidation() {
  const validationErrors = useDesignerStore((s) => s.validationErrors);
  const lastValidatedAt = useDesignerStore((s) => s._lastValidatedAt);
  const [showSuccess, setShowSuccess] = useState(false);

  // Show success banner for 3 seconds when validation runs with 0 errors
  useEffect(() => {
    if (lastValidatedAt > 0 && validationErrors.length === 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
    setShowSuccess(false);
  }, [lastValidatedAt, validationErrors.length]);

  if (validationErrors.length === 0) {
    if (!showSuccess) return null;
    return (
      <div className="designer-validation-success">
        <div className="designer-validation-header" style={{ color: 'var(--ms-green, #16c60c)' }}>
          <CheckCircle size={14} /> No issues found
        </div>
      </div>
    );
  }

  return (
    <div className="designer-validation-errors">
      <div className="designer-validation-header">
        <AlertTriangle size={14} /> {validationErrors.length} issue{validationErrors.length > 1 ? 's' : ''} to fix
      </div>
      <ul>
        {validationErrors.map((err, i) => (
          <li key={i}>
            <ErrorItem error={err} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorItem({ error }: { error: ValidationError }) {
  const selectEntity = useDesignerStore((s) => s.selectEntity);
  const selectRelationship = useDesignerStore((s) => s.selectRelationship);

  const handleClick = () => {
    if (error.entityId) {
      selectEntity(error.entityId);
    } else if (error.relationshipId) {
      selectRelationship(error.relationshipId);
    }
  };

  const isClickable = error.entityId || error.relationshipId;

  return (
    <span
      className={isClickable ? 'designer-error-link' : ''}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter') handleClick(); } : undefined}
    >
      {error.message}
    </span>
  );
}
