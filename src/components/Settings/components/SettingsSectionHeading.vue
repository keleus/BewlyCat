<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  desc?: string
  icon?: string
  collapsible?: boolean
  warning?: boolean
  badge?: string
}>(), {
  collapsible: false,
})

const collapsed = defineModel<boolean>('collapsed', {
  default: false,
})
</script>

<template>
  <button
    v-if="collapsible"
    type="button"
    class="settings-section-heading settings-section-heading--button"
    :class="{ 'settings-section-heading--warning': warning }"
    :data-settings-title="title"
    :aria-expanded="!collapsed"
    @click="collapsed = !collapsed"
  >
    <span v-if="icon" class="settings-section-heading__icon" :class="icon" />
    <span class="settings-section-heading__content">
      <h2>
        {{ title }}
        <span v-if="badge" class="settings-risk-badge">{{ badge }}</span>
      </h2>
      <p v-if="desc" :class="{ warning }">{{ desc }}</p>
    </span>
    <i
      i-mingcute:down-line
      class="settings-section-heading__chevron"
      :class="{ collapsed }"
    />
  </button>
  <header
    v-else
    class="settings-section-heading"
    :class="{ 'settings-section-heading--warning': warning }"
    :data-settings-title="title"
  >
    <span v-if="icon" class="settings-section-heading__icon" :class="icon" />
    <span class="settings-section-heading__content">
      <h2>
        {{ title }}
        <span v-if="badge" class="settings-risk-badge">{{ badge }}</span>
      </h2>
      <p v-if="desc" :class="{ warning }">{{ desc }}</p>
    </span>
  </header>
</template>

<style lang="scss" scoped>
.settings-section-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding: 0 2px;
}

.settings-section-heading__icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  color: var(--bew-theme-color);
  font-size: 24px;
}

.settings-section-heading__content {
  min-width: 0;
}

.settings-section-heading--button {
  width: 100%;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-section-heading--warning {
  padding: 10px 12px;
  background: color-mix(in oklab, var(--bew-warning-color), transparent 88%);
  border: 1px solid color-mix(in oklab, var(--bew-warning-color), transparent 62%);
  border-radius: var(--bew-radius);

  .settings-section-heading__icon {
    color: var(--bew-warning-color);
  }
}

.settings-section-heading__chevron {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--bew-text-2);
  font-size: 22px;
  transition: transform 0.2s ease;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

h2 {
  color: var(--bew-text-1);
  font-size: 17px;
  font-weight: 600;
}

.settings-risk-badge {
  display: inline-flex;
  margin-left: 7px;
  padding: 2px 7px;
  color: color-mix(in oklab, var(--bew-warning-color), black 75%);
  vertical-align: middle;
  background: var(--bew-warning-color);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

p {
  margin-top: 3px;
  color: var(--bew-text-2);
  font-size: 14px;
  line-height: 1.5;
}

p.warning {
  color: var(--bew-text-2);
}
</style>
