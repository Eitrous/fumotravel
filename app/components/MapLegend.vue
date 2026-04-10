<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <aside class="map-legend">
    <strong>{{ t('legend.title') }}</strong>
    <p>{{ t('legend.description') }}</p>

    <ul>
      <li>
        <span class="legend-dot" />
        {{ t('legend.approvedPin') }}
      </li>
      <li>
        <span class="legend-thumb" />
        {{ t('legend.thumbnailMarker') }}
      </li>
      <li>
        <span class="legend-dot legend-dot--teal" />
        {{ t('legend.approximateMarker') }}
      </li>
    </ul>
  </aside>
</template>
