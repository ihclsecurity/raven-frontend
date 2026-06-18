/**
 * Political Map Labels
 *
 * What this file does
 * -------------------
 * This file adds the political boundary labels and administrative names used by
 * the impact map renderer.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the label source data first, then the placement helpers if present. The
 * goal of the file is to keep boundary labels stable across map snapshots.
 *
 * When to change this file
 * ------------------------
 * Update this file when map labels, label styles, or boundary naming rules need
 * to change.
 *
 * What this file does not do
 * --------------------------
 * This file does not fetch map data or render the full image. It only adds the
 * label layer.
 */

import type maplibregl from 'maplibre-gl'

const POLITICAL_LABEL_SOURCE_ID = 'raven-political-labels'
const POLITICAL_LABEL_LAYER_ID = 'raven-political-labels'

type PoliticalMapLabelOptions = {
  dark?: boolean
}

const POLITICAL_LABELS = [
  {
    name: 'Pakistan Occupied Kashmir',
    coordinates: [73.42, 33.62] as [number, number],
  },
  {
    name: 'Pakistan Occupied Kashmir',
    coordinates: [74.55, 35.65] as [number, number],
  },
]

export function addPoliticalMapLabels(map: maplibregl.Map, options: PoliticalMapLabelOptions = {}): void {
  if (map.getLayer(POLITICAL_LABEL_LAYER_ID)) return

  if (!map.getSource(POLITICAL_LABEL_SOURCE_ID)) {
    map.addSource(POLITICAL_LABEL_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: POLITICAL_LABELS.map((label) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: label.coordinates,
          },
          properties: {
            name: label.name,
          },
        })),
      },
    })
  }

  const isDark = options.dark ?? true
  map.addLayer({
    id: POLITICAL_LABEL_LAYER_ID,
    type: 'symbol',
    source: POLITICAL_LABEL_SOURCE_ID,
    minzoom: 4.8,
    maxzoom: 8.4,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Semibold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4.8, 10.5, 7.5, 13.5],
      'text-anchor': 'center',
      'text-max-width': 11,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': isDark ? '#dbeafe' : '#0f172a',
      'text-halo-color': isDark ? '#05070b' : '#ffffff',
      'text-halo-width': 1.8,
      'text-halo-blur': 0.2,
    },
  })
}
