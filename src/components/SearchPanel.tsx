import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CaseSensitive, Search } from 'lucide-react'
import { useVaultStore, type SearchResult } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useIdeStore } from '../store/useIdeStore'
import { fileNameOf } from '../lib/vault'
import './IdeViews.css'

/** Busca de texto em todos os arquivos do repo (Ctrl+Shift+F). Arquivos ainda não baixados
 * são baixados uma vez e ficam em cache na memória durante a sessão. */
export function SearchPanel() {
  const { t } = useTranslation()
  const searchRepo = useVaultStore((s) => s.searchRepo)
  const openTab = useTabsStore((s) => s.openTab)
  const revealLine = useIdeStore((s) => s.revealLine)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const runId = useRef(0)

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    const id = ++runId.current
    if (!query.trim()) {
      setResults(null)
      return
    }
    setProgress({ done: 0, total: 0 })
    const res = await searchRepo(query, { caseSensitive }, (done, total) => {
      if (id === runId.current) setProgress({ done, total })
    })
    if (id !== runId.current) return
    setProgress(null)
    setResults(res.results)
    setTruncated(res.truncated)
  }

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>()
    for (const r of results ?? []) {
      if (!map.has(r.path)) map.set(r.path, [])
      map.get(r.path)!.push(r)
    }
    return Array.from(map.entries())
  }, [results])

  function openResult(r: SearchResult) {
    openTab(r.path)
    revealLine(r.path, r.line)
  }

  return (
    <div className="ide-panel">
      <form className="search-form" onSubmit={run}>
        <div className="search-input-wrap">
          <Search size={14} strokeWidth={1.75} aria-hidden="true" />
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ide.searchPlaceholder')}
            aria-label={t('ide.searchPlaceholder')}
            autoFocus
          />
          <button
            type="button"
            className={`ide-icon-btn ${caseSensitive ? 'active' : ''}`}
            onClick={() => setCaseSensitive((v) => !v)}
            aria-pressed={caseSensitive}
            title={t('ide.caseSensitive')}
          >
            <CaseSensitive size={15} strokeWidth={1.75} />
          </button>
        </div>
      </form>

      {progress && (
        <p className="ide-muted ide-panel-note">
          {progress.total > 0
            ? t('ide.searchDownloading', { done: progress.done, total: progress.total })
            : t('ide.searching')}
        </p>
      )}

      {results && !progress && (
        <p className="ide-muted ide-panel-note">
          {truncated
            ? t('ide.searchTruncated', { count: results.length })
            : t('ide.searchCount', { count: results.length, files: grouped.length })}
        </p>
      )}

      <div className="ide-panel-scroll">
        {grouped.map(([path, matches]) => (
          <div key={path} className="search-file">
            <div className="search-file-name" title={path}>
              <span>{fileNameOf(path)}</span>
              <span className="ide-muted">{path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''}</span>
            </div>
            {matches.map((m) => (
              <button
                type="button"
                key={`${m.line}:${m.column}`}
                className="search-match"
                onClick={() => openResult(m)}
                title={`${path}:${m.line}`}
              >
                <span className="search-line-no">{m.line}</span>
                <span className="search-line-text">
                  {m.text.slice(Math.max(0, m.column - 30), m.column).trimStart()}
                  <mark>{m.text.slice(m.column, m.column + query.length)}</mark>
                  {m.text.slice(m.column + query.length, m.column + query.length + 80)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
