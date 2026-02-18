import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Sun, Moon, FlaskConical, GraduationCap } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { navigate } from '../lib/router';
import type { Route } from '../lib/router';
import type { LearnManifest, LearnCourse, LearnArticle } from '../types/learn';
import type { Catalogue } from '../types/catalogue';

interface LearnPageProps {
  route: Route & { page: 'learn' };
}

export function LearnPage({ route }: LearnPageProps) {
  const { darkMode, toggleDarkMode } = useAppStore();
  const [manifest, setManifest] = useState<LearnManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Scroll to top when navigating
  useEffect(() => {
    pageRef.current?.scrollTo(0, 0);
  }, [route.courseSlug, route.articleSlug]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}learn.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json() as Promise<LearnManifest>;
      })
      .then(setManifest)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className={`learn-page ${darkMode ? '' : 'light-theme'}`}>
        <div className="learn-error">Failed to load learning content: {error}</div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className={`learn-page ${darkMode ? '' : 'light-theme'}`}>
        <div className="learn-loading">Loading…</div>
      </div>
    );
  }

  const course = route.courseSlug
    ? manifest.courses.find((c) => c.slug === route.courseSlug)
    : null;

  const article = course && route.articleSlug
    ? course.articles.find((a) => a.slug === route.articleSlug)
    : null;

  // Determine back button behavior
  let backLabel: string;
  let backAction: () => void;
  if (article && course) {
    backLabel = course.title;
    backAction = () => navigate({ page: 'learn', courseSlug: course.slug });
  } else if (course) {
    backLabel = 'All courses';
    backAction = () => navigate({ page: 'learn' });
  } else {
    backLabel = 'Playground';
    backAction = () => navigate({ page: 'home' });
  }

  return (
    <div ref={pageRef} className={`learn-page ${darkMode ? '' : 'light-theme'}`}>
      <header className="learn-header">
        <button
          className="learn-back-btn"
          onClick={backAction}
          title={`Back to ${backLabel}`}
        >
          <ArrowLeft size={20} />
          <span>{backLabel}</span>
        </button>
        <div className="learn-header-title">
          <BookOpen size={20} />
          <span>Learn</span>
        </div>
        <button className="icon-btn" onClick={toggleDarkMode} title="Toggle Theme">
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {article && course ? (
        <ArticleView article={article} course={course} darkMode={darkMode} />
      ) : course ? (
        <CourseDetail course={course} />
      ) : (
        <CourseCatalogue courses={manifest.courses} />
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Course Catalogue (top-level index)
// -------------------------------------------------------------------

function CourseCatalogue({ courses }: { courses: LearnCourse[] }) {
  return (
    <div className="learn-index">
      <div className="learn-index-hero">
        <h1>Learn</h1>
        <p>
          Learning paths and hands-on labs to help you understand and build
          ontologies for Microsoft Fabric IQ.
        </p>
      </div>
      <div className="learn-card-grid">
        {courses.map((c) => (
          <button
            key={c.slug}
            className="learn-card"
            onClick={() => navigate({ page: 'learn', courseSlug: c.slug })}
          >
            <div className="learn-card-header">
              <span className="learn-card-icon">{c.icon}</span>
              <span className={`learn-card-badge learn-card-badge--${c.type}`}>
                {c.type === 'lab' ? <FlaskConical size={12} /> : <GraduationCap size={12} />}
                {c.type === 'lab' ? 'Lab' : 'Path'}
              </span>
            </div>
            <h2>{c.title}</h2>
            <p>{c.description}</p>
            <span className="learn-card-meta">
              {c.articles.length} {c.type === 'lab' ? 'steps' : 'articles'}
            </span>
            <span className="learn-card-cta">
              {c.type === 'lab' ? 'Start lab' : 'Start learning'} <ChevronRight size={16} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Course Detail (article list within a course)
// -------------------------------------------------------------------

function CourseDetail({ course }: { course: LearnCourse }) {
  return (
    <div className="learn-index">
      <div className="learn-index-hero">
        <div className="learn-course-header">
          <span className="learn-course-icon">{course.icon}</span>
          <span className={`learn-card-badge learn-card-badge--${course.type}`}>
            {course.type === 'lab' ? <FlaskConical size={12} /> : <GraduationCap size={12} />}
            {course.type === 'lab' ? 'Lab' : 'Learning Path'}
          </span>
        </div>
        <h1>{course.title}</h1>
        <p>{course.description}</p>
      </div>
      <div className="learn-card-grid">
        {course.articles.map((a) => (
          <button
            key={a.slug}
            className="learn-card"
            onClick={() => navigate({ page: 'learn', courseSlug: course.slug, articleSlug: a.slug })}
          >
            <span className="learn-card-order">
              {course.type === 'lab' ? `Step ${a.order}` : a.order}
            </span>
            <h2>{a.title}</h2>
            <p>{a.description}</p>
            <span className="learn-card-cta">
              {course.type === 'lab' ? 'Open step' : 'Read article'} <ChevronRight size={16} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Article View
// -------------------------------------------------------------------

function ArticleView({
  article,
  course,
  darkMode,
}: {
  article: LearnArticle;
  course: LearnCourse;
  darkMode: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  const nextArticle = useMemo(
    () => course.articles.find((a) => a.order === article.order + 1),
    [course.articles, article.order],
  );
  const prevArticle = useMemo(
    () => course.articles.find((a) => a.order === article.order - 1),
    [course.articles, article.order],
  );

  // Replace <ontology-embed> placeholders with live widgets
  useEffect(() => {
    if (!contentRef.current) return;
    const placeholders = contentRef.current.querySelectorAll('ontology-embed');
    for (const el of placeholders) {
      const id = el.getAttribute('id');
      const height = el.getAttribute('height') || '400px';
      const diff = el.getAttribute('diff') || '';
      if (!id) continue;
      const wrapper = document.createElement('div');
      wrapper.className = 'learn-embed-slot';
      wrapper.style.height = height;
      wrapper.dataset.catalogueId = id;
      wrapper.dataset.theme = darkMode ? 'dark' : 'light';
      if (diff) wrapper.dataset.diffId = diff;
      el.replaceWith(wrapper);
    }
  }, [article.slug, darkMode]);

  // Hydrate embed slots with real ontology data
  useEffect(() => {
    if (!contentRef.current) return;
    const slots = contentRef.current.querySelectorAll<HTMLElement>('.learn-embed-slot');
    if (slots.length === 0) return;

    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}catalogue.json`)
      .then((res) => res.json() as Promise<Catalogue>)
      .then((catalogue) => {
        if (cancelled) return;
        for (const slot of slots) {
          const id = slot.dataset.catalogueId;
          const diffId = slot.dataset.diffId;
          const entry = catalogue.entries.find((e) => e.id === id);
          if (!entry) {
            slot.innerHTML = `<div class="learn-embed-error">Ontology "${id}" not found in catalogue</div>`;
            continue;
          }
          // Find the previous-step entry for diff
          const prevEntry = diffId ? catalogue.entries.find((e) => e.id === diffId) : undefined;

          // Compute diff: which entity/relationship IDs are new vs the previous step
          let newEntityIds: Set<string> | undefined;
          let newRelIds: Set<string> | undefined;
          if (prevEntry) {
            const prevEntIds = new Set(prevEntry.ontology.entityTypes.map((et) => et.id));
            const prevRelIds = new Set(prevEntry.ontology.relationships.map((r) => r.id));
            newEntityIds = new Set(entry.ontology.entityTypes.filter((et) => !prevEntIds.has(et.id)).map((et) => et.id));
            newRelIds = new Set(entry.ontology.relationships.filter((r) => !prevRelIds.has(r.id)).map((r) => r.id));
          }
          renderEmbedSlot(slot, entry, darkMode, newEntityIds, newRelIds, prevEntry);
        }
      })
      .catch(() => {
        if (cancelled) return;
        for (const slot of slots) {
          slot.innerHTML = '<div class="learn-embed-error">Failed to load catalogue</div>';
        }
      });
    return () => { cancelled = true; };
  }, [article.slug, darkMode]);

  return (
    <div className="learn-article">
      <article className="learn-article-content" ref={contentRef}>
        <h1>{article.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: article.html }} />
      </article>
      <nav className="learn-article-nav">
        {prevArticle ? (
          <button
            className="learn-nav-btn learn-nav-prev"
            onClick={() => navigate({ page: 'learn', courseSlug: course.slug, articleSlug: prevArticle.slug })}
          >
            <ArrowLeft size={16} />
            <div>
              <span className="learn-nav-label">Previous</span>
              <span className="learn-nav-title">{prevArticle.title}</span>
            </div>
          </button>
        ) : (
          <div />
        )}
        {nextArticle && (
          <button
            className="learn-nav-btn learn-nav-next"
            onClick={() => navigate({ page: 'learn', courseSlug: course.slug, articleSlug: nextArticle.slug })}
          >
            <div>
              <span className="learn-nav-label">Next</span>
              <span className="learn-nav-title">{nextArticle.title}</span>
            </div>
            <ChevronRight size={16} />
          </button>
        )}
      </nav>
    </div>
  );
}

// -------------------------------------------------------------------
// Inline embed renderer (lightweight — uses cytoscape directly)
// -------------------------------------------------------------------

interface EmbedOntology {
  entityTypes: Array<{ id: string; name: string; icon: string; color: string }>;
  relationships: Array<{ id: string; name: string; from: string; to: string }>;
}

type EmbedEntry = { name: string; ontology: EmbedOntology };

/** Shared chessboard background CSS (mirrors .graph-container in app.css) */
function applyChessboardBg(el: HTMLElement, darkMode: boolean) {
  const dark = darkMode
    ? 'rgba(20, 30, 50, 0.85)'
    : 'rgba(220, 230, 245, 0.8)';
  const light = darkMode
    ? 'rgba(30, 50, 80, 0.65)'
    : 'rgba(240, 245, 255, 0.9)';
  el.style.backgroundImage = [
    `linear-gradient(45deg, ${dark} 25%, transparent 25%)`,
    `linear-gradient(-45deg, ${dark} 25%, transparent 25%)`,
    `linear-gradient(45deg, transparent 75%, ${dark} 75%)`,
    `linear-gradient(-45deg, transparent 75%, ${dark} 75%)`,
  ].join(',');
  el.style.backgroundSize = '40px 40px';
  el.style.backgroundPosition = '0 0, 0 20px, 20px -20px, -20px 0px';
  el.style.backgroundColor = light;
}

/** Build the shared Cytoscape style array */
function cyStyles(colors: { nodeText: string; edgeColor: string; edgeText: string }, newHighlight: string) {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'bottom' as const,
        'text-halign': 'center' as const,
        'font-size': '11px',
        'font-family': 'Segoe UI, sans-serif',
        'font-weight': 600,
        color: colors.nodeText,
        'text-margin-y': 6,
        width: 48,
        height: 48,
        'background-color': 'data(color)',
        'border-width': 2,
        'border-color': 'data(color)',
        'border-opacity': 0.5,
      },
    },
    {
      selector: 'node.new',
      style: {
        'border-width': 4,
        'border-color': newHighlight,
        'border-opacity': 1,
      },
    },
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        'font-size': '9px',
        'font-family': 'Segoe UI, sans-serif',
        color: colors.edgeText,
        'text-rotation': 'autorotate' as const,
        'text-margin-y': -12,
        'text-background-color': colors.nodeText === '#B3B3B3' ? '#1E1E1E' : '#FCFCFC',
        'text-background-opacity': 0.7,
        'text-background-padding': '2px',
        width: 1.5,
        'line-color': colors.edgeColor,
        'target-arrow-color': colors.edgeColor,
        'target-arrow-shape': 'triangle' as const,
        'curve-style': 'bezier' as const,
      },
    },
    {
      selector: 'edge.new',
      style: {
        width: 3,
        'line-color': newHighlight,
        'target-arrow-color': newHighlight,
        'line-style': 'solid' as const,
      },
    },
  ];
}

/** Mount a Cytoscape instance into a container div */
function mountGraph(
  container: HTMLElement,
  entry: EmbedEntry,
  darkMode: boolean,
  newEntityIds?: Set<string>,
  newRelIds?: Set<string>,
) {
  const newHighlight = '#00C853';
  const nodes = entry.ontology.entityTypes.map((e) => ({
    data: { id: e.id, label: `${e.icon} ${e.name}`, color: e.color },
    classes: newEntityIds?.has(e.id) ? 'new' : '',
  }));
  const edges = entry.ontology.relationships.map((r) => ({
    data: { id: r.id, source: r.from, target: r.to, label: r.name },
    classes: newRelIds?.has(r.id) ? 'new' : '',
  }));

  const colors = darkMode
    ? { nodeText: '#B3B3B3', edgeColor: '#505050', edgeText: '#808080' }
    : { nodeText: '#2A2A2A', edgeColor: '#888888', edgeText: '#555555' };

  import('cytoscape').then(({ default: cytoscape }) => {
    import('cytoscape-fcose').then(({ default: fcose }) => {
      cytoscape.use(fcose);
      cytoscape({
        container,
        elements: [...nodes, ...edges],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style: cyStyles(colors, newHighlight) as any,
        layout: {
          name: 'fcose',
          animate: false,
          fit: true,
          padding: 30,
          nodeDimensionsIncludeLabels: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        minZoom: 0.3,
        maxZoom: 3,
        userPanningEnabled: true,
        userZoomingEnabled: true,
        boxSelectionEnabled: false,
      });
    });
  });
}

function renderEmbedSlot(
  slot: HTMLElement,
  entry: EmbedEntry,
  darkMode: boolean,
  newEntityIds?: Set<string>,
  newRelIds?: Set<string>,
  prevEntry?: EmbedEntry,
) {
  const hasNew = (newEntityIds && newEntityIds.size > 0) || (newRelIds && newRelIds.size > 0);
  const hasDiff = !!prevEntry;
  const newHighlight = '#00C853';

  const borderColor = darkMode ? '#404040' : '#C0C0C0';
  slot.style.borderRadius = '8px';
  slot.style.border = `1px solid ${borderColor}`;
  slot.style.overflow = 'hidden';
  slot.innerHTML = '';
  slot.style.display = 'flex';
  slot.style.flexDirection = 'column';
  slot.style.position = 'relative';

  // ── Title bar ──────────────────────────────────────────────────
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 12px;font:600 13px/1 'Segoe UI',sans-serif;color:${darkMode ? '#B3B3B3' : '#444'};border-bottom:1px solid ${borderColor};background:${darkMode ? '#252526' : '#F3F3F3'};flex-shrink:0`;

  const titleText = document.createElement('span');
  titleText.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  titleText.textContent = entry.name;
  titleBar.appendChild(titleText);

  // Legend dot
  if (hasNew) {
    const legend = document.createElement('span');
    legend.style.cssText = `display:inline-flex;align-items:center;gap:5px;font:500 11px/1 'Segoe UI',sans-serif;color:${newHighlight};white-space:nowrap`;
    const dot = document.createElement('span');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${newHighlight};display:inline-block;flex-shrink:0`;
    legend.appendChild(dot);
    const count = (newEntityIds?.size ?? 0) + (newRelIds?.size ?? 0);
    legend.appendChild(document.createTextNode(`${count} new`));
    titleBar.appendChild(legend);
  }

  // Before / After toggle (only when there's a previous step)
  let activeView: 'after' | 'before' = 'after';
  let beforeBtn: HTMLButtonElement | undefined;
  let afterBtn: HTMLButtonElement | undefined;
  const graphContainer = document.createElement('div');

  if (hasDiff) {
    const toggleGroup = document.createElement('span');
    toggleGroup.style.cssText = 'display:inline-flex;border-radius:4px;overflow:hidden;border:1px solid ' + borderColor + ';flex-shrink:0';

    const makeTgl = (label: string, value: 'before' | 'after') => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `border:none;padding:3px 10px;font:500 11px/1 'Segoe UI',sans-serif;cursor:pointer;transition:background .15s,color .15s`;
      btn.addEventListener('click', () => {
        if (activeView === value) return;
        activeView = value;
        updateToggleStyles();
        renderActiveGraph();
      });
      return btn;
    };

    beforeBtn = makeTgl('Before', 'before');
    afterBtn = makeTgl('After', 'after');
    toggleGroup.appendChild(beforeBtn);
    toggleGroup.appendChild(afterBtn);
    titleBar.appendChild(toggleGroup);
  }

  // Maximize / fullscreen button
  const maximizeBtn = document.createElement('button');
  maximizeBtn.title = 'Toggle fullscreen';
  maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  maximizeBtn.style.cssText = `border:none;background:none;cursor:pointer;color:${darkMode ? '#B3B3B3' : '#666'};padding:2px;display:flex;align-items:center;flex-shrink:0`;
  let isFullscreen = false;
  let savedHeight = '';
  maximizeBtn.addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      savedHeight = slot.style.height;
      slot.style.cssText = '';
      slot.classList.add('learn-embed-fullscreen');
    } else {
      slot.classList.remove('learn-embed-fullscreen');
      slot.style.height = savedHeight;
    }
    // Re-apply inline styles that classList doesn't cover
    slot.style.borderRadius = isFullscreen ? '0' : '8px';
    slot.style.border = isFullscreen ? 'none' : `1px solid ${borderColor}`;
    slot.style.overflow = 'hidden';
    slot.style.display = 'flex';
    slot.style.flexDirection = 'column';
    slot.style.position = isFullscreen ? 'fixed' : 'relative';
    if (isFullscreen) {
      maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6m0 0v6m0-6L3 21M20 10h-6m0 0V4m0 6l7-7"/></svg>';
    } else {
      maximizeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    }
    renderActiveGraph();
  });
  titleBar.appendChild(maximizeBtn);
  slot.appendChild(titleBar);

  // ── Graph area ─────────────────────────────────────────────────
  graphContainer.style.cssText = 'flex:1;width:100%;min-height:0;position:relative';
  slot.appendChild(graphContainer);

  function updateToggleStyles() {
    if (!beforeBtn || !afterBtn) return;
    const activeBg = darkMode ? '#0078D4' : '#0078D4';
    const inactiveBg = darkMode ? '#2D2D2D' : '#FFFFFF';
    const activeCol = '#FFFFFF';
    const inactiveCol = darkMode ? '#888' : '#666';
    beforeBtn.style.background = activeView === 'before' ? activeBg : inactiveBg;
    beforeBtn.style.color = activeView === 'before' ? activeCol : inactiveCol;
    afterBtn.style.background = activeView === 'after' ? activeBg : inactiveBg;
    afterBtn.style.color = activeView === 'after' ? activeCol : inactiveCol;
  }

  function renderActiveGraph() {
    graphContainer.innerHTML = '';
    const graphDiv = document.createElement('div');
    graphDiv.style.cssText = 'width:100%;height:100%';
    applyChessboardBg(graphDiv, darkMode);
    graphContainer.appendChild(graphDiv);

    if (activeView === 'before' && prevEntry) {
      mountGraph(graphDiv, prevEntry, darkMode);
    } else {
      mountGraph(graphDiv, entry, darkMode, newEntityIds, newRelIds);
    }
  }

  updateToggleStyles();
  renderActiveGraph();
}
