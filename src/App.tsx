import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, PanelLeftOpen, X } from 'lucide-react'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { BacklinksPanel } from './components/BacklinksPanel'
import { ResizeHandle } from './components/ResizeHandle'
import { ConfirmDialog } from './components/ConfirmDialog'
import { PushDiffDialog } from './components/PushDiffDialog'
import { useVaultStore } from './store/useVaultStore'
import { useTabsStore } from './store/useTabsStore'

type ViewMode = 'edit' | 'preview' | 'split'

const SIDEBAR_COLLAPSED_KEY = 'kyanite:sidebar-collapsed'
const SIDEBAR_WIDTH_KEY = 'kyanite:sidebar-width'
const BACKLINKS_WIDTH_KEY = 'kyanite:backlinks-width'

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 480
const BACKLINKS_MIN = 200
const BACKLINKS_MAX = 480

function loadWidth(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function App() {
  const { t } = useTranslation()
  const activePath = useTabsStore((s) => s.activePath)
  const notes = useVaultStore((s) => s.notes)
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent)
  const githubConfig = useVaultStore((s) => s.githubConfig)
  const pullFromGitHub = useVaultStore((s) => s.pullFromGitHub)
  const pushNote = useVaultStore((s) => s.pushNote)
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  )
  const [sidebarWidth, setSidebarWidth] = useState(() => loadWidth(SIDEBAR_WIDTH_KEY, 260))
  const [backlinksWidth, setBacklinksWidth] = useState(() => loadWidth(BACKLINKS_WIDTH_KEY, 240))
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobileBacklinksOpen, setMobileBacklinksOpen] = useState(false)

  function toggleSidebar(collapsed: boolean) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    setSidebarCollapsed(collapsed)
  }

  function handleSidebarResize(deltaX: number) {
    setSidebarWidth((prev) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, prev + deltaX))
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next))
      return next
    })
  }

  function handleBacklinksResize(deltaX: number) {
    setBacklinksWidth((prev) => {
      // arrastar para a esquerda deve aumentar o painel (que fica à direita)
      const next = Math.min(BACKLINKS_MAX, Math.max(BACKLINKS_MIN, prev - deltaX))
      localStorage.setItem(BACKLINKS_WIDTH_KEY, String(next))
      return next
    })
  }

  // guarda a última fração de scroll vinda de cada lado, para repassar ao outro
  const [syncFraction, setSyncFraction] = useState<{ from: 'editor' | 'preview'; value: number } | null>(
    null
  )
  const rafRef = useRef<number | null>(null)

  function handleEditorScroll(fraction: number) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setSyncFraction({ from: 'editor', value: fraction }))
  }

  function handlePreviewScroll(fraction: number) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setSyncFraction({ from: 'preview', value: fraction }))
  }

  useEffect(() => {
    if (githubConfig) pullFromGitHub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // captura Ctrl+S / Cmd+S em qualquer lugar da página, não só dentro do editor,
  // para nunca deixar o browser abrir o diálogo nativo de "salvar página"
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isSaveShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'
      if (!isSaveShortcut) return
      e.preventDefault()
      if (activePath && githubConfig) pushNote(activePath)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePath, githubConfig, pushNote])

  const activeNote = notes.find((n) => n.path === activePath)

  // no mobile, trocar de nota fecha o drawer da sidebar para revelar o editor
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [activePath])

  return (
    <div className="app-layout">
      <TopBar onOpenSidebar={() => setMobileSidebarOpen(true)} />
      <div className="app-body">
        {sidebarCollapsed ? (
          <button
            className="sidebar-expand-btn"
            onClick={() => toggleSidebar(false)}
            title={t('sidebar.expand')}
          >
            <PanelLeftOpen size={16} strokeWidth={1.75} />
          </button>
        ) : (
          <>
            <div className="sidebar-desktop" style={{ width: sidebarWidth, flexShrink: 0 }}>
              <Sidebar onCollapse={() => toggleSidebar(true)} />
            </div>
            <ResizeHandle onResize={handleSidebarResize} />
          </>
        )}

        {mobileSidebarOpen && (
          <div className="mobile-drawer-overlay" onClick={() => setMobileSidebarOpen(false)}>
            <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
              <Sidebar onCollapse={() => setMobileSidebarOpen(false)} />
            </div>
          </div>
        )}

        <main className="editor-area">
          <TabBar />
          {activeNote ? (
            <>
              <div className="view-toggle">
                <button
                  className={viewMode === 'edit' ? 'active' : ''}
                  onClick={() => setViewMode('edit')}
                >
                  {t('viewToggle.edit')}
                </button>
                <button
                  className={viewMode === 'split' ? 'active' : ''}
                  onClick={() => setViewMode('split')}
                >
                  {t('viewToggle.split')}
                </button>
                <button
                  className={viewMode === 'preview' ? 'active' : ''}
                  onClick={() => setViewMode('preview')}
                >
                  {t('viewToggle.preview')}
                </button>
              </div>

              <div className={`view-panels ${viewMode === 'split' ? 'split' : ''}`}>
                {(viewMode === 'edit' || viewMode === 'split') && (
                  <Editor
                    key={activeNote.path}
                    path={activeNote.path}
                    content={activeNote.content}
                    onChange={(content) => updateNoteContent(activeNote.path, content)}
                    getNoteNames={() => notes.map((n) => n.name)}
                    onScroll={viewMode === 'split' ? handleEditorScroll : undefined}
                    scrollToFraction={
                      viewMode === 'split' && syncFraction?.from === 'preview'
                        ? syncFraction.value
                        : undefined
                    }
                  />
                )}
                {(viewMode === 'preview' || viewMode === 'split') && (
                  <Preview
                    content={activeNote.content}
                    onScroll={viewMode === 'split' ? handlePreviewScroll : undefined}
                    scrollToFraction={
                      viewMode === 'split' && syncFraction?.from === 'editor'
                        ? syncFraction.value
                        : undefined
                    }
                  />
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>{t('app.selectOrCreateNote')}</p>
            </div>
          )}
        </main>
        {activeNote && (
          <>
            <ResizeHandle onResize={handleBacklinksResize} />
            <div className="backlinks-desktop" style={{ width: backlinksWidth, flexShrink: 0 }}>
              <BacklinksPanel />
            </div>
            <button
              className="mobile-backlinks-btn"
              onClick={() => setMobileBacklinksOpen(true)}
              title={t('backlinks.title')}
            >
              <Link2 size={18} strokeWidth={1.75} />
            </button>
          </>
        )}

        {mobileBacklinksOpen && (
          <div className="mobile-drawer-overlay" onClick={() => setMobileBacklinksOpen(false)}>
            <div className="mobile-drawer mobile-drawer-right" onClick={(e) => e.stopPropagation()}>
              <button className="mobile-drawer-close" onClick={() => setMobileBacklinksOpen(false)}>
                <X size={18} strokeWidth={1.75} />
              </button>
              <BacklinksPanel />
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog />
      <PushDiffDialog />
    </div>
  )
}

export default App
