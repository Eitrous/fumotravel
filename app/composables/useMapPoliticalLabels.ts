import type { Map as MapLibreMap } from 'maplibre-gl'

const TAIWAN_ISO_A2 = 'TW'
const TAIWAN_EXCLUDE_FILTER: unknown[] = ['!=', 'iso_a2', TAIWAN_ISO_A2]

export const TAIWAN_PROVINCE_LAYER_ID = 'fumo-political-taiwan-province-label'

type RawStyleLayer = {
  id: string
  type?: string
  source?: string
  'source-layer'?: string
  filter?: unknown
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
  minzoom?: number
  maxzoom?: number
}

const warnedMessages = new Set<string>()

const warnOnce = (code: string, message: string) => {
  if (warnedMessages.has(code)) {
    return
  }

  warnedMessages.add(code)
  console.warn(message)
}

const isArray = (value: unknown): value is unknown[] => {
  return Array.isArray(value)
}

const includesPlaceClass = (filter: unknown, className: string): boolean => {
  if (!isArray(filter)) {
    return false
  }

  const operator = filter[0]
  const key = filter[1]

  if (operator === '==' && key === 'class' && filter[2] === className) {
    return true
  }

  if ((operator === 'in' || operator === '!in') && key === 'class') {
    return filter.slice(2).includes(className)
  }

  for (const item of filter) {
    if (includesPlaceClass(item, className)) {
      return true
    }
  }

  return false
}

const hasTaiwanExcludeCondition = (filter: unknown): boolean => {
  if (!isArray(filter)) {
    return false
  }

  if (
    filter[0] === '!='
    && filter[1] === 'iso_a2'
    && filter[2] === TAIWAN_ISO_A2
  ) {
    return true
  }

  for (const item of filter) {
    if (hasTaiwanExcludeCondition(item)) {
      return true
    }
  }

  return false
}

const getStyleLayers = (map: MapLibreMap): RawStyleLayer[] => {
  const style = map.getStyle()
  if (!style?.layers) {
    return []
  }

  return style.layers as RawStyleLayer[]
}

const findCountryLabelLayers = (layers: RawStyleLayer[]) => {
  return layers.filter((layer) => {
    return layer.type === 'symbol'
      && layer['source-layer'] === 'place'
      && includesPlaceClass(layer.filter, 'country')
  })
}

const findStateLabelLayer = (layers: RawStyleLayer[]) => {
  return layers.find((layer) => {
    return layer.type === 'symbol'
      && layer['source-layer'] === 'place'
      && includesPlaceClass(layer.filter, 'state')
  })
}

const withTaiwanExcluded = (filter: unknown) => {
  if (hasTaiwanExcludeCondition(filter)) {
    return filter
  }

  if (!filter) {
    return ['all', ['==', 'class', 'country'], TAIWAN_EXCLUDE_FILTER]
  }

  return ['all', filter, TAIWAN_EXCLUDE_FILTER]
}

const applyCountryLayerFilters = (map: MapLibreMap, countryLayers: RawStyleLayer[]) => {
  for (const layer of countryLayers) {
    const currentFilter = map.getFilter(layer.id) ?? layer.filter
    const nextFilter = withTaiwanExcluded(currentFilter)

    if (nextFilter === currentFilter) {
      continue
    }

    try {
      map.setFilter(layer.id, nextFilter as any)
    } catch {
      warnOnce(
        `set-filter-${layer.id}`,
        `[map political labels] Failed to update country filter for layer: ${layer.id}`
      )
    }
  }
}

const createTaiwanProvinceLayer = (
  countryLayer: RawStyleLayer,
  stateLayer: RawStyleLayer | undefined,
  label: string
) => {
  const source = stateLayer?.source || countryLayer.source
  const sourceLayer = stateLayer?.['source-layer'] || countryLayer['source-layer']

  if (!source || !sourceLayer) {
    return null
  }

  const baseLayout = (stateLayer?.layout || countryLayer.layout || {}) as Record<string, unknown>
  const basePaint = (stateLayer?.paint || countryLayer.paint || {}) as Record<string, unknown>

  return {
    id: TAIWAN_PROVINCE_LAYER_ID,
    type: 'symbol',
    source,
    'source-layer': sourceLayer,
    minzoom: stateLayer?.minzoom ?? 5,
    maxzoom: stateLayer?.maxzoom ?? 10,
    filter: ['all', ['==', 'class', 'country'], ['==', 'iso_a2', TAIWAN_ISO_A2]],
    layout: {
      ...baseLayout,
      'text-field': label,
      'text-transform': 'none'
    },
    paint: {
      ...basePaint
    }
  }
}

export const updateTaiwanProvinceLabel = (map: MapLibreMap, label: string) => {
  if (!map.getLayer(TAIWAN_PROVINCE_LAYER_ID)) {
    return
  }

  try {
    map.setLayoutProperty(TAIWAN_PROVINCE_LAYER_ID, 'text-field', label)
    map.setLayoutProperty(TAIWAN_PROVINCE_LAYER_ID, 'text-transform', 'none')
  } catch {
    warnOnce('set-layout-taiwan-label', '[map political labels] Failed to update Taiwan province label text')
  }
}

export const applyTaiwanProvinceLabelPolicy = (map: MapLibreMap, label: string) => {
  const styleLayers = getStyleLayers(map)
  if (!styleLayers.length) {
    return
  }

  const countryLayers = findCountryLabelLayers(styleLayers)
  if (!countryLayers.length) {
    warnOnce('country-layers-missing', '[map political labels] Country label layers not found in current style')
    return
  }

  applyCountryLayerFilters(map, countryLayers)

  if (map.getLayer(TAIWAN_PROVINCE_LAYER_ID)) {
    updateTaiwanProvinceLabel(map, label)
    return
  }

  const stateLayer = findStateLabelLayer(styleLayers)
  const targetLayer = createTaiwanProvinceLayer(countryLayers[0], stateLayer, label)

  if (!targetLayer) {
    warnOnce('taiwan-layer-source-missing', '[map political labels] Cannot create Taiwan layer due to missing source metadata')
    return
  }

  const beforeId = stateLayer?.id

  try {
    if (beforeId && map.getLayer(beforeId)) {
      map.addLayer(targetLayer as any, beforeId)
    } else {
      map.addLayer(targetLayer as any)
    }
  } catch {
    warnOnce('add-layer-taiwan', '[map political labels] Failed to inject Taiwan province layer')
    return
  }

  updateTaiwanProvinceLabel(map, label)
}
