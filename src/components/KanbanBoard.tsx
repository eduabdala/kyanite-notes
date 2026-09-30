import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, X, GripVertical, FileText, Link2, ArrowLeft, Pencil, Trash2,
  Play, Flag, CalendarClock, Clock, Rows2, Rows3, Tag as TagIcon, Check,
} from 'lucide-react'
import { useVaultStore } from '../store/useVaultStore'
import { useTabsStore } from '../store/useTabsStore'
import { useConfirmStore } from '../store/useConfirmStore'
import { usePomodoroStore, focusMinutesByCard } from '../store/usePomodoroStore'
import {
  getActiveBoard,
  updateActiveBoard,
  addBoard,
  renameBoard,
  removeBoard,
  selectBoard,
  setAutoDeleteDoneDays,
  pruneDoneCards,
  isOverdue,
  moveCard,
  addCard,
  updateCard,
  removeCard,
  addColumn,
  renameColumn,
  removeColumn,
  addBoardTag,
  removeBoardTag,
  toggleCardTag,
  boardTags,
  URGENCY_LEVELS,
  type Urgency,
  type KanbanBoard as Board,
} from '../lib/kanban'

import './KanbanBoard.css'

interface KanbanBoardProps {
  onClose: () => void
}

const DENSITY_KEY = 'kyanite:kanban-density'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function KanbanBoard({ onClose }: KanbanBoardProps) {
  const { t } = useTranslation()
  const collection = useVaultStore((s) => s.kanbanCollection)
  const save = useVaultStore((s) => s.saveKanbanCollection)
  const notes = useVaultStore((s) => s.notes)
  const openTab = useTabsStore((s) => s.openTab)
  const confirm = useConfirmStore((s) => s.confirm)
  const focusCard = usePomodoroStore((s) => s.focusCard)
  const activeCardId = usePomodoroStore((s) => s.activeCardId)
  const sessions = usePomodoroStore((s) => s.sessions)

  const board = getActiveBoard(collection)
  const today = todayIso()
  const focusByCard = focusMinutesByCard(sessions)
  const tags = boardTags(board)
  const tagById = new Map(tags.map((tg) => [tg.id, tg]))

  const [compact, setCompact] = useState(() => localStorage.getItem(DENSITY_KEY) !== 'detailed')
  const [drag, setDrag] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [draftCard, setDraftCard] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [draftColumn, setDraftColumn] = useState('')
  const [editingCard, setEditingCard] = useState<string | null>(null)
  const [draftEdit, setDraftEdit] = useState('')
  const [linkingCard, setLinkingCard] = useState<string | null>(null)
  const [draftLink, setDraftLink] = useState('')
  const [addingBoard, setAddingBoard] = useState(false)
  const [draftBoard, setDraftBoard] = useState('')
  const [renamingBoard, setRenamingBoard] = useState(false)
  const [draftBoardName, setDraftBoardName] = useState('')
  const [tagMenuCard, setTagMenuCard] = useState<string | null>(null)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [draftTag, setDraftTag] = useState('')
  const [filterTagId, setFilterTagId] = useState<string | null>(null)

  const tagMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const pruned = pruneDoneCards(collection)
    if (pruned !== collection) save(pruned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // fecha o menu de tags do cartão ao clicar fora dele
  useEffect(() => {
    if (!tagMenuCard) return
    function handleClickOutside(e: MouseEvent) {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setTagMenuCard(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [tagMenuCard])

  // se a tag usada no filtro for removida, limpa o filtro
  useEffect(() => {
    if (filterTagId && !tags.some((tg) => tg.id === filterTagId)) setFilterTagId(null)
  }, [filterTagId, tags])

  function toggleDensity() {
    setCompact((c) => {
      localStorage.setItem(DENSITY_KEY, c ? 'detailed' : 'compact')
      return !c
    })
  }

  function commit(fn: (b: Board) => Board) {
    save(updateActiveBoard(collection, fn))
  }

  function handleDrop(columnId: string, index: number) {
    if (!drag) return
    commit((b) => moveCard(b, drag, columnId, index))
    setDrag(null)
    setDropTarget(null)
  }

  function submitCard(columnId: string) {
    if (draftCard.trim()) commit((b) => addCard(b, columnId, draftCard))
    setDraftCard('')
    setAddingTo(null)
  }

  function submitColumn() {
    if (draftColumn.trim()) commit((b) => addColumn(b, draftColumn))
    setDraftColumn('')
    setAddingColumn(false)
  }

  function submitEdit(cardId: string) {
    if (draftEdit.trim()) commit((b) => updateCard(b, cardId, { text: draftEdit }))
    setEditingCard(null)
    setDraftEdit('')
  }

  function submitLink(cardId: string) {
    const q = draftLink.trim().toLowerCase()
    const match = notes.find((n) => n.path.toLowerCase() === q || n.name.toLowerCase() === q)
    commit((b) => updateCard(b, cardId, { notePath: match ? match.path : undefined }))
    setLinkingCard(null)
    setDraftLink('')
  }

  function cycleUrgency(cardId: string, current: Urgency | undefined) {
    const next = (((current ?? 0) + 1) % URGENCY_LEVELS.length) as Urgency
    commit((b) => updateCard(b, cardId, { urgency: next }))
  }

  function openLinkedNote(notePath: string) {
    if (notes.some((n) => n.path === notePath)) openTab(notePath)
  }

  function submitNewBoard() {
    if (draftBoard.trim()) save(addBoard(collection, draftBoard))
    setDraftBoard('')
    setAddingBoard(false)
  }

  function submitRenameBoard() {
    if (draftBoardName.trim()) save(renameBoard(collection, board.id, draftBoardName))
    setRenamingBoard(false)
    setDraftBoardName('')
  }

  async function handleRemoveBoard() {
    const ok = await confirm(t('kanban.removeBoardConfirm', { name: board.name }))
    if (ok) save(removeBoard(collection, board.id))
  }

  function submitNewTag() {
    if (draftTag.trim()) commit((b) => addBoardTag(b, draftTag))
    setDraftTag('')
  }

  function toggleFilter(tagId: string) {
    setFilterTagId((cur) => (cur === tagId ? null : tagId))
  }

  function cardMatchesFilter(tagIds: string[] | undefined): boolean {
    if (!filterTagId) return true
    return !!tagIds && tagIds.includes(filterTagId)
  }

  function renderTagChips(tagIds: string[] | undefined) {
    if (!tagIds || tagIds.length === 0) return null
    return (
      <div className="kanban-card-tags">
        {tagIds.map((id) => {
          const tag = tagById.get(id)
          if (!tag) return null
          return (
            <button
              key={id}
              className={`kanban-tag-chip clickable ${filterTagId === id ? 'filtering' : ''}`}
              style={{ background: tag.color }}
              title={t('kanban.filterByTag', { name: tag.name })}
              onClick={() => toggleFilter(id)}
            >
              {tag.name}
            </button>
          )
        })}
      </div>
    )
  }

  const filterTag = filterTagId ? tagById.get(filterTagId) : null

  return (
    <div className={`kanban-view ${compact ? 'density-compact' : 'density-detailed'}`}>
      <div className="kanban-view-header">
        <button className="kanban-back-btn" onClick={onClose} title={t('kanban.backToNotes')}>
          <ArrowLeft size={16} strokeWidth={1.75} />
          {t('kanban.backToNotes')}
        </button>

        <div className="kanban-tabs">
          {collection.boards.map((b) => (
            <button
              key={b.id}
              className={`kanban-tab ${b.id === collection.activeBoardId ? 'active' : ''}`}
              onClick={() => {
                if (b.id !== collection.activeBoardId) save(selectBoard(collection, b.id))
              }}
            >
              {b.name}
            </button>
          ))}

          {addingBoard ? (
            <input
              autoFocus
              className="kanban-input kanban-tab-input"
              value={draftBoard}
              placeholder={t('kanban.boardPlaceholder')}
              onChange={(e) => setDraftBoard(e.target.value)}
              onBlur={submitNewBoard}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewBoard()
                if (e.key === 'Escape') {
                  setAddingBoard(false)
                  setDraftBoard('')
                }
              }}
            />
          ) : (
            <button
              className="kanban-tab kanban-tab-add"
              onClick={() => setAddingBoard(true)}
              title={t('kanban.addBoard')}
            >
              <Plus size={15} strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="kanban-board-actions">
          <button
            className="kanban-icon-btn"
            title={compact ? t('kanban.densityDetailed') : t('kanban.densityCompact')}
            onClick={toggleDensity}
          >
            {compact ? <Rows3 size={15} strokeWidth={1.75} /> : <Rows2 size={15} strokeWidth={1.75} />}
          </button>
          <button
            className={`kanban-icon-btn ${tagManagerOpen ? 'active' : ''}`}
            title={t('kanban.manageTags')}
            onClick={() => setTagManagerOpen((o) => !o)}
          >
            <TagIcon size={14} strokeWidth={1.75} />
          </button>
          <label className="kanban-autodelete" title={t('kanban.autoDeleteHint')}>
            <Trash2 size={13} strokeWidth={1.75} />
            <input
              type="number"
              min={0}
              max={365}
              className="kanban-autodelete-input"
              value={collection.autoDeleteDoneDays}
              onChange={(e) => save(setAutoDeleteDoneDays(collection, Number(e.target.value)))}
            />
            <span>{t('kanban.autoDeleteDays')}</span>
          </label>
          <button className="kanban-icon-btn" title={t('kanban.renameBoard')} onClick={() => {
            setRenamingBoard(true)
            setDraftBoardName(board.name)
          }}>
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            className="kanban-icon-btn"
            title={t('kanban.removeBoard')}
            onClick={handleRemoveBoard}
            disabled={collection.boards.length <= 1}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {renamingBoard && (
        <div className="kanban-rename-row">
          <input
            autoFocus
            className="kanban-input"
            value={draftBoardName}
            placeholder={t('kanban.boardPlaceholder')}
            onChange={(e) => setDraftBoardName(e.target.value)}
            onBlur={submitRenameBoard}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRenameBoard()
              if (e.key === 'Escape') {
                setRenamingBoard(false)
                setDraftBoardName('')
              }
            }}
          />
        </div>
      )}

      {tagManagerOpen && (
        <div className="kanban-tag-manager">
          <span className="kanban-tag-manager-title">{t('kanban.manageTags')}</span>
          <div className="kanban-tag-manager-list">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className={`kanban-tag-chip editable ${filterTagId === tag.id ? 'filtering' : ''}`}
                style={{ background: tag.color }}
              >
                <button
                  className="kanban-tag-chip-filter"
                  title={t('kanban.filterByTag', { name: tag.name })}
                  onClick={() => toggleFilter(tag.id)}
                >
                  {tag.name}
                </button>
                <button
                  className="kanban-tag-chip-remove"
                  title={t('kanban.removeTag')}
                  onClick={() => commit((b) => removeBoardTag(b, tag.id))}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            <input
              className="kanban-input kanban-tag-new"
              value={draftTag}
              placeholder={t('kanban.newTagPlaceholder')}
              onChange={(e) => setDraftTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewTag()
              }}
            />
          </div>
        </div>
      )}

      {filterTag && (
        <div className="kanban-filter-bar">
          <span className="kanban-filter-label">{t('kanban.filtering')}</span>
          <span className="kanban-tag-chip" style={{ background: filterTag.color }}>
            {filterTag.name}
          </span>
          <button className="kanban-filter-clear" onClick={() => setFilterTagId(null)}>
            <X size={13} strokeWidth={2} />
            {t('kanban.clearFilter')}
          </button>
        </div>
      )}

      <div className="kanban-board">
        {board.columns.map((col) => {
          const visibleCards = col.cards.filter((c) => cardMatchesFilter(c.tagIds))
          return (
            <div className="kanban-column" key={col.id}>
              <div className="kanban-column-header">
                <input
                  className="kanban-column-title"
                  value={col.title}
                  onChange={(e) => commit((b) => renameColumn(b, col.id, e.target.value))}
                />
                <span className="kanban-count">
                  {filterTagId ? `${visibleCards.length}/${col.cards.length}` : col.cards.length}
                </span>
                <button
                  className="kanban-icon-btn"
                  title={t('kanban.removeColumn')}
                  onClick={() => commit((b) => removeColumn(b, col.id))}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </div>

              <div
                className="kanban-cards"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropTarget({ columnId: col.id, index: col.cards.length })
                }}
                onDrop={() =>
                  handleDrop(col.id, dropTarget?.columnId === col.id ? dropTarget.index : col.cards.length)
                }
              >
                {visibleCards.map((card, index) => {
                  const overdue = isOverdue(card, today)
                  const focusMin = focusByCard.get(card.id) ?? 0
                  return (
                    <div
                      key={card.id}
                      className={`kanban-card urgency-${card.urgency ?? 0} ${drag === card.id ? 'dragging' : ''} ${
                        dropTarget?.columnId === col.id && dropTarget.index === index ? 'drop-before' : ''
                      } ${activeCardId === card.id ? 'focusing' : ''}`}
                      draggable={editingCard !== card.id && linkingCard !== card.id}
                      onDragStart={() => setDrag(card.id)}
                      onDragEnd={() => {
                        setDrag(null)
                        setDropTarget(null)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDropTarget({ columnId: col.id, index })
                      }}
                      onDrop={(e) => {
                        e.stopPropagation()
                        handleDrop(col.id, index)
                      }}
                    >
                      <div className="kanban-card-top">
                        <GripVertical size={14} strokeWidth={1.5} className="kanban-card-grip" />

                        <div className="kanban-card-body">
                          {renderTagChips(card.tagIds)}

                          {editingCard === card.id ? (
                            <textarea
                              autoFocus
                              className="kanban-card-edit"
                              value={draftEdit}
                              onChange={(e) => setDraftEdit(e.target.value)}
                              onBlur={() => submitEdit(card.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  submitEdit(card.id)
                                }
                                if (e.key === 'Escape') {
                                  setEditingCard(null)
                                  setDraftEdit('')
                                }
                              }}
                            />
                          ) : (
                            <span
                              className="kanban-card-text"
                              onDoubleClick={() => {
                                setEditingCard(card.id)
                                setDraftEdit(card.text)
                              }}
                            >
                              {card.text}
                            </span>
                          )}

                          {card.notePath && editingCard !== card.id && (
                            <button
                              className="kanban-card-note"
                              onClick={() => openLinkedNote(card.notePath!)}
                              title={card.notePath}
                            >
                              <FileText size={12} strokeWidth={1.75} />
                              {card.notePath.replace(/\.md$/, '').split('/').pop()}
                            </button>
                          )}

                          {linkingCard === card.id && (
                            <>
                              <input
                                autoFocus
                                list="kanban-note-options"
                                className="kanban-input kanban-link-input"
                                value={draftLink}
                                placeholder={t('kanban.linkPlaceholder')}
                                onChange={(e) => setDraftLink(e.target.value)}
                                onBlur={() => submitLink(card.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') submitLink(card.id)
                                  if (e.key === 'Escape') {
                                    setLinkingCard(null)
                                    setDraftLink('')
                                  }
                                }}
                              />
                              <datalist id="kanban-note-options">
                                {notes.map((n) => (
                                  <option key={n.path} value={n.name} />
                                ))}
                              </datalist>
                            </>
                          )}

                          {tagMenuCard === card.id && (
                            <div className="kanban-card-tagmenu" ref={tagMenuRef}>
                              {tags.length === 0 ? (
                                <span className="kanban-card-tagmenu-empty">{t('kanban.noTags')}</span>
                              ) : (
                                tags.map((tag) => {
                                  const on = (card.tagIds ?? []).includes(tag.id)
                                  return (
                                    <button
                                      key={tag.id}
                                      className={`kanban-tagmenu-item ${on ? 'on' : ''}`}
                                      onClick={() => commit((b) => toggleCardTag(b, card.id, tag.id))}
                                    >
                                      <span className="kanban-tagmenu-swatch" style={{ background: tag.color }} />
                                      {tag.name}
                                      {on && <Check size={12} strokeWidth={2.5} />}
                                    </button>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </div>

                        <div className="kanban-card-actions">
                          <button
                            className="kanban-icon-btn"
                            title={t('kanban.focusCard')}
                            onClick={() => focusCard(card.id, card.text.slice(0, 60))}
                          >
                            <Play size={13} strokeWidth={1.75} />
                          </button>
                          <button
                            className={`kanban-icon-btn ${tagMenuCard === card.id ? 'active' : ''}`}
                            title={t('kanban.cardTags')}
                            onClick={() => setTagMenuCard(tagMenuCard === card.id ? null : card.id)}
                          >
                            <TagIcon size={13} strokeWidth={1.75} />
                          </button>
                          <button
                            className="kanban-icon-btn"
                            title={card.notePath ? t('kanban.changeLink') : t('kanban.linkNote')}
                            onClick={() => {
                              setLinkingCard(card.id)
                              setDraftLink(
                                card.notePath ? card.notePath.replace(/\.md$/, '').split('/').pop() ?? '' : ''
                              )
                            }}
                          >
                            <Link2 size={13} strokeWidth={1.75} />
                          </button>
                          <button
                            className="kanban-icon-btn kanban-card-remove"
                            title={t('kanban.removeCard')}
                            onClick={() => commit((b) => removeCard(b, card.id))}
                          >
                            <X size={13} strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>

                      {/* rodapé de metadados: urgência, prazo, tempo de foco (ícones sempre visíveis) */}
                      <div className="kanban-card-meta">
                        <button
                          className={`kanban-urgency urgency-${card.urgency ?? 0}`}
                          onClick={() => cycleUrgency(card.id, card.urgency)}
                          title={t('kanban.urgency')}
                        >
                          <Flag size={11} strokeWidth={2} />
                          <span className="kanban-meta-text">{t(`kanban.urgencyLevels.${card.urgency ?? 0}`)}</span>
                        </button>

                        <label className={`kanban-due ${overdue ? 'overdue' : ''}`} title={t('kanban.dueDate')}>
                          <CalendarClock size={11} strokeWidth={1.75} />
                          <input
                            type="date"
                            className="kanban-due-input"
                            value={card.dueDate ?? ''}
                            onChange={(e) => commit((b) => updateCard(b, card.id, { dueDate: e.target.value }))}
                          />
                        </label>

                        {focusMin > 0 && (
                          <span className="kanban-focus" title={t('kanban.focusTime')}>
                            <Clock size={11} strokeWidth={1.75} />
                            {focusMin} {t('pomodoro.minShort')}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {addingTo === col.id ? (
                  <textarea
                    autoFocus
                    className="kanban-input kanban-card-draft"
                    value={draftCard}
                    placeholder={t('kanban.cardPlaceholder')}
                    onChange={(e) => setDraftCard(e.target.value)}
                    onBlur={() => submitCard(col.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        submitCard(col.id)
                      }
                      if (e.key === 'Escape') {
                        setAddingTo(null)
                        setDraftCard('')
                      }
                    }}
                  />
                ) : (
                  <button
                    className="kanban-add-card-btn"
                    onClick={() => {
                      setAddingTo(col.id)
                      setDraftCard('')
                    }}
                  >
                    <Plus size={14} strokeWidth={1.75} />
                    {t('kanban.addCard')}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        <div className="kanban-column kanban-column-add">
          {addingColumn ? (
            <input
              autoFocus
              className="kanban-input"
              value={draftColumn}
              placeholder={t('kanban.columnPlaceholder')}
              onChange={(e) => setDraftColumn(e.target.value)}
              onBlur={submitColumn}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitColumn()
                if (e.key === 'Escape') {
                  setAddingColumn(false)
                  setDraftColumn('')
                }
              }}
            />
          ) : (
            <button className="kanban-add-column-btn" onClick={() => setAddingColumn(true)}>
              <Plus size={15} strokeWidth={1.75} />
              {t('kanban.addColumn')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}