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

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'

interface EmailRichEditorProps {
  content: string
  onChange: (html: string) => void
  onFocus?: () => void
  onBlur?: () => void
}

export type EmailRichEditorHandle = {
  flush: () => string
}

type ToolbarState = {
  bold: boolean
  italic: boolean
  strike: boolean
  underline: boolean
  bulletList: boolean
  orderedList: boolean
  blockStyle: 'normal' | 'h1' | 'h2' | 'h3'
  alignment: 'left' | 'center' | 'right' | 'justify'
  fontSize: string
}

const HEADING_MARKER_ATTR = 'data-raven-heading'
const FONT_SIZE_MARKER_ATTR = 'data-raven-font-size'
const EDITOR_FORMAT_MARKER_ATTR = 'data-raven-editor-format'
const HEADING_STYLES: Record<'h1' | 'h2' | 'h3', { fontSize: string; lineHeight: string; fontWeight: string }> = {
  h1: { fontSize: '1.35em', lineHeight: '1.25', fontWeight: '800' },
  h2: { fontSize: '1.1em', lineHeight: '1.35', fontWeight: '750' },
  h3: { fontSize: '1em', lineHeight: '1.4', fontWeight: '700' },
}
const ADVISORY_BULLET_COLOR = '#b8942a'
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
  strike: false,
  underline: false,
  bulletList: false,
  orderedList: false,
  blockStyle: 'normal',
  alignment: 'left',
  fontSize: '',
}

// ========================================================================
// Document And Selection Helpers
// ========================================================================

function normalizeDocumentHtml(value: string): string {
  return String(value || '').trim()
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizeEditorLinkUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^(https?:\/\/|mailto:|\/)/i.test(trimmed)) return trimmed
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(trimmed)) return `https://${trimmed}`
  return null
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

