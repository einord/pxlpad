<script setup lang="ts">
defineProps<{
  active?: boolean;
  small?: boolean;
  title?: string;
}>();

defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    type="button"
    class="pxl-btn"
    :class="{ active, 'pxl-btn-sm': small }"
    :title="title"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<style scoped>
.pxl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--ui-touch-min);
  min-height: var(--ui-touch-min);
  background: var(--ui-btn);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.pxl-btn:hover {
  background: var(--ui-btn-hover);
}

.pxl-btn.active {
  background: var(--ui-btn-active);
  border-color: var(--ui-accent);
  box-shadow: inset 0 0 0 1px var(--ui-accent);
}

.pxl-btn-sm {
  min-width: 36px;
  min-height: 36px;
  font-size: 14px;
  padding: 2px;
}
</style>
