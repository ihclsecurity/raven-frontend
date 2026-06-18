/**
 * Email Rich Editor
 *
 * What this component does
 * ------------------------
 * This editor provides the HTML editing surface used by advisory and email
 * composition flows. It preserves the underlying email document structure
 * while giving the user a controlled set of formatting actions.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the document/selection helpers, then read the formatting
 * commands, and finally follow the toolbar and iframe lifecycle. The subtle
 * behavior in this file is mostly about keeping browser editing state stable.
 *
 * When to change this file
 * ------------------------
 * Update this component when the editor toolbar, formatting rules, or HTML
 * normalization rules change.
 *
 * What this file does not do
 * --------------------------
 * It does not decide advisory content, email templates, or preview rendering.
 * It only edits and normalizes the HTML body that other screens provide.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  ChevronDown,
  Eraser,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from 'lucide-react'

interface EmailRichEditorProps {
  content: string
  onChange: (html: string) => void
}

type ToolbarState = {
  bold: boolean
  italic: boolean
  underline: boolean
  bulletList: boolean
  orderedList: boolean
  heading: boolean
  fontSize: string
}

const HEADING_MARKER_ATTR = 'data-raven-heading'
const FONT_SIZE_MARKER_ATTR = 'data-raven-font-size'
const EDITOR_FORMAT_MARKER_ATTR = 'data-raven-editor-format'
const HEADING_FONT_SIZE = '1.1em'
const HEADING_LINE_HEIGHT = '1.35'
const BLOCK_TAGS = ['P', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE']
const FONT_SIZE_OPTIONS = ['12', '13', '14', '15', '16', '18']

const EMPTY_EDITOR_DOCUMENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:24px; background:#ffffff; color:#0f172a; font-family:Segoe UI, Arial, sans-serif;"></body>
</html>`

const EMPTY_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  bulletList: false,
  orderedList: false,
  heading: false,
  fontSize: '',
}

// ========================================================================
// Document And Selection Helpers
// ========================================================================

function normalizeDocumentHtml(value: string): string {
  return String(value || '').trim()
}

function ensureEditorDocument(value: string): string {
  const trimmed = normalizeDocumentHtml(value)
  if (!trimmed) {
    return EMPTY_EDITOR_DOCUMENT
  }
  if (/<html[\s>]/i.test(trimmed)) {
    return trimmed
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /></head><body>${trimmed}</body></html>`
}

function serializeEditorDocument(doc: Document): string {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}

function isHtmlElement(node: Node | null): node is HTMLElement {
  const view = node?.ownerDocument?.defaultView
  return Boolean(view && node instanceof view.HTMLElement)
}

function closestTag(node: Node | null, tags: string[]): HTMLElement | null {
  const tagSet = new Set(tags.map((item) => item.toUpperCase()))
  let current: Node | null = node
  while (current) {
    if (isHtmlElement(current) && tagSet.has(current.tagName)) {
      return current
    }
    current = current.parentNode
  }
  return null
}

function closestElement(node: Node | null, predicate: (element: HTMLElement) => boolean): HTMLElement | null {
  let current: Node | null = node
  while (current) {
    if (isHtmlElement(current) && predicate(current)) {
      return current
    }
    current = current.parentNode
  }
  return null
}

function intersectsRange(range: Range, element: HTMLElement): boolean {
  try {
    return range.intersectsNode(element)
  } catch {
    return false
  }
}

function getSelectionRange(selection: Selection | null): Range | null {
  return selection?.rangeCount ? selection.getRangeAt(0) : null
}

// ========================================================================
// Formatting Helpers
// ========================================================================

function applyHeadingStyles(element: HTMLElement): void {
  element.setAttribute(HEADING_MARKER_ATTR, 'true')
  element.style.fontSize = HEADING_FONT_SIZE
  element.style.lineHeight = HEADING_LINE_HEIGHT
  element.style.fontFamily = 'inherit'
  element.style.fontWeight = 'inherit'
}

function clearHeadingStyles(element: HTMLElement): void {
  element.removeAttribute(HEADING_MARKER_ATTR)
  element.style.removeProperty('font-size')
  element.style.removeProperty('line-height')
  element.style.removeProperty('font-family')
  element.style.removeProperty('font-weight')
}

function applyBlockFontSize(element: HTMLElement, sizePx: string): void {
  element.setAttribute(FONT_SIZE_MARKER_ATTR, sizePx)
  element.style.fontSize = `${sizePx}px`
  element.style.fontFamily = 'inherit'
}

function clearBlockFontSize(element: HTMLElement): void {
  element.removeAttribute(FONT_SIZE_MARKER_ATTR)
  element.style.removeProperty('font-size')
  element.style.removeProperty('font-family')
}

function unwrapElement(element: HTMLElement): void {
  const parent = element.parentNode
  if (!parent) {
    return
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }
  parent.removeChild(element)
}

function markEditorFormattingInRange(doc: Document, range: Range): void {
  const formattedNodes = Array.from(doc.body.querySelectorAll<HTMLElement>('span, b, strong, i, em, u'))
  for (const node of formattedNodes) {
    if (intersectsRange(range, node)) {
      node.setAttribute(EDITOR_FORMAT_MARKER_ATTR, 'true')
    }
  }
}

function removeEmptyInlineWrappers(root: HTMLElement): void {
  const inlineWrappers = Array.from(root.querySelectorAll<HTMLElement>('span, font'))
  for (const wrapper of inlineWrappers) {
    if (wrapper.attributes.length > 0 || wrapper.childNodes.length !== 1) {
      continue
    }
    const onlyChild = wrapper.firstChild
    if (!onlyChild || onlyChild.nodeType !== Node.TEXT_NODE) {
      continue
    }
    wrapper.replaceWith(onlyChild)
  }
}

function findActiveFontSize(node: Node | null): string {
  const sizedElement = closestElement(node, (element) =>
    element.hasAttribute(FONT_SIZE_MARKER_ATTR) || Boolean(element.style.fontSize),
  )
  if (!sizedElement) {
    return ''
  }

  const markedSize = sizedElement.getAttribute(FONT_SIZE_MARKER_ATTR)
  if (markedSize && FONT_SIZE_OPTIONS.includes(markedSize)) {
    return markedSize
  }

  const inlineSize = (sizedElement.style.fontSize || '').trim()
  const pxMatch = inlineSize.match(/^(\d+(?:\.\d+)?)px$/i)
  if (!pxMatch) {
    return ''
  }

  const rounded = String(Math.round(Number(pxMatch[1])))
  return FONT_SIZE_OPTIONS.includes(rounded) ? rounded : ''
}

function wrapTextNodeWithFontSize(doc: Document, node: Text, startOffset: number, endOffset: number, sizePx: string): HTMLElement | null {
  if (startOffset >= endOffset) {
    return null
  }

  let selectedNode = node
  if (endOffset < selectedNode.data.length) {
    selectedNode.splitText(endOffset)
  }
  if (startOffset > 0) {
    selectedNode = selectedNode.splitText(startOffset)
  }

  const existingFontWrapper = closestElement(selectedNode.parentNode, (element) =>
    element.hasAttribute(FONT_SIZE_MARKER_ATTR),
  )
  if (existingFontWrapper) {
    applyBlockFontSize(existingFontWrapper, sizePx)
    return existingFontWrapper
  }

  const wrapper = doc.createElement('span')
  applyBlockFontSize(wrapper, sizePx)
  selectedNode.parentNode?.insertBefore(wrapper, selectedNode)
  wrapper.appendChild(selectedNode)
  return wrapper
}

function applyFontSizeToRange(doc: Document, range: Range, sizePx: string): HTMLElement[] {
  const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer
  if (!root) {
    return []
  }

  const textNodes: Text[] = []
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    if (current.nodeValue?.trim() && range.intersectsNode(current)) {
      textNodes.push(current as Text)
    }
    current = walker.nextNode()
  }

  if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE && !textNodes.includes(range.commonAncestorContainer as Text)) {
    textNodes.push(range.commonAncestorContainer as Text)
  }

  const wrappers: HTMLElement[] = []
  for (const node of textNodes) {
    const startOffset = node === range.startContainer ? range.startOffset : 0
    const endOffset = node === range.endContainer ? range.endOffset : node.data.length
    const wrapper = wrapTextNodeWithFontSize(doc, node, startOffset, endOffset, sizePx)
    if (wrapper) {
      wrappers.push(wrapper)
    }
  }
  return wrappers
}

// ========================================================================
// Editor Component
// ========================================================================

export function EmailRichEditor({ content, onChange }: EmailRichEditorProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const lastAppliedContentRef = useRef('')
  const lastEmittedContentRef = useRef('')
  const initialDocumentRef = useRef(ensureEditorDocument(content))
  const savedRangeRef = useRef<Range | null>(null)
  const fontSizeMenuRef = useRef<HTMLDivElement | null>(null)
  const [toolbarState, setToolbarState] = useState<ToolbarState>(EMPTY_TOOLBAR_STATE)
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false)

  const buttonClass = useCallback(
    (active: boolean) => `compose-editor-button${active ? ' is-active' : ''}`,
    [],
  )

  const getEditorDocument = useCallback(() => frameRef.current?.contentDocument ?? null, [])
  const getEditorWindow = useCallback(() => frameRef.current?.contentWindow ?? null, [])

  // Keep the browser's current selection so toolbar actions can operate on the
  // same text range even after the button click steals focus.
  const saveSelection = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc?.body || !win) {
      return
    }

    const range = getSelectionRange(win.getSelection())
    if (!range || !doc.body.contains(range.commonAncestorContainer)) {
      return
    }

    savedRangeRef.current = range.cloneRange()
  }, [getEditorDocument, getEditorWindow])

  const restoreSelection = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    const savedRange = savedRangeRef.current
    if (!doc?.body || !win || !savedRange || !doc.body.contains(savedRange.commonAncestorContainer)) {
      return
    }

    const selection = win.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(savedRange.cloneRange())
  }, [getEditorDocument, getEditorWindow])

  const updateToolbarState = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc || !win) {
      setToolbarState(EMPTY_TOOLBAR_STATE)
      return
    }

    const selection = win.getSelection()
    const anchorNode = selection?.anchorNode ?? null

    const queryState = (command: string): boolean => {
      try {
        return Boolean(doc.queryCommandState(command))
      } catch {
        return false
      }
    }

    setToolbarState({
      bold: queryState('bold'),
      italic: queryState('italic'),
      underline: queryState('underline'),
      bulletList: Boolean(closestTag(anchorNode, ['UL'])),
      orderedList: Boolean(closestTag(anchorNode, ['OL'])),
      heading: Boolean(closestElement(anchorNode, (element) => element.hasAttribute(HEADING_MARKER_ATTR))),
      fontSize: findActiveFontSize(anchorNode),
    })
  }, [getEditorDocument, getEditorWindow])

  // Emit the full HTML document, not just the body, so downstream preview and
  // delivery code keeps the same structure the editor saw.
  const emitChange = useCallback(() => {
    const doc = getEditorDocument()
    if (!doc?.documentElement) {
      return
    }
    const html = serializeEditorDocument(doc)
    lastAppliedContentRef.current = normalizeDocumentHtml(html)
    lastEmittedContentRef.current = normalizeDocumentHtml(html)
    onChange(html)
  }, [getEditorDocument, onChange])

  const enableEditing = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc || !win) {
      return
    }

    cleanupRef.current?.()

    try {
      doc.designMode = 'on'
    } catch {
      if (doc.body) {
        doc.body.contentEditable = 'true'
      }
    }

    if (doc.body) {
      doc.body.setAttribute('spellcheck', 'true')
      doc.body.style.caretColor = '#0f172a'
      doc.body.style.outline = 'none'
      doc.body.style.cursor = 'text'
    }

    const handleInput = () => {
      emitChange()
      updateToolbarState()
    }
    const handleSelection = () => {
      saveSelection()
      updateToolbarState()
    }

    doc.addEventListener('input', handleInput)
    doc.addEventListener('keyup', handleSelection)
    doc.addEventListener('mouseup', handleSelection)
    doc.addEventListener('selectionchange', handleSelection)
    win.addEventListener('focus', handleSelection)

    cleanupRef.current = () => {
      doc.removeEventListener('input', handleInput)
      doc.removeEventListener('keyup', handleSelection)
      doc.removeEventListener('mouseup', handleSelection)
      doc.removeEventListener('selectionchange', handleSelection)
      win.removeEventListener('focus', handleSelection)
    }

    updateToolbarState()
  }, [emitChange, getEditorDocument, getEditorWindow, saveSelection, updateToolbarState])

  // The iframe is rewritten only when upstream content truly changes; this
  // avoids wiping the user's selection or cursor position on normal edits.
  const writeDocument = useCallback((value: string) => {
    const doc = getEditorDocument()
    if (!doc) {
      return
    }

    const nextDocument = ensureEditorDocument(value)
    const normalizedNext = normalizeDocumentHtml(nextDocument)
    if (normalizedNext === lastAppliedContentRef.current) {
      return
    }

    doc.open()
    doc.write(nextDocument)
    doc.close()
    savedRangeRef.current = null
    lastAppliedContentRef.current = normalizedNext
    window.setTimeout(() => {
      enableEditing()
    }, 0)
  }, [enableEditing, getEditorDocument])

  useEffect(() => {
    const nextDocument = ensureEditorDocument(content)
    const normalizedNext = normalizeDocumentHtml(nextDocument)
    if (
      normalizedNext === lastAppliedContentRef.current
      || normalizedNext === lastEmittedContentRef.current
    ) {
      return
    }
    writeDocument(nextDocument)
  }, [content, writeDocument])

  // Remove editor listeners when the component unmounts so a hidden iframe does
  // not keep reacting to stale events.
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  // Close the font-size popup when the user clicks anywhere else on the page.
  useEffect(() => {
    if (!fontSizeMenuOpen) {
      return undefined
    }

    const closeMenuOnOutsidePointer = (event: MouseEvent) => {
      if (fontSizeMenuRef.current?.contains(event.target as Node)) {
        return
      }
      setFontSizeMenuOpen(false)
    }

    document.addEventListener('mousedown', closeMenuOnOutsidePointer)
    return () => document.removeEventListener('mousedown', closeMenuOnOutsidePointer)
  }, [fontSizeMenuOpen])

  // Command execution is centralized so toolbar buttons stay small and the
  // selection-saving rules stay in one place.
  const runCommand = useCallback((command: string, value?: string) => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc || !win) {
      return
    }

    win.focus()
    restoreSelection()
    try {
      doc.execCommand('styleWithCSS', false, 'true')
      doc.execCommand(command, false, value)
      const range = getSelectionRange(win.getSelection())
      if (range && ['bold', 'italic', 'underline'].includes(command)) {
        markEditorFormattingInRange(doc, range)
      }
    } catch {
      return
    }
    emitChange()
    updateToolbarState()
  }, [emitChange, getEditorDocument, getEditorWindow, restoreSelection, updateToolbarState])

  // Heading toggling behaves like a reversible style switch on the current
  // block range, not as a brand new semantic heading system.
  const getHeadingTargets = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc?.body || !win) {
      return []
    }

    restoreSelection()
    const selection = win.getSelection()
    const range = getSelectionRange(selection)
    const anchorNode = selection?.anchorNode ?? null
    const currentBlock = closestElement(anchorNode, (element) => BLOCK_TAGS.includes(element.tagName))

    if (!range || range.collapsed) {
      return currentBlock ? [currentBlock] : []
    }

    const candidates = Array.from(doc.body.querySelectorAll<HTMLElement>(BLOCK_TAGS.join(',')))
    const targets = candidates.filter((element) => intersectsRange(range, element))
    if (targets.length > 0) {
      return targets
    }

    return currentBlock ? [currentBlock] : []
  }, [getEditorDocument, getEditorWindow, restoreSelection])

  const clearHeadingMarkersInSelection = useCallback(() => {
    const targets = getHeadingTargets()
    let changed = false
    for (const target of targets) {
      if (!target.hasAttribute(HEADING_MARKER_ATTR)) {
        continue
      }
      clearHeadingStyles(target)
      changed = true
    }
    return changed
  }, [getHeadingTargets])

  // Clear formatting is intentionally conservative. It removes the editor's
  // own formatting markers without destroying the underlying email structure.
  const clearEditorFormattingInSelection = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc?.body || !win) {
      return
    }

    const selection = win.getSelection()
    const range = getSelectionRange(selection)
    if (!range) {
      return
    }

    const targets = getHeadingTargets()
    for (const target of targets) {
      if (target.hasAttribute(HEADING_MARKER_ATTR)) {
        clearHeadingStyles(target)
      }
      if (target.hasAttribute(FONT_SIZE_MARKER_ATTR)) {
        clearBlockFontSize(target)
      }
    }

    const customStyledNodes = Array.from(doc.body.querySelectorAll<HTMLElement>(
      `[${HEADING_MARKER_ATTR}], [${FONT_SIZE_MARKER_ATTR}], [${EDITOR_FORMAT_MARKER_ATTR}], font`,
    ))
    for (const node of customStyledNodes) {
      if (!intersectsRange(range, node)) {
        continue
      }
      if (node.hasAttribute(HEADING_MARKER_ATTR)) {
        clearHeadingStyles(node)
      }
      if (node.hasAttribute(FONT_SIZE_MARKER_ATTR)) {
        clearBlockFontSize(node)
      }
      if (node.tagName === 'FONT') {
        node.removeAttribute('size')
        node.removeAttribute('face')
        node.removeAttribute('color')
      }
      if (node.hasAttribute(EDITOR_FORMAT_MARKER_ATTR)) {
        node.removeAttribute(EDITOR_FORMAT_MARKER_ATTR)
        node.style.removeProperty('font-weight')
        node.style.removeProperty('font-style')
        node.style.removeProperty('text-decoration')
        node.style.removeProperty('text-decoration-line')
      }
      if (
        ['B', 'STRONG', 'I', 'EM', 'U', 'FONT'].includes(node.tagName)
        || (node.tagName === 'SPAN' && node.attributes.length === 0)
      ) {
        unwrapElement(node)
      }
    }

    removeEmptyInlineWrappers(doc.body)
  }, [getEditorDocument, getEditorWindow, getHeadingTargets])

  // Heading and font-size actions are applied at the block level when no text
  // is selected, which keeps the editor predictable for email bodies.
  const toggleHeading = useCallback(() => {
    const win = getEditorWindow()
    if (!win) {
      return
    }

    const targets = getHeadingTargets()
    if (!targets.length) {
      return
    }

    win.focus()
    restoreSelection()

    const shouldClear = targets.every((element) => element.hasAttribute(HEADING_MARKER_ATTR))
    if (shouldClear) {
      for (const target of targets) {
        clearHeadingStyles(target)
      }
      emitChange()
      updateToolbarState()
      return
    }

    for (const target of targets) {
      applyHeadingStyles(target)
    }

    emitChange()
    updateToolbarState()
  }, [emitChange, getEditorWindow, getHeadingTargets, restoreSelection, updateToolbarState])

  const applyFontSize = useCallback((sizePx: string) => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc || !win || !FONT_SIZE_OPTIONS.includes(sizePx)) {
      return
    }

    win.focus()
    restoreSelection()

    const selection = win.getSelection()
    const range = getSelectionRange(selection)
    try {
      if (!range || range.collapsed) {
        for (const target of getHeadingTargets()) {
          applyBlockFontSize(target, sizePx)
        }
      } else {
        const activeFontWrapper = closestElement(range.commonAncestorContainer, (element) =>
          element.hasAttribute(FONT_SIZE_MARKER_ATTR),
        )
        if (activeFontWrapper && activeFontWrapper.textContent === range.toString()) {
          applyBlockFontSize(activeFontWrapper, sizePx)
        } else {
          const wrappers = applyFontSizeToRange(doc, range, sizePx)
          if (wrappers.length > 0) {
            const nextRange = doc.createRange()
            nextRange.setStartBefore(wrappers[0])
            nextRange.setEndAfter(wrappers[wrappers.length - 1])
            selection?.removeAllRanges()
            selection?.addRange(nextRange)
          }
        }
      }
    } catch {
      return
    }

    saveSelection()
    emitChange()
    updateToolbarState()
  }, [emitChange, getEditorDocument, getEditorWindow, getHeadingTargets, restoreSelection, saveSelection, updateToolbarState])

  // Clear formatting must undo the editor markers, browser links, and inline
  // wrappers while keeping the content itself intact.
  const clearFormatting = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc || !win) {
      return
    }

    win.focus()
    restoreSelection()
    try {
      const selection = win.getSelection()
      const range = getSelectionRange(selection)
      if (range?.collapsed) {
        const block = closestElement(selection?.anchorNode ?? null, (element) => BLOCK_TAGS.includes(element.tagName))
        if (block) {
          selection?.removeAllRanges()
          const blockRange = doc.createRange()
          blockRange.selectNodeContents(block)
          selection?.addRange(blockRange)
        }
      }
      clearHeadingMarkersInSelection()
      clearEditorFormattingInSelection()
      doc.execCommand('unlink', false)
      clearEditorFormattingInSelection()
    } catch {
      return
    }
    saveSelection()
    emitChange()
    updateToolbarState()
  }, [
    clearEditorFormattingInSelection,
    clearHeadingMarkersInSelection,
    emitChange,
    getEditorDocument,
    getEditorWindow,
    restoreSelection,
    saveSelection,
    updateToolbarState,
  ])

  // Toolbar buttons prevent the iframe from losing focus before the command is
  // run, which avoids a very common browser-editing failure mode.
  const preventToolbarBlur = useMemo(
    () => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
    },
    [],
  )

  return (
    <div className="compose-editor-stack">
      {/* Toolbar actions are intentionally grouped by editing task so the
          operator can move left-to-right through history, style, lists, sizing,
          and cleanup. */}
      <div className="compose-toolbar">
        <div className="compose-toolbar-group" role="group" aria-label="History">
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Undo"
            title="Undo"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('undo')}
          >
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Redo"
            title="Redo"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('redo')}
          >
            <Redo2 size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="compose-toolbar-group" role="group" aria-label="Text style">
          <button
            type="button"
            className={`${buttonClass(toolbarState.bold)} compose-editor-icon-button`}
            aria-pressed={toolbarState.bold}
            aria-label="Bold"
            title="Bold"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('bold')}
          >
            <Bold size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${buttonClass(toolbarState.italic)} compose-editor-icon-button`}
            aria-pressed={toolbarState.italic}
            aria-label="Italic"
            title="Italic"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('italic')}
          >
            <Italic size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${buttonClass(toolbarState.underline)} compose-editor-icon-button`}
            aria-pressed={toolbarState.underline}
            aria-label="Underline"
            title="Underline"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('underline')}
          >
            <Underline size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="compose-toolbar-group" role="group" aria-label="Lists and headings">
          <button
            type="button"
            className={`${buttonClass(toolbarState.bulletList)} compose-editor-icon-button`}
            aria-pressed={toolbarState.bulletList}
            aria-label="Bulleted list"
            title="Bulleted list"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('insertUnorderedList')}
          >
            <List size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${buttonClass(toolbarState.orderedList)} compose-editor-icon-button`}
            aria-pressed={toolbarState.orderedList}
            aria-label="Numbered list"
            title="Numbered list"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('insertOrderedList')}
          >
            <ListOrdered size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${buttonClass(toolbarState.heading)} compose-editor-icon-button`}
            aria-pressed={toolbarState.heading}
            aria-label="Heading"
            title="Heading"
            onMouseDown={preventToolbarBlur}
            onClick={toggleHeading}
          >
            <Heading2 size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="compose-editor-size-menu" ref={fontSizeMenuRef}>
          <button
            type="button"
            className="compose-editor-size-control"
            aria-label="Font size"
            aria-haspopup="listbox"
            aria-expanded={fontSizeMenuOpen}
            title="Font size"
            onMouseDown={(event) => {
              event.preventDefault()
              saveSelection()
            }}
            onClick={() => setFontSizeMenuOpen((open) => !open)}
          >
            <span>{toolbarState.fontSize ? `${toolbarState.fontSize}px` : 'Size'}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {fontSizeMenuOpen ? (
            <div className="compose-editor-size-options" role="listbox" aria-label="Font size">
              {FONT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`compose-editor-size-option${toolbarState.fontSize === size ? ' is-active' : ''}`}
                  role="option"
                  aria-selected={toolbarState.fontSize === size}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    saveSelection()
                  }}
                  onClick={() => {
                    applyFontSize(size)
                    setFontSizeMenuOpen(false)
                  }}
                >
                  {size}px
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="compose-editor-button compose-editor-icon-button"
          aria-label="Clear formatting"
          title="Clear formatting"
          onMouseDown={preventToolbarBlur}
          onClick={clearFormatting}
        >
          <Eraser size={16} aria-hidden="true" />
        </button>
      </div>
      {/* The iframe is the actual editing surface. We keep the HTML document
          intact so preview and send workflows can reuse the exact same output. */}
      <div className="compose-canvas-shell">
        <iframe
          ref={frameRef}
          title="Email editor"
          className="compose-email-iframe compose-rich-editor-frame"
          srcDoc={initialDocumentRef.current}
          onLoad={() => {
            lastAppliedContentRef.current = normalizeDocumentHtml(initialDocumentRef.current)
            enableEditing()
          }}
        />
      </div>
    </div>
  )
}
