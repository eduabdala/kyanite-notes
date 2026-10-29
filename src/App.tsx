import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Link2,
  PanelLeftOpen,
  PanelRightOpen,
  X,
  Pencil,
  Sparkles,
  Columns2,
  BookOpen,
  FileDown,
} from 'lucide-react'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { BlockEditor } from './components/BlockEditor'
import { KanbanBoard } from './components/KanbanBoard'
import { AgendaBoard } from './components/AgendaBoard'
import { CanvasBoard } from './components/CanvasBoard'
import { exportNotePdf } from './lib/pdfExport'
import { BacklinksPanel } from './components/BacklinksPanel'
import { ResizeHandle } from './components/ResizeHandle'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ConflictDialog } from './components/ConflictDialog'
import { MermaidViewer } from './components/MermaidViewer'
import { useVaultStore } from './store/useVaultStore'
import { useTabsStore } from './store/useTabsStore'
import { useUiStore } from './store/useUiStore'
import { useAgendaAlerts } from './store/useAgendaAlerts'
import { IS_CODE_WORKSPACE, isMarkdownPath } from './lib/workspace'
import { DiffView } from './components/DiffView'
import { FileViewer } from './components/FileViewer'
import { QuickOpen, type PaletteCommand } from './components/QuickOpen'
import { useIdeStore, type IdePanel } from './store/useIdeStore'
import { useCreationStore } from './store/useCreationStore'

type ViewMode = 'edit' | 'live' | 'preview' | 'split'

const SIDEBAR_COLLAPSED_KEY = 'kyanite:sidebar-collapsed'
const SIDEBAR_WIDTH_KEY = 'kyanite:sidebar-width'
const BACKLINKS_WIDTH_KEY = 'kyanite:backlinks-width'
const BACKLINKS_COLLAPSED_KEY = 'kyanite:backlinks-collapsed'
const VIEW_MODE_KEY = 'kyanite:view-mode'

const VIEW_MODES: ViewMode[] = ['edit', 'live', 'split', 'preview']

