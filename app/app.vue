<script setup lang="ts">
const localeHead = useLocaleHead({
  addDirAttribute: true,
  addSeoAttributes: true
})

useHead(() => ({
  htmlAttrs: localeHead.value.htmlAttrs,
  link: localeHead.value.link,
  meta: localeHead.value.meta
}))
</script>

<template>
  <NuxtLayout>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </NuxtLayout>
</template>
