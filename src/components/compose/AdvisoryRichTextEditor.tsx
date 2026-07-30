/**
 * Advisory Rich Text Editor
 *
 * A compact TipTap editor for generated advisory text. The editor intentionally
 * exposes a controlled formatting set so advisories remain professional and
 * consistent while still supporting common keyboard shortcuts such as Ctrl+B.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Extension } from '@tiptap/core'
import UnderlineExtension from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
  Underline as UnderlineIcon,
} from 'lucide-react'

type AdvisoryRichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  saving?: boolean
}

type BlockStyle = 'normal' | 'h1' | 'h2' | 'h3'
type Alignment = 'left' | 'center' | 'right' | 'justify'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ravenTextAlign: {
      setRavenTextAlign: (alignment: Alignment) => ReturnType
    }
  }
}

const TextAlignLite = Extension.create({
  name: 'ravenTextAlign',

  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          textAlign: {
            default: 'left',
            parseHTML: (element) => element.style.textAlign || 'left',
            renderHTML: (attributes) => {
              const textAlign = attributes.textAlign
              if (!textAlign || textAlign === 'left') return {}
              return { style: `text-align: ${textAlign}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setRavenTextAlign:
        (alignment) =>
        ({ chain, editor }) => {
          const target = editor.isActive('heading') ? 'heading' : 'paragraph'
          return chain().focus().updateAttributes(target, { textAlign: alignment }).run()
        },
    }
  },
})

function looksLikeHtml(value: string): boolean {
  return /<\/?(p|h[1-3]|ul|ol|li|blockquote|strong|b|em|i|u|s|strike|del|a|table|hr|br)\b/i.test(value)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeEditorHtml(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''

  root.querySelectorAll('script, style, iframe, object, embed, form, input, button').forEach((node) => node.remove())

  root.querySelectorAll('*').forEach((node) => {
    const tag = node.tagName.toLowerCase()
    if (!['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'hr', 'table', 'tbody', 'thead', 'tr', 'td', 'th'].includes(tag)) {
      node.replaceWith(...Array.from(node.childNodes))
      return
    }

    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      if (tag === 'a' && ['href', 'target', 'rel', 'title'].includes(name)) return
      if (tag === 'ul' && name === 'data-raven-checklist') return
      node.removeAttribute(attribute.name)
    })

    if (tag === 'a') {
      const href = node.getAttribute('href') || ''
      if (!/^(https?:\/\/|mailto:)/i.test(href)) {
        node.removeAttribute('href')
      } else {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }
  })

  return root.innerHTML
    .replace(/<p>\s*<\/p>/gi, '<p></p>')
    .replace(/\sdata-raven-checklist=""/gi, ' data-raven-checklist="true"')
    .trim()
}

function formatInlineText(value: string): string {
  let html = escapeHtml(value)
  html = html.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>')
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
  html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
  html = html.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  )
  return html
}

function paragraphHtml(line: string): string {
  return `<p>${formatInlineText(line) || '<br />'}</p>`
}

function textToEditorHtml(value: string): string {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n')
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      output.push('<p></p>')
      continue
    }

    if (/^---+$/.test(trimmed)) {
      output.push('<hr />')
      continue
    }

    if (/^>\s+/.test(trimmed)) {
      output.push(`<blockquote><p>${formatInlineText(trimmed.replace(/^>\s+/, ''))}</p></blockquote>`)
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      output.push(`<h${headingMatch[1].length}>${formatInlineText(headingMatch[2])}</h${headingMatch[1].length}>`)
      continue
    }

    if (/^[A-Za-z][A-Za-z\s/&-]{2,38}:$/.test(trimmed)) {
      output.push(`<h2>${formatInlineText(trimmed.replace(/:$/, ''))}</h2>`)
      continue
    }

    if (/^-\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^-\s+\[[ xX]\]\s+/.test(lines[index].trim())) {
        items.push(`<li>${formatInlineText(lines[index].trim().replace(/^-\s+\[[ xX]\]\s+/, ''))}</li>`)
        index += 1
      }
      index -= 1
      output.push(`<ul data-raven-checklist="true">${items.join('')}</ul>`)
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(`<li>${formatInlineText(lines[index].trim().replace(/^[-*]\s+/, ''))}</li>`)
        index += 1
      }
      index -= 1
      output.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(`<li>${formatInlineText(lines[index].trim().replace(/^\d+\.\s+/, ''))}</li>`)
        index += 1
      }
      index -= 1
      output.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    if (trimmed.includes('|') && lines[index + 1]?.trim().match(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/)) {
      const rows: string[] = []
      while (index < lines.length && lines[index].includes('|')) {
        rows.push(`<tr>${lines[index].split('|').filter(Boolean).map((cell) => `<td>${formatInlineText(cell.trim())}</td>`).join('')}</tr>`)
        index += 1
      }
      index -= 1
      output.push(`<table><tbody>${rows.join('')}</tbody></table>`)
      continue
    }

    output.push(paragraphHtml(line))
  }

  return output.join('')
}

function valueToEditorHtml(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return looksLikeHtml(normalized) ? normalizeEditorHtml(normalized) : textToEditorHtml(normalized)
}

function inlineNodeToText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ''
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(inlineNodeToText).join('')
  }

  const inner = Array.from(node.childNodes).map(inlineNodeToText).join('')
  const tag = node.tagName.toLowerCase()

  if (tag === 'strong' || tag === 'b') return `**${inner}**`
  if (tag === 'em' || tag === 'i') return `_${inner}_`
  if (tag === 'u') return `<u>${inner}</u>`
  if (tag === 's' || tag === 'strike' || tag === 'del') return `~~${inner}~~`
  if (tag === 'a') {
    const href = node.getAttribute('href') || ''
    return href ? `[${inner}](${href})` : inner
  }
  if (tag === 'br') return '\n'
  return inner
}

function blockNodeToText(node: Element): string {
  const tag = node.tagName.toLowerCase()

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const text = inlineNodeToText(node).trim()
    return text ? `${text.replace(/:$/, '')}:` : ''
  }

  if (tag === 'blockquote') {
    return inlineNodeToText(node).split('\n').map((line) => `> ${line.trim()}`).join('\n')
  }

  if (tag === 'hr') return '---'

  if (tag === 'ul' || tag === 'ol') {
    const checklist = node.getAttribute('data-raven-checklist') === 'true' || node.classList.contains('advisory-checklist')
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((child, index) => {
        const itemText = inlineNodeToText(child).replace(/^☐\s*/, '').trim()
        if (checklist) return `- [ ] ${itemText}`
        return tag === 'ol' ? `${index + 1}. ${itemText}` : `- ${itemText}`
      })
      .join('\n')
  }

  if (tag === 'table') {
    const rows = Array.from(node.querySelectorAll('tr')).map((row) =>
      Array.from(row.children).map((cell) => inlineNodeToText(cell).trim()).join(' | '),
    )
    return rows.join('\n')
  }

  return inlineNodeToText(node).trim()
}

