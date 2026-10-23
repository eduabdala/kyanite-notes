/** Extensões do CodeMirror para arquivos de código (workspaces de código): linguagem detectada
 * pelo nome do arquivo (carregada sob demanda), cores de sintaxe e números de linha. */

import {
  HighlightStyle,
  LanguageDescription,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { highlightSelectionMatches, gotoLine } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'

/** cores pensadas para funcionar nos temas claro e escuro; palavras-chave usam a cor da pedra */
const codeHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--accent)', fontWeight: '500' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#4aa36f' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#d0883a' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#a07ad8' },
  { tag: [t.typeName, t.className, t.namespace], color: '#2fa3b5' },
  { tag: [t.tagName], color: 'var(--accent)' },
  { tag: [t.attributeName, t.propertyName], color: '#c0794f' },
  { tag: [t.heading], fontWeight: '700' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: '700' },
  { tag: [t.link, t.url], color: 'var(--accent)', textDecoration: 'underline' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--text-secondary)' },
  { tag: t.invalid, color: 'var(--danger)' },
])

/** Recursos de editor de código: dobrar blocos, par de colchetes, múltiplos cursores
 * (Alt+clique, Ctrl+D), seleção retangular (Alt+arrastar), destacar ocorrências e Ctrl+G */
export function codeEditorExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    indentUnit.of('  '),
    syntaxHighlighting(codeHighlightStyle),
    keymap.of([...foldKeymap, { key: 'Mod-g', run: gotoLine, preventDefault: true }]),
    EditorView.theme({
      '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
      '.cm-matchingBracket': { backgroundColor: 'var(--selection-bg)', outline: '1px solid var(--accent)' },
      '.cm-selectionMatch': { backgroundColor: 'var(--selection-bg)' },
      '.cm-panels': {
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-color)',
      },
      '.cm-panels input, .cm-panels button': { fontFamily: 'var(--font-sans)', fontSize: '12px' },
      '.cm-textfield': {
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)',
        borderRadius: '4px',
      },
      '.cm-button': {
        backgroundImage: 'none',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)',
        borderRadius: '4px',
      },
      '.cm-searchMatch': { backgroundColor: 'rgba(255, 200, 0, 0.25)' },
      '.cm-searchMatch-selected': { backgroundColor: 'rgba(255, 160, 0, 0.45)' },
      '.cm-gutters': {
        display: 'flex',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        border: 'none',
        borderRight: '1px solid var(--border-color)',
      },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-primary)' },
      '.cm-content': { padding: '12px 0' },
    }),
  ]
}

/** carrega o suporte à linguagem do arquivo (ex: TypeScript para `.ts`), ou null se desconhecida */
export async function loadLanguageFor(fileName: string): Promise<Extension | null> {
  const desc = LanguageDescription.matchFilename(languages, fileName)
  if (!desc) return null
  try {
    return await desc.load()
  } catch {
    return null
  }
}
