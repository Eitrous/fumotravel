<script setup lang="ts">
const route = useRoute()

await navigateTo(createWorkbenchLocation('onboarding', {
  next: typeof route.query.next === 'string' ? route.query.next : null
}), { replace: true })
</script>

<template>
  <div />
</template>