export function editorHtmlToText(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''

  return Array.from(root.children)
    .map(blockNodeToText)
    .filter((line, index, lines) => line || index < lines.length - 1)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function ToolbarButton({
  active,
  disabled,
  label,
  title,
  children,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  title?: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`compose-rich-toolbar-button${active ? ' is-active' : ''}`}
      onMouseDown={(event) => {
        event.preventDefault()
      }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={title || label}
    >
      {children}
    </button>
  )
}

export function AdvisoryRichTextEditor({ value, onChange, onFocus, onBlur, saving }: AdvisoryRichTextEditorProps) {
  const [previewMode, setPreviewMode] = useState(false)
  const lastValueRef = useRef(value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      UnderlineExtension,
      TextAlignLite,
    ],
    content: valueToEditorHtml(value),
    editorProps: {
      attributes: {
        class: 'compose-rich-editor-prose',
        'aria-label': 'Generated advisory rich text editor',
        spellcheck: 'true',
      },
      handleDOMEvents: {
        focus: () => {
          onFocus?.()
          return false
        },
        blur: () => {
          onBlur?.()
          return false
        },
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      const nextHtml = normalizeEditorHtml(activeEditor.getHTML())
      lastValueRef.current = nextHtml
      onChange(nextHtml)
    },
  })

  useEffect(() => {
    if (!editor) return
    if (value === lastValueRef.current) return
    const nextHtml = valueToEditorHtml(value)
    const currentHtml = normalizeEditorHtml(editor.getHTML())
    if (currentHtml === nextHtml) {
      lastValueRef.current = nextHtml
      return
    }
    lastValueRef.current = nextHtml
    editor.commands.setContent(nextHtml, { emitUpdate: false })
  }, [editor, value])

  const blockStyle = useMemo<BlockStyle>(() => {
    if (!editor) return 'normal'
    if (editor.isActive('heading', { level: 1 })) return 'h1'
    if (editor.isActive('heading', { level: 2 })) return 'h2'
    if (editor.isActive('heading', { level: 3 })) return 'h3'
    return 'normal'
  }, [editor?.state])

  const applyBlockStyle = (style: BlockStyle) => {
    if (!editor) return
    if (style === 'normal') {
      editor.chain().focus().setParagraph().run()
      return
    }
    const level = Number(style.replace('h', '')) as 1 | 2 | 3
    editor.chain().focus().toggleHeading({ level }).run()
  }

  const insertLink = () => {
    if (!editor) return
    const url = window.prompt('Enter link URL')
    if (!url) return
    const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    editor.chain().focus().insertContent(`[${selectedText || 'Link text'}](${url.trim()})`).run()
  }

  const insertTable = () => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent('| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |')
      .run()
  }

  const insertChecklist = () => {
    if (!editor) return
    editor.chain().focus().insertContent('<ul data-raven-checklist="true"><li>Checklist item</li></ul>').run()
  }

  if (!editor) {
    return <div className="compose-rich-editor-loading">Loading editor...</div>
  }

  return (
    <div className="compose-rich-editor-shell">
      <div className="compose-rich-editor-toolbar" aria-label="Advisory editor toolbar">
        <div className="compose-rich-toolbar-group" aria-label="History controls">
          <ToolbarButton label="Undo" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Redo" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={15} />
          </ToolbarButton>
        </div>

        <div className="compose-rich-toolbar-group" aria-label="Paragraph style controls">
          <select
            className="compose-rich-toolbar-select"
            value={blockStyle}
            onChange={(event) => applyBlockStyle(event.target.value as BlockStyle)}
            aria-label="Paragraph style"
          >
            <option value="normal">Normal</option>
            <option value="h1">H1</option>
            <option value="h2">H2</option>
            <option value="h3">H3</option>
          </select>
          <span className="compose-rich-toolbar-style-icon" aria-hidden="true">
            {blockStyle === 'h1' ? <Heading1 size={15} /> : blockStyle === 'h2' ? <Heading2 size={15} /> : blockStyle === 'h3' ? <Heading3 size={15} /> : <Pilcrow size={15} />}
          </span>
        </div>

        <div className="compose-rich-toolbar-group" aria-label="Text formatting controls">
          <ToolbarButton active={editor.isActive('bold')} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('italic')} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('underline')} label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('strike')} label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={15} />
          </ToolbarButton>
          <ToolbarButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
            <Eraser size={15} />
          </ToolbarButton>
        </div>

        <div className="compose-rich-toolbar-group" aria-label="List and indentation controls">
          <ToolbarButton active={editor.isActive('bulletList')} label="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('orderedList')} label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={15} />
          </ToolbarButton>
          <ToolbarButton label="Checklist" onClick={insertChecklist}>
            <CheckSquare size={15} />
          </ToolbarButton>
          <ToolbarButton label="Indent" disabled={!editor.can().sinkListItem('listItem')} onClick={() => editor.chain().focus().sinkListItem('listItem').run()}>
            <Outdent size={15} className="compose-rich-indent-icon" />
          </ToolbarButton>
          <ToolbarButton label="Outdent" disabled={!editor.can().liftListItem('listItem')} onClick={() => editor.chain().focus().liftListItem('listItem').run()}>
            <Outdent size={15} />
          </ToolbarButton>
        </div>

        <div className="compose-rich-toolbar-group" aria-label="Alignment controls">
          <ToolbarButton active={editor.isActive({ textAlign: 'left' })} label="Align left" onClick={() => editor.commands.setRavenTextAlign('left')}>
            <AlignLeft size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'center' })} label="Align center" onClick={() => editor.commands.setRavenTextAlign('center')}>
            <AlignCenter size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'right' })} label="Align right" onClick={() => editor.commands.setRavenTextAlign('right')}>
            <AlignRight size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: 'justify' })} label="Justify" onClick={() => editor.commands.setRavenTextAlign('justify')}>
            <AlignJustify size={15} />
          </ToolbarButton>
        </div>

        <div className="compose-rich-toolbar-group" aria-label="Insert controls">
          <ToolbarButton label="Link" onClick={insertLink}>
            <Link size={15} />
          </ToolbarButton>
          <ToolbarButton label="Table" onClick={insertTable}>
            <Table2 size={15} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('blockquote')} label="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={15} />
          </ToolbarButton>
          <ToolbarButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus size={15} />
          </ToolbarButton>
        </div>

        <div className="compose-rich-toolbar-group compose-rich-toolbar-group--view" aria-label="Editor view controls">
          <button
            type="button"
            className={`compose-rich-view-button${!previewMode ? ' is-active' : ''}`}
            onClick={() => setPreviewMode(false)}
            aria-pressed={!previewMode}
          >
            Edit
          </button>
          <button
            type="button"
            className={`compose-rich-view-button${previewMode ? ' is-active' : ''}`}
            onClick={() => setPreviewMode(true)}
            aria-pressed={previewMode}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="compose-rich-editor-frame">
        {previewMode ? (
          <div className="compose-rich-editor-preview" dangerouslySetInnerHTML={{ __html: editor.getHTML() }} />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      <div className="compose-editor-meta">
        <span>Changes auto-save and refresh the email preview.</span>
        <span>{saving ? 'Saving latest text...' : 'Text editor synced'}</span>
      </div>
    </div>
  )
}
