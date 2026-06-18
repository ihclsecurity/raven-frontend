/**
 * Feed Window Constants
 *
 * This file defines the shared time-window options used by the Datasurfr and
 * dashboard refresh workflows.
 *
 * It is responsible for:
 * - listing the supported feed windows
 * - exposing the default feed window used on first load
 * - keeping the allowed values in a quick lookup set
 *
 * What this file does not do:
 * - it does not persist the selected window
 * - it does not fetch feed data
 */
export const FEED_WINDOW_OPTIONS = [
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '6 hours', value: 360 },
  { label: '12 hours', value: 720 },
  { label: '24 hours', value: 1440 },
] as const

export const DEFAULT_FEED_WINDOW_MINUTES = 120

export const FEED_WINDOW_VALUES = new Set<number>(FEED_WINDOW_OPTIONS.map((option) => option.value))