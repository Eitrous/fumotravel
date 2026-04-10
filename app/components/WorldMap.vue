<script setup lang="ts">
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import type { PublicMapCollection, PublicMapFeatureProperties } from '~~/shared/fumo'
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_STYLE_URL,
  MAP_DARK_STYLE_URL,
  MAP_DEFAULT_ZOOM,
  MAP_THUMBNAIL_ZOOM
} from '~~/shared/fumo'
import { applyTaiwanProvinceLabelPolicy } from '~~/app/composables/useMapPoliticalLabels'

const props = withDefaults(defineProps<{
  selectedPostId?: number | null
}>(), {
  selectedPostId: null
})

const emit = defineEmits<{
  'select-post': [postId: number]
}>()

const { t, locale } = useI18n()
const { isDark } = useTheme()
const config = useRuntimeConfig()
const mapEl = ref<HTMLDivElement | null>(null)
const mapRef = shallowRef<MapLibreMap | null>(null)
const taiwanProvinceLabel = computed(() => t('map.taiwanProvinceLabel'))
const collection = shallowRef<PublicMapCollection>({
  type: 'FeatureCollection',
  features: []
})

let maplibregl: typeof import('maplibre-gl') | null = null
const thumbnailMarkers = new Map<number, Marker>()

const shouldUseThumbnails = () => {
  return Boolean(mapRef.value && mapRef.value.getZoom() >= MAP_THUMBNAIL_ZOOM)
}

const normalizeProperties = (raw: Record<string, unknown>): PublicMapFeatureProperties => {
  return {
    id: Number(raw.id),
    title: String(raw.title || t('map.untitledPost')),
    placeName: raw.placeName ? String(raw.placeName) : null,
    username: String(raw.username || 'unknown'),
    thumbUrl: raw.thumbUrl ? String(raw.thumbUrl) : null,
    privacyMode: raw.privacyMode === 'approx' ? 'approx' : 'exact',
    capturedAt: raw.capturedAt ? String(raw.capturedAt) : null
  }
}

const emptyCollection: PublicMapCollection = {
  type: 'FeatureCollection',
  features: []
}

const fetchGeoJson = async () => {
  if (!mapRef.value) {
    return null
  }

  const bounds = mapRef.value.getBounds()
  return await $fetch<PublicMapCollection>('/api/map/posts', {
    query: {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
      zoom: mapRef.value.getZoom().toFixed(2)
    }
  })
}

const clearThumbnailMarkers = () => {
  thumbnailMarkers.forEach((marker) => marker.remove())
  thumbnailMarkers.clear()
}

const syncSelectionSource = () => {
  if (!mapRef.value) {
    return
  }

  const source = mapRef.value.getSource('selected-post') as GeoJSONSource | null
  if (!source) {
    return
  }

  const selectedFeature = collection.value.features.find((feature) => {
    return feature.properties?.id === props.selectedPostId
  })

  source.setData(selectedFeature
    ? {
        type: 'FeatureCollection',
        features: [selectedFeature]
      }
    : emptyCollection)

  thumbnailMarkers.forEach((marker, id) => {
    marker.getElement().classList.toggle('is-active', id === props.selectedPostId)
  })
}

const createThumbnailMarker = (
  map: MapLibreMap,
  coordinates: [number, number],
  featureProps: PublicMapFeatureProperties
) => {
  if (!maplibregl) {
    return null
  }

  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'map-thumb-marker'
  el.classList.toggle('is-active', featureProps.id === props.selectedPostId)

  if (featureProps.thumbUrl) {
    const image = document.createElement('img')
    image.src = featureProps.thumbUrl
    image.alt = featureProps.title
    el.append(image)
  } else {
    const fallback = document.createElement('span')
    fallback.textContent = 'Fumo'
    el.append(fallback)
  }

  el.addEventListener('click', () => {
    emit('select-post', featureProps.id)
  })

  const marker = new maplibregl.Marker({
    element: el,
    anchor: 'bottom'
  })

  marker.setLngLat(coordinates).addTo(map)
  thumbnailMarkers.set(featureProps.id, marker)
  return marker
}

const syncThumbnailMarkers = () => {
  if (!mapRef.value || !maplibregl) {
    return
  }

  if (!shouldUseThumbnails()) {
    clearThumbnailMarkers()
    syncSelectionSource()
    return
  }

  const renderedFeatures = mapRef.value.queryRenderedFeatures(undefined, {
    layers: ['unclustered-point']
  })

  const nextIds = new Set<number>()

  for (const feature of renderedFeatures) {
    if (feature.geometry.type !== 'Point' || !feature.properties) {
      continue
    }

    const featureProps = normalizeProperties(feature.properties)
    const coordinates = feature.geometry.coordinates as [number, number]
    nextIds.add(featureProps.id)

    const existingMarker = thumbnailMarkers.get(featureProps.id)
    if (!existingMarker) {
      createThumbnailMarker(mapRef.value, coordinates, featureProps)
      continue
    }

    existingMarker.setLngLat(coordinates)
    existingMarker.getElement().classList.toggle('is-active', featureProps.id === props.selectedPostId)
  }

  thumbnailMarkers.forEach((marker, id) => {
    if (!nextIds.has(id)) {
      marker.remove()
      thumbnailMarkers.delete(id)
    }
  })
}

const refreshSource = async () => {
  if (!mapRef.value) {
    return
  }

  try {
    const geojson = await fetchGeoJson()
    const nextCollection = geojson || emptyCollection

    collection.value = nextCollection

    const source = mapRef.value.getSource('posts') as GeoJSONSource | null
    source?.setData(nextCollection)
    syncThumbnailMarkers()
    syncSelectionSource()
  } catch {
    // Keep map interactive even if a fetch attempt fails.
  }
}