function loadViewMode(): ViewMode {
  const raw = localStorage.getItem(VIEW_MODE_KEY)
  return raw && VIEW_MODES.includes(raw as ViewMode) ? (raw as ViewMode) : 'live'
}

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
  const syncNow = useVaultStore((s) => s.syncNow)
  const pushNote = useVaultStore((s) => s.pushNote)
  const pullFromGitHub = useVaultStore((s) => s.pullFromGitHub)
  const setAutoSync = useVaultStore((s) => s.setAutoSync)
  const closeTab = useTabsStore((s) => s.closeTab)
  const closeAllTabs = useTabsStore((s) => s.closeAllTabs)
  const diffPath = useIdeStore((s) => s.diffPath)
  const setIdePanel = useIdeStore((s) => s.setPanel)
  const openQuickOpen = useIdeStore((s) => s.openQuickOpen)
  const startCreation = useCreationStore((s) => s.start)
  const kanbanEnabled = useVaultStore((s) => s.isPluginEnabled('kanban')) && !IS_CODE_WORKSPACE
  const agendaEnabled = useVaultStore((s) => s.isPluginEnabled('agenda')) && !IS_CODE_WORKSPACE
  const canvasEnabled = useVaultStore((s) => s.isPluginEnabled('canvas')) && !IS_CODE_WORKSPACE
  const getAttachmentUrl = useVaultStore((s) => s.getAttachmentUrl)
  const requestedViewMode = useUiStore((s) => s.requestedViewMode)
  const clearRequestedViewMode = useUiStore((s) => s.clearRequestedViewMode)
  const [viewMode, setViewModeState] = useState<ViewMode>(loadViewMode)

  function setViewMode(mode: ViewMode) {
    localStorage.setItem(VIEW_MODE_KEY, mode)
    setViewModeState(mode)
  }
  const [kanbanOpen, setKanbanOpen] = useState(false)
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  useAgendaAlerts()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  )
  const [backlinksCollapsed, setBacklinksCollapsed] = useState(
    () => localStorage.getItem(BACKLINKS_COLLAPSED_KEY) === 'true'
  )
  const [sidebarWidth, setSidebarWidth] = useState(() => loadWidth(SIDEBAR_WIDTH_KEY, 260))
  const [backlinksWidth, setBacklinksWidth] = useState(() => loadWidth(BACKLINKS_WIDTH_KEY, 240))
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobileBacklinksOpen, setMobileBacklinksOpen] = useState(false)

  function toggleSidebar(collapsed: boolean) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    setSidebarCollapsed(collapsed)
  }

  function toggleBacklinks(collapsed: boolean) {
    localStorage.setItem(BACKLINKS_COLLAPSED_KEY, String(collapsed))
    setBacklinksCollapsed(collapsed)
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

  // sync inicial (pull e, se houver pendências, push); o sync em background fica em store/autoSync
  useEffect(() => {
    if (githubConfig) syncNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Ctrl+S: no vault de notas envia tudo; em código (sem auto-sync) abre o painel de alterações */
  function save() {
    if (!githubConfig) return
    if (IS_CODE_WORKSPACE && !useVaultStore.getState().autoSync) {
      showIdePanel('changes')
      return
    }
    if (activePath) pushNote(activePath)
  }

  function showIdePanel(panel: IdePanel) {
    setIdePanel(panel)
    if (sidebarCollapsed) toggleSidebar(false)
    if (window.matchMedia('(max-width: 768px)').matches) setMobileSidebarOpen(true)
  }

  const paletteCommands: PaletteCommand[] = [
    { id: 'quick-open', label: t('ide.cmd.quickOpen'), shortcut: 'Ctrl+P', run: () => openQuickOpen('files') },
    ...(IS_CODE_WORKSPACE
      ? [
          { id: 'search', label: t('ide.cmd.search'), shortcut: 'Ctrl+Shift+F', run: () => showIdePanel('search') },
          {
            id: 'changes',
            label: t('ide.cmd.sourceControl'),
            shortcut: 'Ctrl+Shift+G',
            run: () => showIdePanel('changes'),
          },
          { id: 'explorer', label: t('ide.cmd.explorer'), shortcut: 'Ctrl+Shift+E', run: () => showIdePanel('explorer') },
        ]
      : []),
    { id: 'new-file', label: t(IS_CODE_WORKSPACE ? 'ide.cmd.newFile' : 'ide.cmd.newNote'), run: () => startCreation('note', '') },
    { id: 'new-folder', label: t('ide.cmd.newFolder'), run: () => startCreation('folder', '') },
    ...(githubConfig
      ? [
          { id: 'pull', label: t('ide.cmd.pull'), run: () => pullFromGitHub() },
          ...(!IS_CODE_WORKSPACE || useVaultStore.getState().autoSync
            ? [{ id: 'sync', label: t('ide.cmd.sync'), run: () => syncNow() }]
            : []),
          {
            id: 'auto-sync',
            label: t(useVaultStore.getState().autoSync ? 'ide.cmd.autoSyncOff' : 'ide.cmd.autoSyncOn'),
            run: () => setAutoSync(!useVaultStore.getState().autoSync),
          },
        ]
      : []),
    {
      id: 'toggle-sidebar',
      label: t('ide.cmd.toggleSidebar'),
      shortcut: 'Ctrl+B',
      run: () => toggleSidebar(!sidebarCollapsed),
    },
    ...(activePath
      ? [{ id: 'close-tab', label: t('ide.cmd.closeTab'), run: () => closeTab(activePath) }]
      : []),
    { id: 'close-all', label: t('ide.cmd.closeAllTabs'), run: () => closeAllTabs() },
  ]

  // atalhos globais (capturados em qualquer lugar, inclusive com o foco no editor).
  // Ctrl+S também impede o browser de abrir o diálogo nativo de "salvar página"
  const shortcutsRef = useRef<(e: KeyboardEvent) => void>(() => {})
  shortcutsRef.current = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const key = e.key.toLowerCase()
    if (key === 's' && !e.shiftKey) save()
    else if (key === 'p') openQuickOpen(e.shiftKey ? 'commands' : 'files')
    else if (key === 'b' && !e.shiftKey && IS_CODE_WORKSPACE) toggleSidebar(!sidebarCollapsed)
    else if (IS_CODE_WORKSPACE && e.shiftKey && key === 'f') showIdePanel('search')
    else if (IS_CODE_WORKSPACE && e.shiftKey && key === 'g') showIdePanel('changes')
    else if (IS_CODE_WORKSPACE && e.shiftKey && key === 'e') showIdePanel('explorer')
    else return
    e.preventDefault()
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => shortcutsRef.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const activeNote = notes.find((n) => n.path === activePath)
  // arquivos que não são markdown (workspaces de código) só têm o modo de edição
  const isMarkdownFile = activeNote ? isMarkdownPath(activeNote.path) && !activeNote.binary : true
  const effectiveViewMode: ViewMode = isMarkdownFile ? viewMode : 'edit'

  // se o plugin kanban/agenda for desativado enquanto a view está aberta, fecha a view
  useEffect(() => {
    if (!kanbanEnabled && kanbanOpen) setKanbanOpen(false)
  }, [kanbanEnabled, kanbanOpen])

  useEffect(() => {
    if (!agendaEnabled && agendaOpen) setAgendaOpen(false)
  }, [agendaEnabled, agendaOpen])

  useEffect(() => {
    if (!canvasEnabled && canvasOpen) setCanvasOpen(false)
  }, [canvasEnabled, canvasOpen])

  // abrir uma nota a partir de um cartão do canvas fecha a view para mostrar o editor
  useEffect(() => {
    setCanvasOpen(false)
  }, [activePath])

  // atalho de plugins da TopBar: abre o quadro Kanban ou a Agenda (views próprias, à parte das notas)
  useEffect(() => {
    if (!requestedViewMode) return
    if (requestedViewMode === 'board' && kanbanEnabled) setKanbanOpen(true)
    if (requestedViewMode === 'agenda' && agendaEnabled) setAgendaOpen(true)
    if (requestedViewMode === 'canvas' && canvasEnabled) setCanvasOpen(true)
    clearRequestedViewMode()
  }, [requestedViewMode, kanbanEnabled, agendaEnabled, canvasEnabled, clearRequestedViewMode])

  // no mobile, trocar de nota fecha o drawer da sidebar para revelar o editor
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [activePath])

  return (
    <div className="app-layout">
      <TopBar onOpenSidebar={() => setMobileSidebarOpen(true)} />
      <div className="app-body">
        {kanbanOpen && (
          <div className="kanban-overlay">
            <KanbanBoard onClose={() => setKanbanOpen(false)} />
          </div>
        )}
        {agendaOpen && (
          <div className="kanban-overlay">
            <AgendaBoard onClose={() => setAgendaOpen(false)} />
          </div>
        )}
        {canvasOpen && (
          <div className="kanban-overlay">
            <CanvasBoard onClose={() => setCanvasOpen(false)} />
          </div>
        )}
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
          {diffPath ? (
            <DiffView path={diffPath} />
          ) : activeNote?.binary ? (
            <FileViewer path={activeNote.path} />
          ) : activeNote ? (
            <>
              {isMarkdownFile && (
              <div className="view-toggle">
                <button
                  className={viewMode === 'edit' ? 'active' : ''}
                  onClick={() => setViewMode('edit')}
                  title={t('viewToggle.editHint')}
                >
                  <Pencil size={14} strokeWidth={1.75} />
                  <span>{t('viewToggle.edit')}</span>
                </button>
                <button
                  className={viewMode === 'live' ? 'active' : ''}
                  onClick={() => setViewMode('live')}
                  title={t('viewToggle.liveHint')}
                >
                  <Sparkles size={14} strokeWidth={1.75} />
                  <span>{t('viewToggle.live')}</span>
                </button>
                <button
                  className={viewMode === 'split' ? 'active' : ''}
                  onClick={() => setViewMode('split')}
                  title={t('viewToggle.splitHint')}
                >
                  <Columns2 size={14} strokeWidth={1.75} />
                  <span>{t('viewToggle.split')}</span>
                </button>
                <button
                  className={viewMode === 'preview' ? 'active' : ''}
                  onClick={() => setViewMode('preview')}
                  title={t('viewToggle.previewHint')}
                >
                  <BookOpen size={14} strokeWidth={1.75} />
                  <span>{t('viewToggle.preview')}</span>
                </button>
                <button
                  onClick={() =>
                    exportNotePdf(activeNote, new Set(notes.map((n) => n.name)), getAttachmentUrl)
                  }
                  title={t('pdf.exportHint')}
                >
                  <FileDown size={14} strokeWidth={1.75} />
                  <span>{t('pdf.export')}</span>
                </button>
              </div>
              )}

              <div className={`view-panels ${effectiveViewMode === 'split' ? 'split' : ''}`}>
                {(effectiveViewMode === 'edit' || effectiveViewMode === 'split') && (
                  <Editor
                    key={activeNote.path}
                    path={activeNote.path}
                    content={activeNote.content}
                    onChange={(content) => updateNoteContent(activeNote.path, content)}
                    getNoteNames={() => Array.from(new Set(notes.map((n) => n.name)))}
                    onScroll={effectiveViewMode === 'split' ? handleEditorScroll : undefined}
                    scrollToFraction={
                      effectiveViewMode === 'split' && syncFraction?.from === 'preview'
                        ? syncFraction.value
                        : undefined
                    }
                  />
                )}
                {effectiveViewMode === 'live' && (
                  <BlockEditor
                    key={activeNote.path}
                    path={activeNote.path}
                    content={activeNote.content}
                    onChange={(content) => updateNoteContent(activeNote.path, content)}
                  />
                )}
                {(effectiveViewMode === 'preview' || effectiveViewMode === 'split') && (
                  <Preview
                    content={activeNote.content}
                    onScroll={effectiveViewMode === 'split' ? handlePreviewScroll : undefined}
                    scrollToFraction={
                      effectiveViewMode === 'split' && syncFraction?.from === 'editor'
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
        {activeNote && !IS_CODE_WORKSPACE && (
          <>
            {backlinksCollapsed ? (
              <button
                className="backlinks-expand-btn"
                onClick={() => toggleBacklinks(false)}
                title={t('backlinks.expand')}
              >
                <PanelRightOpen size={16} strokeWidth={1.75} />
              </button>
            ) : (
              <>
                <ResizeHandle onResize={handleBacklinksResize} />
                <div className="backlinks-desktop" style={{ width: backlinksWidth, flexShrink: 0 }}>
                  <BacklinksPanel onCollapse={() => toggleBacklinks(true)} />
                </div>
              </>
            )}
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
      <ConflictDialog />
      <MermaidViewer />
      <QuickOpen commands={paletteCommands} />
    </div>
  )
}

export default App
