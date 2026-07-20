/**
 * Email Preview Impact Map Helpers
 *
 * What this file does
 * -------------------
 * This file injects the impacted-property section into advisory email preview
 * HTML and returns a browser-safe fallback when rendering fails.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the placeholder constant first, then the error helper, and finally the
 * injection function. The injection path is the important part because it is
 * what swaps the property placeholder into the preview.
 *
 * When to change this file
 * ------------------------
 * Update this file when the preview placeholder or property-section layout
 * changes.
 *
 * What this file does not do
 * --------------------------
 * This file does not decide impact scope. It only inserts rendered property
 * HTML into the email.
 */

import { buildImpactMapImageHtml, IMPACT_MAP_EMAIL_MEDIA_WIDTH } from './impactMapEmailHtml'
import type { ImpactMapPayload } from './renderImpactMapImage'

// The placeholder keeps the preview HTML and the renderer decoupled. The
// browser only swaps in the impacted-property section when this marker is present.
export const IMPACT_MAP_PLACEHOLDER = '<!-- IMPACT_MAP_PLACEHOLDER -->'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function mapPreviewErrorHtml(message: string): string {
  return `
    <div style="font-family:Aptos,Arial,sans-serif;font-size:12px;line-height:1.45;color:#7f1d1d;background:#fef2f2;border:1px solid #fecaca;padding:12px 14px;text-align:left;">
      Impacted property preview could not be rendered.<br />
      ${escapeHtml(message)}
    </div>
  `
}

export async function injectBrowserImpactMapIntoEmailHtml(
  html: string,
  payload: ImpactMapPayload,
): Promise<string> {
  if (!html.includes(IMPACT_MAP_PLACEHOLDER)) {
    return html
  }

  return html.replace(
    IMPACT_MAP_PLACEHOLDER,
    buildImpactMapImageHtml('', IMPACT_MAP_EMAIL_MEDIA_WIDTH, payload.impacted_properties),
  )
}
