import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import { api, fecha } from '../api';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

marked.use({
  gfm: true,
  breaks: true,
  // [[Título]] → enlace interno; si la página no existe, el clic la crea
  // como subpágina de la nota actual.
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start(src) { return src.indexOf('[['); },
      tokenizer(src) {
        const m = /^\[\[([^[\]\n]+)\]\]/.exec(src);
        if (m) return { type: 'wikilink', raw: m[0], title: m[1].trim() };
      },
      renderer(token) {
        const t = escapeHtml(token.title);
        return `<a class="wikilink" data-wiki="${t}">${t}</a>`;
      },
    },
  ],
  renderer: {
    code({ text, lang }) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      let html;
      try {
        html = language && hljs.getLanguage(language)
          ? hljs.highlight(text, { language }).value
          : escapeHtml(text);
      } catch {
        html = escapeHtml(text);
      }
      return (
        `<div class="codeblock">` +
        `<div class="codeblock-bar"><span>${escapeHtml(language || 'txt')}</span>` +
        `<button type="button" class="code-copy">copiar</button></div>` +
        `<pre><code class="hljs">${html}</code></pre></div>`
      );
    },
  },
});

const OPEN_KEY = 'olimpo.notes.open';

function TreeNode({ note, depth, childrenOf, selectedId, expanded, onToggle, onSelect, onAdd }) {
  const kids = childrenOf.get(String(note._id)) || [];
  const isOpen = expanded.has(String(note._id));
  return (
    <div className="tree-branch">
      <div
        className={`tree-row ${selectedId === note._id ? 'on' : ''}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => onSelect(note._id)}
      >
        <button
          className={`tree-caret ${kids.length ? '' : 'leaf'}`}
          onClick={(e) => { e.stopPropagation(); if (kids.length) onToggle(note._id); }}
        >
          {kids.length ? (isOpen ? '▾' : '▸') : '·'}
        </button>
        <span className="tree-icon">{note.icon || '▪'}</span>
        <span className="tree-title">{note.title || 'Sin título'}</span>
        <button
          className="tree-add"
          title="Subpágina"
          onClick={(e) => { e.stopPropagation(); onAdd(note._id); }}
        >
          +
        </button>
      </div>
      {isOpen && kids.map((k) => (
        <TreeNode
          key={k._id}
          note={k}
          depth={depth + 1}
          childrenOf={childrenOf}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}

export default function Notas() {
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null); // { title, content, icon }
  const [mode, setMode] = useState('view'); // view | edit
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); }
    catch { return new Set(); }
  });
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving
  const [error, setError] = useState('');

  const draftRef = useRef(null);
  const selectedRef = useRef(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    api.get('/notes').then(setNotes).catch((e) => setError(e.message));
    return () => clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...expanded]));
  }, [expanded]);

  const byId = useMemo(() => new Map(notes.map((n) => [String(n._id), n])), [notes]);
  const childrenOf = useMemo(() => {
    const m = new Map();
    for (const n of notes) {
      const key = n.parentId ? String(n.parentId) : 'root';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(n);
    }
    return m;
  }, [notes]);

  const crumbs = useMemo(() => {
    const path = [];
    let cur = selectedId ? byId.get(String(selectedId)) : null;
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? byId.get(String(cur.parentId)) : null;
    }
    return path;
  }, [selectedId, byId]);

  const doSave = async () => {
    const id = selectedRef.current;
    const d = draftRef.current;
    if (!id || !d || !dirtyRef.current) return;
    clearTimeout(saveTimer.current);
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      const updated = await api.patch(`/notes/${id}`, { title: d.title, content: d.content, icon: d.icon });
      setNotes((ns) => ns.map((n) => (n._id === updated._id ? updated : n)));
      if (!dirtyRef.current) setSaveState('saved');
    } catch (e) {
      dirtyRef.current = true;
      setSaveState('dirty');
      setError(e.message);
    }
  };

  const edit = (patch) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    dirtyRef.current = true;
    setSaveState('dirty');
    setError('');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 900);
  };

  const select = (id) => {
    if (dirtyRef.current) doSave();
    const n = byId.get(String(id));
    if (!n) return;
    selectedRef.current = id;
    setSelectedId(id);
    const d = { title: n.title, content: n.content, icon: n.icon || '' };
    draftRef.current = d;
    setDraft(d);
    dirtyRef.current = false;
    setSaveState('saved');
    setMode(n.content ? 'view' : 'edit');
  };

  const addPage = async (parentId = null) => {
    if (dirtyRef.current) await doSave();
    setError('');
    try {
      const created = await api.post('/notes', { title: '', content: '', parentId });
      setNotes((ns) => [...ns, created]);
      if (parentId) setExpanded((s) => new Set([...s, String(parentId)]));
      selectedRef.current = created._id;
      setSelectedId(created._id);
      const d = { title: '', content: '', icon: '' };
      draftRef.current = d;
      setDraft(d);
      dirtyRef.current = false;
      setSaveState('saved');
      setMode('edit');
    } catch (e) { setError(e.message); }
  };

  const descendantsOf = (id) => {
    const out = [];
    const stack = [String(id)];
    while (stack.length) {
      const kids = childrenOf.get(stack.pop()) || [];
      for (const k of kids) { out.push(k); stack.push(String(k._id)); }
    }
    return out;
  };

  const removePage = async () => {
    if (!selectedId) return;
    const subs = descendantsOf(selectedId).length;
    const msg = subs
      ? `¿Borrar esta página y sus ${subs} subpágina${subs === 1 ? '' : 's'}?`
      : '¿Borrar esta página?';
    if (!confirm(msg)) return;
    try {
      await api.del(`/notes/${selectedId}`);
      const dead = new Set([String(selectedId), ...descendantsOf(selectedId).map((n) => String(n._id))]);
      setNotes((ns) => ns.filter((n) => !dead.has(String(n._id))));
      selectedRef.current = null;
      setSelectedId(null);
      setDraft(null);
    } catch (e) { setError(e.message); }
  };

  const search = (text) => {
    setQ(text);
    if (!text.trim()) { setResults(null); return; }
    api.get(`/notes?q=${encodeURIComponent(text)}`).then(setResults).catch((e) => setError(e.message));
  };

  const toggle = (id) =>
    setExpanded((s) => {
      const next = new Set(s);
      const key = String(id);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Atajos: Cmd/Ctrl+S guarda, Cmd/Ctrl+E alterna lectura/edición.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 's') { e.preventDefault(); doSave(); }
      if (e.key === 'e') {
        e.preventDefault();
        if (selectedRef.current) setMode((m) => (m === 'view' ? 'edit' : 'view'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (mode === 'edit') editorRef.current?.focus();
  }, [mode, selectedId]);

  const html = useMemo(
    () => (mode === 'view' && draft ? marked.parse(draft.content || '') : ''),
    [mode, draft]
  );

  // Resuelve un [[wikilink]]: primero entre las hijas de la nota actual,
  // después en todo el árbol (por título, sin distinguir mayúsculas).
  const resolveWiki = (title) => {
    const t = title.trim().toLowerCase();
    const match = (n) => (n.title || '').trim().toLowerCase() === t;
    const kids = selectedId ? childrenOf.get(String(selectedId)) || [] : [];
    return kids.find(match) || notes.find(match) || null;
  };

  const openWiki = async (title) => {
    const existing = resolveWiki(title);
    if (existing) { select(existing._id); return; }
    if (dirtyRef.current) await doSave();
    try {
      const created = await api.post('/notes', { title: title.trim(), content: '', parentId: selectedId });
      setNotes((ns) => [...ns, created]);
      if (selectedId) setExpanded((s) => new Set([...s, String(selectedId)]));
      // byId aún no incluye la nota recién creada: se selecciona a mano.
      selectedRef.current = created._id;
      setSelectedId(created._id);
      const d = { title: created.title, content: '', icon: created.icon || '' };
      draftRef.current = d;
      setDraft(d);
      dirtyRef.current = false;
      setSaveState('saved');
      setMode('edit');
    } catch (e) { setError(e.message); }
  };

  // Marca en gris los wikilinks que aún no existen (el clic los crea).
  const mdRef = useRef(null);
  useEffect(() => {
    if (!mdRef.current) return;
    for (const a of mdRef.current.querySelectorAll('a.wikilink')) {
      a.classList.toggle('missing', !resolveWiki(a.dataset.wiki || ''));
    }
  });

  const onBodyClick = (e) => {
    const wiki = e.target.closest('a.wikilink');
    if (wiki) { openWiki(wiki.dataset.wiki || ''); return; }
    const btn = e.target.closest('.code-copy');
    if (!btn) return;
    const code = btn.closest('.codeblock')?.querySelector('code');
    if (!code) return;
    const flash = () => {
      btn.textContent = 'copiado ✓';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = 'copiar'; btn.classList.remove('done'); }, 1400);
    };
    navigator.clipboard.writeText(code.textContent).then(flash, () => {
      const ta = document.createElement('textarea');
      ta.value = code.textContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      flash();
    });
  };

  const selectedNote = selectedId ? byId.get(String(selectedId)) : null;
  const roots = childrenOf.get('root') || [];

  return (
    <div className="page notas-page">
      <div className="page-head">
        <h1>Notas</h1>
        <button className="btn terra" onClick={() => addPage(null)}>+ Página</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="notion-layout">
        <aside className="pages-panel">
          <div className="pages-search">
            <input placeholder="Buscar en todo…" value={q} onChange={(e) => search(e.target.value)} />
          </div>

          {results ? (
            <div className="pages-results">
              <div className="pages-label">{results.length} resultado{results.length === 1 ? '' : 's'}</div>
              {results.map((n) => (
                <button key={n._id} className={`result-row ${selectedId === n._id ? 'on' : ''}`} onClick={() => select(n._id)}>
                  <span className="t">{n.icon ? `${n.icon} ` : ''}{n.title || 'Sin título'}</span>
                  <span className="p">{(n.content || '').replace(/[#`*>\-|]/g, '').slice(0, 70)}</span>
                </button>
              ))}
              {results.length === 0 && <div className="empty">Nada por aquí</div>}
            </div>
          ) : (
            <div className="pages-tree">
              <div className="pages-label">Páginas</div>
              {roots.map((n) => (
                <TreeNode
                  key={n._id}
                  note={n}
                  depth={0}
                  childrenOf={childrenOf}
                  selectedId={selectedId}
                  expanded={expanded}
                  onToggle={toggle}
                  onSelect={select}
                  onAdd={addPage}
                />
              ))}
              {roots.length === 0 && <div className="empty">Sin páginas aún</div>}
            </div>
          )}
        </aside>

        <section className="doc">
          {!selectedNote || !draft ? (
            <div className="doc-empty">
              <span className="big">░░</span>
              Selecciona una página o crea una nueva.
              <span className="hint">cmd+E alterna lectura/edición · cmd+S guarda</span>
            </div>
          ) : (
            <div className="doc-inner">
              <div className="doc-top">
                <div className="doc-crumbs">
                  {crumbs.map((c, i) => (
                    <span key={c._id}>
                      {i > 0 && <span className="sep">/</span>}
                      <button className="crumb" onClick={() => select(c._id)}>{c.title || 'Sin título'}</button>
                    </span>
                  ))}
                </div>
                <div className="doc-actions">
                  <span className={`save-state ${saveState}`}>
                    {saveState === 'saved' ? 'guardado ✓' : saveState === 'saving' ? 'guardando…' : '● sin guardar'}
                  </span>
                  <div className="mode-switch">
                    <button className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}>Lectura</button>
                    <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edición</button>
                  </div>
                  <button className="btn ghost small" onClick={() => addPage(selectedId)}>+ Sub</button>
                  <button className="btn ghost small danger" onClick={removePage}>Borrar</button>
                </div>
              </div>

              <div className="doc-title-row">
                <input
                  className="doc-icon"
                  value={draft.icon}
                  placeholder="▪"
                  maxLength={4}
                  onChange={(e) => edit({ icon: e.target.value })}
                />
                <input
                  className="doc-title"
                  value={draft.title}
                  placeholder="Sin título"
                  onChange={(e) => edit({ title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setMode('edit'); } }}
                />
              </div>
              <div className="doc-meta">Editada {fecha(selectedNote.updatedAt)}</div>

              {mode === 'edit' ? (
                <textarea
                  ref={editorRef}
                  className="md-editor"
                  value={draft.content}
                  placeholder={'Markdown. Usa ``` para bloques de código y [[Título]] para enlazar (o crear) subpáginas:\n\n```bash\nssh victor@servidor\n```\n\nVer también [[Ideas sueltas]]'}
                  onChange={(e) => edit({ content: e.target.value })}
                />
              ) : (
                <div
                  ref={mdRef}
                  className="md"
                  onClick={onBodyClick}
                  onDoubleClick={() => setMode('edit')}
                  dangerouslySetInnerHTML={{ __html: html || '<p class="md-empty">Página vacía — doble clic para escribir.</p>' }}
                />
              )}

              {mode === 'view' && (childrenOf.get(String(selectedId)) || []).length > 0 && (
                <div className="doc-subpages">
                  <div className="label">Subpáginas</div>
                  {(childrenOf.get(String(selectedId)) || []).map((k) => (
                    <button key={k._id} className="subpage-link" onClick={() => select(k._id)}>
                      <span className="ico">{k.icon || '▪'}</span>
                      <span>{k.title || 'Sin título'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