function applyHeadingStyles(element: HTMLElement, level: 'h1' | 'h2' | 'h3' = 'h2'): void {
  const style = HEADING_STYLES[level]
  element.setAttribute(HEADING_MARKER_ATTR, level)
  element.style.fontSize = style.fontSize
  element.style.lineHeight = style.lineHeight
  element.style.fontFamily = 'inherit'
  element.style.fontWeight = style.fontWeight
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

function normalizeVisibleText(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function isLocationOnlyImpactShell(table: HTMLTableElement): boolean {
  const rows = Array.from(table.rows)
  if (rows.length > 2) return false

  const text = normalizeVisibleText(table.textContent || '')
  if (!text || !/[A-Z]/.test(text)) return false
  if (/properties affected|impact map|mapped ihcl properties/i.test(text)) return false

  const firstRowText = normalizeVisibleText(rows[0]?.textContent || '')
  const remainingText = normalizeVisibleText(rows.slice(1).map((row) => row.textContent || '').join(' '))
  const looksLikeLocationHeading =
    firstRowText.length > 2
    && firstRowText === firstRowText.toUpperCase()
    && /^[A-Z0-9\s,&./()'-]+$/.test(firstRowText)
    && (firstRowText.includes(',') || /\bINDIA\b|\bDELHI\b|\bTELANGANA\b|\bMAHARASHTRA\b/i.test(firstRowText))

  return looksLikeLocationHeading && !remainingText
}

function cleanupDeletedTemplateArtifacts(doc: Document): boolean {
  let changed = false
  let pass = 0

  while (pass < 4) {
    pass += 1
    let removedInPass = false
    const tables = Array.from(doc.body.querySelectorAll<HTMLTableElement>('table')).reverse()

    for (const table of tables) {
      const html = table.innerHTML || ''
      const text = normalizeVisibleText(table.textContent || '')
      const hasImpactPayload =
        html.includes('IMPACT_MAP_PLACEHOLDER')
        || /data-map-path=/i.test(html)
        || /alt=["']Impact Map["']/i.test(html)
      const hasPropertyHeading = /properties affected\s*\(\d+\)/i.test(text)
      const hasPropertyPayload =
        hasPropertyHeading
        && !/^properties affected\s*\(\d+\)$/i.test(text)
        && !/no mapped ihcl properties identified/i.test(text)

      if (hasPropertyHeading && !hasPropertyPayload) {
        table.remove()
        changed = true
        removedInPass = true
        continue
      }

      if (!hasImpactPayload && isLocationOnlyImpactShell(table)) {
        table.remove()
        changed = true
        removedInPass = true
      }
    }

    if (!removedInPass) break
  }

  return changed
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

function findActiveBlockStyle(node: Node | null): ToolbarState['blockStyle'] {
  const block = closestElement(node, (element) =>
    BLOCK_TAGS.includes(element.tagName) || ['H1', 'H2', 'H3'].includes(element.tagName),
  )
  if (!block) return 'normal'
  const markedHeading = block.getAttribute(HEADING_MARKER_ATTR)
  if (markedHeading === 'h1' || markedHeading === 'h2' || markedHeading === 'h3') {
    return markedHeading
  }
  if (block.tagName === 'H1') return 'h1'
  if (block.tagName === 'H2' || block.hasAttribute(HEADING_MARKER_ATTR)) return 'h2'
  if (block.tagName === 'H3') return 'h3'
  return 'normal'
}

function findActiveAlignment(node: Node | null): ToolbarState['alignment'] {
  const block = closestElement(node, (element) =>
    BLOCK_TAGS.includes(element.tagName) || ['H1', 'H2', 'H3'].includes(element.tagName),
  )
  const align = (block?.style.textAlign || '').trim().toLowerCase()
  if (align === 'center' || align === 'right' || align === 'justify') {
    return align
  }
  return 'left'
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

function createAdvisoryBulletRow(doc: Document, text = ''): { row: HTMLTableRowElement; contentCell: HTMLTableCellElement } {
  const row = doc.createElement('tr')
  const markerCell = doc.createElement('td')
  const contentCell = doc.createElement('td')

  markerCell.setAttribute('valign', 'top')
  markerCell.setAttribute('width', '14')
  markerCell.style.fontSize = '16px'
  markerCell.style.lineHeight = '1.5'
  markerCell.style.color = ADVISORY_BULLET_COLOR
  markerCell.style.fontWeight = '700'
  markerCell.style.padding = '0 6px 4px 0'
  markerCell.textContent = '\u203a'

  contentCell.setAttribute('valign', 'top')
  contentCell.style.fontSize = '13px'
  contentCell.style.lineHeight = '1.35'
  contentCell.style.color = '#2a3048'
  contentCell.style.padding = '0 0 2px 0'
  if (text.trim()) {
    contentCell.textContent = text
  } else {
    contentCell.innerHTML = '<br>'
  }

  row.append(markerCell, contentCell)
  return { row, contentCell }
}

function insertAdvisoryBulletAfterRow(doc: Document, win: Window, currentRow: HTMLTableRowElement, text = ''): boolean {
  if (!currentRow.parentNode) {
    return false
  }
  const { row, contentCell } = createAdvisoryBulletRow(doc, text)
  currentRow.parentNode.insertBefore(row, currentRow.nextSibling)
  placeSelectionInElement(doc, win, contentCell)
  return true
}

function createAdvisoryBulletTable(doc: Document): { table: HTMLTableElement; contentCell: HTMLTableCellElement } {
  const table = doc.createElement('table')
  const tbody = doc.createElement('tbody')
  const { row, contentCell } = createAdvisoryBulletRow(doc)

  table.setAttribute('role', 'presentation')
  table.setAttribute('width', '100%')
  table.style.borderCollapse = 'collapse'
  table.style.margin = '0 0 6px 0'

  tbody.appendChild(row)
  table.appendChild(tbody)
  return { table, contentCell }
}

function rowLooksLikeAdvisoryBullet(row: HTMLTableRowElement): boolean {
  const firstCell = row.cells.item(0)
  return Boolean(firstCell && firstCell.textContent?.trim() === '\u203a')
}

function normalizePastedText(value: string): string[] {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\u00a0/g, ' ').trim())
    .map((line) => line
      .replace(/^(?:[-*]|\u2022|\u203a|\u00bb|\u2013|\u2014)\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^[a-zA-Z][.)]\s+/, '')
      .replace(/^\[[ xX]\]\s+/, '')
      .trim())
    .filter(Boolean)
}

function getClipboardPlainText(event: ClipboardEvent): string {
  const text = event.clipboardData?.getData('text/plain')
  if (text) {
    return text
  }

  const htmlText = event.clipboardData?.getData('text/html')
  if (!htmlText) {
    return ''
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(htmlText, 'text/html')
  parsed.querySelectorAll('li').forEach((item) => {
    item.insertAdjacentText('beforebegin', '\n')
    item.insertAdjacentText('beforeend', '\n')
  })
  parsed.querySelectorAll('br, p, div, tr').forEach((item) => {
    item.insertAdjacentText('afterend', '\n')
  })
  return parsed.body.textContent || ''
}

function placeCaretAfterNode(doc: Document, win: Window, node: Node): void {
  const range = doc.createRange()
  range.setStartAfter(node)
  range.collapse(true)

  const selection = win.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeCaretBeforeNode(doc: Document, win: Window, node: Node): void {
  const range = doc.createRange()
  range.setStartBefore(node)
  range.collapse(true)

  const selection = win.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeCaretAtEnd(doc: Document, win: Window, element: HTMLElement): void {
  const range = doc.createRange()
  range.selectNodeContents(element)
  range.collapse(false)

  const selection = win.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function placeSelectionInElement(doc: Document, win: Window, element: HTMLElement): void {
  const range = doc.createRange()
  range.selectNodeContents(element)
  range.collapse(false)

  const selection = win.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function elementIsVisuallyEmpty(element: HTMLElement): boolean {
  const text = (element.textContent || '').replace(/\u00a0/g, ' ').trim()
  if (text) {
    return false
  }
  return !element.querySelector('img, table, hr')
}

function nodeIsBlankLineArtifact(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return !(node.textContent || '').replace(/\u00a0/g, ' ').trim()
  }
  const view = node.ownerDocument?.defaultView
  if (!view || !(node instanceof view.HTMLElement)) {
    return false
  }
  if (node.tagName === 'BR') {
    return true
  }
  if (['P', 'DIV', 'SPAN'].includes(node.tagName) && elementIsVisuallyEmpty(node)) {
    return true
  }
  return false
}

function applyCompactListSpacing(root: ParentNode): void {
  const lists = Array.from(root.querySelectorAll('ul, ol')) as HTMLElement[]
  for (const list of lists) {
    list.style.margin = '2px 0 3px 22px'
    list.style.padding = '0'
  }

  const items = Array.from(root.querySelectorAll('li')) as HTMLElement[]
  for (const item of items) {
    item.style.margin = '0 0 2px 0'
    item.style.padding = '0'
    item.style.lineHeight = '1.35'
  }
}

function compactAdvisoryCellListGaps(cell: HTMLTableCellElement): { changed: boolean; firstList: HTMLElement | null } {
  let changed = false
  const lists = Array.from(cell.querySelectorAll('ul, ol')) as HTMLElement[]
  applyCompactListSpacing(cell)

  for (const list of lists) {
    let previous = list.previousSibling
    while (previous && nodeIsBlankLineArtifact(previous)) {
      const removeNode = previous
      previous = removeNode.previousSibling
      removeNode.remove()
      changed = true
    }

    let next = list.nextSibling
    while (next && nodeIsBlankLineArtifact(next)) {
      const removeNode = next
      next = removeNode.nextSibling
      removeNode.remove()
      changed = true
    }
  }

  return { changed, firstList: lists[0] ?? null }
}

function compactCurrentAdvisoryCellGap(doc: Document, win: Window, range: Range): boolean {
  const row = closestElement(range.commonAncestorContainer, (element) => element.tagName === 'TR') as
    | HTMLTableRowElement
    | null
  if (!row || !rowLooksLikeAdvisoryBullet(row)) {
    return false
  }

  const contentCell = row.cells.item(1)
  if (!contentCell) {
    return false
  }

  const { changed, firstList } = compactAdvisoryCellListGaps(contentCell)
  if (!changed) {
    return false
  }

  if (firstList) {
    placeCaretBeforeNode(doc, win, firstList)
  } else {
    placeCaretAtEnd(doc, win, contentCell)
  }
  return true
}

function removeEmptyAdvisoryBulletRow(
  doc: Document,
  win: Window,
  currentRow: HTMLTableRowElement,
  forward: boolean,
): boolean {
  if (!rowLooksLikeAdvisoryBullet(currentRow)) {
    return false
  }

  const contentCell = currentRow.cells.item(1)
  if (!contentCell || !elementIsVisuallyEmpty(contentCell)) {
    return false
  }

  const parent = currentRow.parentElement
  const table = closestElement(currentRow, (element) => element.tagName === 'TABLE') as HTMLTableElement | null
  const siblingRows = parent
    ? (Array.from(parent.children).filter((child) => child.tagName === 'TR') as HTMLTableRowElement[])
    : []
  const currentIndex = siblingRows.indexOf(currentRow)
  const previousRow = currentIndex > 0 ? siblingRows[currentIndex - 1] : null
  const nextRow = currentIndex >= 0 && currentIndex < siblingRows.length - 1 ? siblingRows[currentIndex + 1] : null
  const targetRow = forward ? nextRow || previousRow : previousRow || nextRow

  currentRow.remove()

  if (targetRow?.isConnected && rowLooksLikeAdvisoryBullet(targetRow)) {
    const targetCell = targetRow.cells.item(1)
    if (targetCell) {
      placeCaretAtEnd(doc, win, targetCell)
    }
    return true
  }

  if (table?.isConnected) {
    const fallback = doc.createElement('p')
    fallback.innerHTML = '<br>'
    table.parentNode?.insertBefore(fallback, forward ? table.nextSibling : table)
    table.remove()
    placeSelectionInElement(doc, win, fallback)
  }

  return true
}

function removeForeignListsFromAdvisoryRows(doc: Document): boolean {
  let changed = false
  const rows = Array.from(doc.body.querySelectorAll('tr')) as HTMLTableRowElement[]

  for (const row of rows) {
    if (!rowLooksLikeAdvisoryBullet(row)) {
      continue
    }

    const contentCell = row.cells.item(1)
    if (!contentCell) {
      continue
    }

    const lists = Array.from(contentCell.querySelectorAll('ul, ol'))
    for (const list of lists) {
      const itemTexts = Array.from(list.querySelectorAll('li'))
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter(Boolean)

      if (!itemTexts.length) {
        list.remove()
        changed = true
        continue
      }

      const fragment = doc.createDocumentFragment()
      itemTexts.forEach((itemText, index) => {
        if (index > 0) {
          fragment.appendChild(doc.createElement('br'))
        }
        fragment.appendChild(doc.createTextNode(itemText))
      })
      list.replaceWith(fragment)
      changed = true
    }
  }

  return changed
}

function insertNormalizedPaste(doc: Document, win: Window, lines: string[]): boolean {
  const selection = win.getSelection()
  const range = getSelectionRange(selection)
  if (!range || !doc.body.contains(range.commonAncestorContainer) || !lines.length) {
    return false
  }

  const currentRow = closestElement(range.commonAncestorContainer, (element) => element.tagName === 'TR') as
    | HTMLTableRowElement
    | null
  const currentTable = closestElement(range.commonAncestorContainer, (element) => element.tagName === 'TABLE') as
    | HTMLTableElement
    | null
  const tableHasAdvisoryRows = currentTable
    ? Array.from(currentTable.rows).some((row) => rowLooksLikeAdvisoryBullet(row))
    : false

  range.deleteContents()

  if (currentRow && currentRow.parentNode && (rowLooksLikeAdvisoryBullet(currentRow) || tableHasAdvisoryRows)) {
    const firstTextNode = doc.createTextNode(lines[0])
    range.insertNode(firstTextNode)
    let insertAfterRow = currentRow
    let lastContentCell: HTMLTableCellElement | null = null

    for (const line of lines.slice(1)) {
      const { row, contentCell } = createAdvisoryBulletRow(doc, line)
      insertAfterRow.parentNode?.insertBefore(row, insertAfterRow.nextSibling)
      insertAfterRow = row
      lastContentCell = contentCell
    }

    if (lastContentCell) {
      placeCaretAtEnd(doc, win, lastContentCell)
    } else {
      placeCaretAfterNode(doc, win, firstTextNode)
    }
    return true
  }

  const fragment = doc.createDocumentFragment()
  let lastNode: Node | null = null
  lines.forEach((line, index) => {
    if (index > 0) {
      const breakNode = doc.createElement('br')
      fragment.appendChild(breakNode)
      lastNode = breakNode
    }
    const textNode = doc.createTextNode(line)
    fragment.appendChild(textNode)
    lastNode = textNode
  })

  range.insertNode(fragment)
  if (lastNode) {
    placeCaretAfterNode(doc, win, lastNode)
  }
  return true
}

function insertBasicTable(doc: Document, win: Window): boolean {
  const selection = win.getSelection()
  const range = getSelectionRange(selection)
  if (!range || !doc.body.contains(range.commonAncestorContainer)) {
    return false
  }

  const table = doc.createElement('table')
  const tbody = doc.createElement('tbody')
  table.style.width = '100%'
  table.style.borderCollapse = 'collapse'
  table.style.margin = '8px 0'

  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    const row = doc.createElement('tr')
    for (let cellIndex = 0; cellIndex < 2; cellIndex += 1) {
      const cell = doc.createElement(rowIndex === 0 ? 'th' : 'td')
      cell.style.border = '1px solid #d7deea'
      cell.style.padding = '7px 9px'
      cell.style.fontSize = '13px'
      cell.style.lineHeight = '1.45'
      cell.textContent = rowIndex === 0 ? `Header ${cellIndex + 1}` : 'Text'
      row.appendChild(cell)
    }
    tbody.appendChild(row)
  }

  table.appendChild(tbody)
  range.deleteContents()
  range.insertNode(table)
  const firstCell = table.querySelector<HTMLElement>('th,td')
  if (firstCell) {
    placeSelectionInElement(doc, win, firstCell)
  }
  return true
}

function ensureRuntimeEditorStyles(doc: Document): void {
  if (doc.getElementById('raven-email-editor-runtime-style')) {
    return
  }

  const style = doc.createElement('style')
  style.id = 'raven-email-editor-runtime-style'
  style.textContent = `
    html,
    body {
      -webkit-user-select: text;
      user-select: text;
      line-height: 1.35;
    }

    body:focus {
      outline: none;
    }

    ::selection {
      background: rgba(37, 99, 235, 0.28);
      color: inherit;
    }

    td {
      line-height: 1.35 !important;
    }

    td p,
    td div {
      margin-top: 0 !important;
      margin-bottom: 4px !important;
    }

    td ul,
    td ol {
      margin: 2px 0 3px 22px !important;
      padding: 0 !important;
    }

    td li {
      margin: 0 0 2px 0 !important;
      padding: 0 !important;
      line-height: 1.35 !important;
    }
  `
  doc.head.appendChild(style)
}

// ========================================================================
// Editor Component
// ========================================================================

export const EmailRichEditor = forwardRef<EmailRichEditorHandle, EmailRichEditorProps>(function EmailRichEditor(
  { content, onChange, onFocus, onBlur },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const lastAppliedContentRef = useRef('')
  const lastEmittedContentRef = useRef('')
  const initialDocumentRef = useRef(ensureEditorDocument(content))
  const savedRangeRef = useRef<Range | null>(null)
  const editorFocusedRef = useRef(false)
  const onFocusRef = useRef(onFocus)
  const onBlurRef = useRef(onBlur)
  const fontSizeMenuRef = useRef<HTMLDivElement | null>(null)
  const [toolbarState, setToolbarState] = useState<ToolbarState>(EMPTY_TOOLBAR_STATE)
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false)

  const buttonClass = useCallback(
    (active: boolean) => `compose-editor-button${active ? ' is-active' : ''}`,
    [],
  )

  const getEditorDocument = useCallback(() => frameRef.current?.contentDocument ?? null, [])
  const getEditorWindow = useCallback(() => frameRef.current?.contentWindow ?? null, [])

  useEffect(() => {
    onFocusRef.current = onFocus
  }, [onFocus])

  useEffect(() => {
    onBlurRef.current = onBlur
  }, [onBlur])

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
      strike: queryState('strikeThrough'),
      underline: queryState('underline'),
      bulletList: Boolean(closestTag(anchorNode, ['UL'])),
      orderedList: Boolean(closestTag(anchorNode, ['OL'])),
      blockStyle: findActiveBlockStyle(anchorNode),
      alignment: findActiveAlignment(anchorNode),
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
    applyCompactListSpacing(doc.body)
    cleanupDeletedTemplateArtifacts(doc)
    const html = serializeEditorDocument(doc)
    lastAppliedContentRef.current = normalizeDocumentHtml(html)
    lastEmittedContentRef.current = normalizeDocumentHtml(html)
    onChange(html)
  }, [getEditorDocument, onChange])

  useImperativeHandle(ref, () => ({
    flush: () => {
      const doc = getEditorDocument()
      if (!doc?.documentElement) {
        return lastEmittedContentRef.current
      }
      applyCompactListSpacing(doc.body)
      cleanupDeletedTemplateArtifacts(doc)
      const html = serializeEditorDocument(doc)
      lastAppliedContentRef.current = normalizeDocumentHtml(html)
      lastEmittedContentRef.current = normalizeDocumentHtml(html)
      onChange(html)
      return html
    },
  }), [getEditorDocument, onChange])

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
      doc.body.contentEditable = 'true'
      doc.body.tabIndex = 0
      doc.body.setAttribute('spellcheck', 'true')
      doc.body.style.caretColor = '#0f172a'
      doc.body.style.outline = 'none'
      doc.body.style.cursor = 'text'
    }

    ensureRuntimeEditorStyles(doc)
    if (removeForeignListsFromAdvisoryRows(doc)) {
      window.setTimeout(() => {
        emitChange()
        updateToolbarState()
      }, 0)
    }

    const emitAfterNativeEdit = () => {
      window.setTimeout(() => {
        if (removeForeignListsFromAdvisoryRows(doc)) {
          emitChange()
          saveSelection()
          updateToolbarState()
          return
        }
        emitChange()
        saveSelection()
        updateToolbarState()
      }, 0)
    }

    const handleInput = () => {
      applyCompactListSpacing(doc.body)
      emitChange()
      updateToolbarState()
    }
    const handleSelection = () => {
      saveSelection()
      updateToolbarState()
    }
    const handleFocus = () => {
      editorFocusedRef.current = true
      onFocusRef.current?.()
      handleSelection()
    }
    const handleBlur = () => {
      emitChange()
      editorFocusedRef.current = false
      onBlurRef.current?.()
      saveSelection()
    }
    const handleClipboardChange = () => {
      emitAfterNativeEdit()
    }
    const handlePaste = (event: ClipboardEvent) => {
      const pastedLines = normalizePastedText(getClipboardPlainText(event))
      if (!pastedLines.length) {
        emitAfterNativeEdit()
        return
      }

      event.preventDefault()
      win.focus()
      if (insertNormalizedPaste(doc, win, pastedLines)) {
        removeForeignListsFromAdvisoryRows(doc)
        emitChange()
        saveSelection()
        updateToolbarState()
      }
    }
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isShortcut = event.ctrlKey || event.metaKey

      if (isShortcut && ['b', 'i', 'u', 's', 'z', 'y'].includes(key)) {
        event.preventDefault()
        const commandByKey: Record<string, string> = {
          b: 'bold',
          i: 'italic',
          u: 'underline',
          s: 'strikeThrough',
          z: event.shiftKey ? 'redo' : 'undo',
          y: 'redo',
        }
        try {
          doc.execCommand('styleWithCSS', false, 'true')
          doc.execCommand(commandByKey[key], false)
          const range = getSelectionRange(win.getSelection())
          if (range && ['b', 'i', 'u', 's'].includes(key)) {
            markEditorFormattingInRange(doc, range)
          }
        } catch {
          return
        }
        emitChange()
        saveSelection()
        updateToolbarState()
        return
      }

      if (isShortcut && ['x', 'v'].includes(key)) {
        handleClipboardChange()
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        try {
          doc.execCommand(event.shiftKey ? 'outdent' : 'indent', false)
        } catch {
          return
        }
        emitChange()
        saveSelection()
        updateToolbarState()
        return
      }

      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        try {
          doc.execCommand('insertHTML', false, '<br>')
        } catch {
          return
        }
        emitChange()
        saveSelection()
        updateToolbarState()
        return
      }

      if (event.key === 'Enter') {
        const selection = win.getSelection()
        const range = getSelectionRange(selection)
        const currentRow = closestElement(range?.commonAncestorContainer ?? null, (element) => element.tagName === 'TR') as
          | HTMLTableRowElement
          | null
        if (currentRow && rowLooksLikeAdvisoryBullet(currentRow)) {
          event.preventDefault()
          if (insertAdvisoryBulletAfterRow(doc, win, currentRow)) {
            emitChange()
            saveSelection()
            updateToolbarState()
          }
          return
        }
        emitAfterNativeEdit()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selection = win.getSelection()
        const range = getSelectionRange(selection)
        const currentRow = closestElement(range?.commonAncestorContainer ?? null, (element) => element.tagName === 'TR') as
          | HTMLTableRowElement
          | null

        if (range?.collapsed && compactCurrentAdvisoryCellGap(doc, win, range)) {
          event.preventDefault()
          emitChange()
          saveSelection()
          updateToolbarState()
          return
        }

        if (range?.collapsed && currentRow && removeEmptyAdvisoryBulletRow(doc, win, currentRow, event.key === 'Delete')) {
          event.preventDefault()
          emitChange()
          saveSelection()
          updateToolbarState()
          return
        }

        emitAfterNativeEdit()
      }
    }

    doc.addEventListener('input', handleInput)
    doc.addEventListener('keydown', handleKeydown)
    doc.addEventListener('cut', handleClipboardChange)
    doc.addEventListener('paste', handlePaste)
    doc.addEventListener('keyup', handleSelection)
    doc.addEventListener('mouseup', handleSelection)
    doc.addEventListener('mousedown', handleFocus)
    doc.addEventListener('focusin', handleFocus)
    doc.addEventListener('focusout', handleBlur)
    doc.addEventListener('selectionchange', handleSelection)
    win.addEventListener('focus', handleFocus)
    win.addEventListener('blur', handleBlur)

    cleanupRef.current = () => {
      doc.removeEventListener('input', handleInput)
      doc.removeEventListener('keydown', handleKeydown)
      doc.removeEventListener('cut', handleClipboardChange)
      doc.removeEventListener('paste', handlePaste)
      doc.removeEventListener('keyup', handleSelection)
      doc.removeEventListener('mouseup', handleSelection)
      doc.removeEventListener('mousedown', handleFocus)
      doc.removeEventListener('focusin', handleFocus)
      doc.removeEventListener('focusout', handleBlur)
      doc.removeEventListener('selectionchange', handleSelection)
      win.removeEventListener('focus', handleFocus)
      win.removeEventListener('blur', handleBlur)
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
    if (editorFocusedRef.current) {
      return
    }
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
      if (range && ['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
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

  // Paragraph styling is applied at the block level so the editor feels like a
  // Word-style composer without breaking the underlying email-table layout.
  const applyBlockStyle = useCallback((style: ToolbarState['blockStyle']) => {
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

    for (const target of targets) {
      if (style === 'normal') {
        clearHeadingStyles(target)
      } else {
        applyHeadingStyles(target, style)
      }
    }

    emitChange()
    updateToolbarState()
  }, [emitChange, getEditorWindow, getHeadingTargets, restoreSelection, updateToolbarState])

  const runAlignment = useCallback((alignment: ToolbarState['alignment']) => {
    const commandByAlignment: Record<ToolbarState['alignment'], string> = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
      justify: 'justifyFull',
    }
    runCommand(commandByAlignment[alignment])
  }, [runCommand])

  const insertLink = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc || !win) {
      return
    }

    win.focus()
    restoreSelection()
    const selection = win.getSelection()
    const selectedText = selection?.toString().trim() || ''
    const url = window.prompt('Enter link URL')
    if (!url?.trim()) {
      return
    }

    const safeUrl = normalizeEditorLinkUrl(url)
    if (!safeUrl) {
      return
    }
    const escapedUrl = escapeHtmlAttribute(safeUrl)
    try {
      if (!selectedText) {
        doc.execCommand('insertHTML', false, `<a href="${escapedUrl}" target="_blank" rel="noreferrer">${escapedUrl}</a>`)
      } else {
        doc.execCommand('createLink', false, safeUrl)
        const link = closestTag(win.getSelection()?.anchorNode ?? null, ['A'])
        if (link) {
          link.setAttribute('target', '_blank')
          link.setAttribute('rel', 'noreferrer')
        }
      }
    } catch {
      return
    }

    emitChange()
    saveSelection()
    updateToolbarState()
  }, [emitChange, getEditorDocument, getEditorWindow, restoreSelection, saveSelection, updateToolbarState])

  const insertTable = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc || !win) {
      return
    }

    win.focus()
    restoreSelection()
    if (!insertBasicTable(doc, win)) {
      return
    }
    emitChange()
    saveSelection()
    updateToolbarState()
  }, [emitChange, getEditorDocument, getEditorWindow, restoreSelection, saveSelection, updateToolbarState])

  const formatBlockQuote = useCallback(() => {
    runCommand('formatBlock', 'blockquote')
  }, [runCommand])

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

  const insertAdvisoryBullet = useCallback(() => {
    const doc = getEditorDocument()
    const win = getEditorWindow()
    if (!doc?.body || !win) {
      return
    }

    win.focus()
    restoreSelection()

    try {
      const selection = win.getSelection()
      const range = getSelectionRange(selection)
      if (!range) {
        return
      }

      const currentRow = closestElement(range.commonAncestorContainer, (element) => element.tagName === 'TR') as
        | HTMLTableRowElement
        | null
      const currentTable = closestElement(range.commonAncestorContainer, (element) => element.tagName === 'TABLE') as
        | HTMLTableElement
        | null
      const tableHasAdvisoryRows = currentTable
        ? Array.from(currentTable.rows).some((row) => rowLooksLikeAdvisoryBullet(row))
        : false

      if (currentRow && currentRow.parentNode && (rowLooksLikeAdvisoryBullet(currentRow) || tableHasAdvisoryRows)) {
        const { row, contentCell } = createAdvisoryBulletRow(doc)
        currentRow.parentNode.insertBefore(row, currentRow.nextSibling)
        placeSelectionInElement(doc, win, contentCell)
      } else {
        const { table, contentCell } = createAdvisoryBulletTable(doc)
        range.deleteContents()
        range.insertNode(table)
        placeSelectionInElement(doc, win, contentCell)
      }
    } catch {
      return
    }

    saveSelection()
    emitChange()
    updateToolbarState()
  }, [emitChange, getEditorDocument, getEditorWindow, restoreSelection, saveSelection, updateToolbarState])

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

        <div className="compose-toolbar-group compose-toolbar-group--select" role="group" aria-label="Paragraph style">
          <span className="compose-editor-style-icon" aria-hidden="true">
            {toolbarState.blockStyle === 'h1'
              ? <Heading1 size={16} />
              : toolbarState.blockStyle === 'h2'
                ? <Heading2 size={16} />
                : toolbarState.blockStyle === 'h3'
                  ? <Heading3 size={16} />
                  : <Pilcrow size={16} />}
          </span>
          <select
            className="compose-editor-select"
            aria-label="Paragraph style"
            title="Paragraph style"
            value={toolbarState.blockStyle}
            onMouseDown={() => saveSelection()}
            onChange={(event) => applyBlockStyle(event.target.value as ToolbarState['blockStyle'])}
          >
            <option value="normal">Normal</option>
            <option value="h1">H1</option>
            <option value="h2">H2</option>
            <option value="h3">H3</option>
          </select>
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
          <button
            type="button"
            className={`${buttonClass(toolbarState.strike)} compose-editor-icon-button`}
            aria-pressed={toolbarState.strike}
            aria-label="Strikethrough"
            title="Strikethrough"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('strikeThrough')}
          >
            <Strikethrough size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="compose-toolbar-group" role="group" aria-label="Lists and indentation">
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
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Indent"
            title="Indent"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('indent')}
          >
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Outdent"
            title="Outdent"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('outdent')}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button compose-editor-advisory-bullet-button"
            aria-label="Insert orange advisory bullet"
            title="Insert orange advisory bullet"
            onMouseDown={preventToolbarBlur}
            onClick={insertAdvisoryBullet}
          >
            <span aria-hidden="true">{'\u203a'}</span>
          </button>
        </div>

        <div className="compose-toolbar-group" role="group" aria-label="Alignment">
          <button
            type="button"
            className={`${buttonClass(toolbarState.alignment === 'left')} compose-editor-icon-button`}
            aria-pressed={toolbarState.alignment === 'left'}
            aria-label="Align left"
            title="Align left"
            onMouseDown={preventToolbarBlur}
            onClick={() => runAlignment('left')}
          >
            <AlignLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${buttonClass(toolbarState.alignment === 'center')} compose-editor-icon-button`}
            aria-pressed={toolbarState.alignment === 'center'}
            aria-label="Align center"
            title="Align center"
            onMouseDown={preventToolbarBlur}
            onClick={() => runAlignment('center')}
          >
            <AlignCenter size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${buttonClass(toolbarState.alignment === 'right')} compose-editor-icon-button`}
            aria-pressed={toolbarState.alignment === 'right'}
            aria-label="Align right"
            title="Align right"
            onMouseDown={preventToolbarBlur}
            onClick={() => runAlignment('right')}
          >
            <AlignRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${buttonClass(toolbarState.alignment === 'justify')} compose-editor-icon-button`}
            aria-pressed={toolbarState.alignment === 'justify'}
            aria-label="Justify"
            title="Justify"
            onMouseDown={preventToolbarBlur}
            onClick={() => runAlignment('justify')}
          >
            <AlignJustify size={16} aria-hidden="true" />
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

        <div className="compose-toolbar-group" role="group" aria-label="Insert">
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Insert link"
            title="Insert link"
            onMouseDown={preventToolbarBlur}
            onClick={insertLink}
          >
            <Link size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Insert table"
            title="Insert table"
            onMouseDown={preventToolbarBlur}
            onClick={insertTable}
          >
            <Table2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Blockquote"
            title="Blockquote"
            onMouseDown={preventToolbarBlur}
            onClick={formatBlockQuote}
          >
            <Quote size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="compose-editor-button compose-editor-icon-button"
            aria-label="Horizontal rule"
            title="Horizontal rule"
            onMouseDown={preventToolbarBlur}
            onClick={() => runCommand('insertHorizontalRule')}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
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
})