const setupMapLayers = () => {
  if (!mapRef.value) return

  const sourceName = 'posts'

  if (mapRef.value.getSource(sourceName)) {
    return
  }

  mapRef.value.addSource(sourceName, {
    type: 'geojson',
    data: collection.value,
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 48
  })

  mapRef.value.addSource('selected-post', {
    type: 'geojson',
    data: emptyCollection
  })

  // Theme-aware colors
  const primaryColor = isDark.value ? '#ffffff' : '#000000'
  const contrastColor = isDark.value ? '#000000' : '#ffffff'

  mapRef.value.addLayer({
    id: 'clusters',
    type: 'circle',
    source: sourceName,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['step', ['get', 'point_count'], 18, 12, 22, 36, 28, 88, 34],
      'circle-color': primaryColor,
      'circle-stroke-width': 2,
      'circle-stroke-color': contrastColor
    }
  })

  mapRef.value.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: sourceName,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12
    },
    paint: {
      'text-color': contrastColor
    }
  })

  mapRef.value.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: sourceName,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 7,
      'circle-color': primaryColor,
      'circle-stroke-width': 2,
      'circle-stroke-color': contrastColor
    }
  })

  mapRef.value.addLayer({
    id: 'selected-post-ring',
    type: 'circle',
    source: 'selected-post',
    paint: {
      'circle-radius': 16,
      'circle-color': isDark.value ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
      'circle-stroke-width': 3,
      'circle-stroke-color': primaryColor
    }
  })

  mapRef.value.addLayer({
    id: 'selected-post-core',
    type: 'circle',
    source: 'selected-post',
    paint: {
      'circle-radius': 8,
      'circle-color': primaryColor,
      'circle-stroke-width': 2,
      'circle-stroke-color': contrastColor
    }
  })
}

const applyPoliticalLabels = () => {
  if (!mapRef.value || !mapRef.value.isStyleLoaded()) {
    return
  }

  applyTaiwanProvinceLabelPolicy(mapRef.value, taiwanProvinceLabel.value)
}

watch(isDark, (dark) => {
  if (!mapRef.value) return
  
  const style = dark ? MAP_DARK_STYLE_URL : (config.public.mapStyleUrl || MAP_DEFAULT_STYLE_URL)
  mapRef.value.setStyle(style)
  
  // setStyle removes all custom sources and layers, we must re-add them after the style is fully loaded
  mapRef.value.once('style.load', () => {
    applyPoliticalLabels()
    setupMapLayers()
    syncThumbnailMarkers()
    syncSelectionSource()
  })
})

onMounted(async () => {
  if (!mapEl.value) {
    return
  }

  maplibregl = await import('maplibre-gl')
  const style = isDark.value ? MAP_DARK_STYLE_URL : (config.public.mapStyleUrl || MAP_DEFAULT_STYLE_URL)

  mapRef.value = new maplibregl.Map({
    container: mapEl.value,
    style,
    center: MAP_DEFAULT_CENTER,
    zoom: MAP_DEFAULT_ZOOM
  })

  mapRef.value.on('load', async () => {
    const geojson = await fetchGeoJson()
    const nextCollection = geojson || emptyCollection
    collection.value = nextCollection

    applyPoliticalLabels()
    setupMapLayers()

    mapRef.value?.on('mouseenter', 'clusters', () => {
      mapRef.value?.getCanvas().style.setProperty('cursor', 'pointer')
    })

    mapRef.value?.on('mouseleave', 'clusters', () => {
      mapRef.value?.getCanvas().style.setProperty('cursor', '')
    })

    mapRef.value?.on('mouseenter', 'unclustered-point', () => {
      if (!shouldUseThumbnails()) {
        mapRef.value?.getCanvas().style.setProperty('cursor', 'pointer')
      }
    })

    mapRef.value?.on('mouseleave', 'unclustered-point', () => {
      mapRef.value?.getCanvas().style.setProperty('cursor', '')
    })

    mapRef.value?.on('click', 'clusters', async (event) => {
      const features = mapRef.value?.queryRenderedFeatures(event.point, {
        layers: ['clusters']
      })
      const cluster = features?.[0]
      const clusterId = cluster?.properties?.cluster_id

      if (
        clusterId == null
        || !mapRef.value
        || !cluster
        || cluster.geometry.type !== 'Point'
      ) {
        return
      }

      const source = mapRef.value.getSource('posts') as GeoJSONSource
      const zoom = await source.getClusterExpansionZoom(clusterId)
      const coordinates = (cluster.geometry as GeoJSON.Point).coordinates as [number, number]

      mapRef.value.easeTo({
        center: coordinates,
        zoom
      })
    })

    mapRef.value?.on('click', 'unclustered-point', (event) => {
      const feature = event.features?.[0]
      if (!feature?.properties) {
        return
      }

      const normalizedProps = normalizeProperties(feature.properties)
      emit('select-post', normalizedProps.id)
    })

    mapRef.value?.on('moveend', () => {
      void refreshSource()
    })

    syncThumbnailMarkers()
    syncSelectionSource()
  })
})

watch(
  () => props.selectedPostId,
  () => {
    syncSelectionSource()
  }
)

watch(
  () => locale.value,
  () => {
    applyPoliticalLabels()
    syncThumbnailMarkers()
    syncSelectionSource()
  }
)

onBeforeUnmount(() => {
  clearThumbnailMarkers()
  mapRef.value?.remove()
})
</script>

<template>
  <div class="map-stage">
    <div ref="mapEl" class="map-canvas" />
  </div>
</template>
