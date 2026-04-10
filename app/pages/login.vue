<script setup lang="ts">
const route = useRoute()

await navigateTo(createWorkbenchLocation('login', {
  next: typeof route.query.next === 'string' ? route.query.next : null
}), { replace: true })
</script>

<template>
  <div />
</template>
