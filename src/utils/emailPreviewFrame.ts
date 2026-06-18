/**
 * Email Preview Frame Helpers
 *
 * What this file does
 * -------------------
 * This file builds the outer HTML shell used when the advisory email preview
 * needs to be shown inside the browser.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the frame builder first, then any helper that injects content into the
 * frame. The file is small, but it controls the structure around the advisory
 * body.
 *
 * When to change this file
 * ------------------------
 * Update this file when the browser preview layout needs to match a new email
 * template shell.
 *
 * What this file does not do
 * --------------------------
 * This file does not render advisory content itself. It only wraps it.
 */

export function normalizeEmailPreviewFrame(frame: HTMLIFrameElement | null): void {
  if (!frame) return
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) return

  doc.documentElement.style.margin = '0'
  doc.documentElement.style.padding = '0'
  doc.documentElement.style.overflowX = 'auto'
  doc.documentElement.style.overflowY = 'auto'
  doc.body.style.margin = '0'
  doc.body.style.padding = '0'
  doc.body.style.overflowX = 'auto'
  doc.body.style.overflowY = 'auto'
  doc.body.style.width = '100%'
  doc.body.style.minWidth = '0'

  const shell = doc.body.querySelector('table[role="presentation"]') as HTMLElement | null
  if (shell) {
    shell.style.marginLeft = 'auto'
    shell.style.marginRight = 'auto'
  }

  win.scrollTo(0, 0)
  doc.documentElement.scrollLeft = 0
  doc.documentElement.scrollTop = 0
  doc.body.scrollLeft = 0
  doc.body.scrollTop = 0
}
