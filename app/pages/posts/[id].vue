<script setup lang="ts">
const route = useRoute()
const postId = Number(route.params.id)

await navigateTo(
  Number.isInteger(postId) && postId > 0
    ? createWorkbenchLocation('post', { postId })
    : createWorkbenchLocation('info'),
  { replace: true }
)
</script>

<template>
  <div />
</template>
