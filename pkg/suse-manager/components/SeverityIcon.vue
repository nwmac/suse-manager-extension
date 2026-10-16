<script>
export default {
  name: 'SeverityIcon',

  props: {
    severity: {
      type:    String,
      default: 'patch',
    },

    count: {
      type:     Number,
      required: false,
    },

    showLabel: {
      type:    Boolean,
      default: false,
    }
  },

  computed: {
    isEnhancement() {
      return this.severity === 'enhancement';
    },

    severityClass() {
      return `severity-${ this.severity }`;
    },

    hasCount() {
      return this.count >= 0;
    },

    label() {
      return this.severity ? `${ this.severity.substr(0, 1).toUpperCase() }${ this.severity.substr(1) }` : '';
    }
  }
};
</script>

<template>
  <div class="severity">
    <i
      v-if="isEnhancement"
      class="icon icon-circle-plus severity-icon"
      :class="severityClass"
    />
    <svg
      v-else
      class="severity-icon"
      :class="severityClass"
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
    ><path d="M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q97-30 162-118.5T718-480H480v-315l-240 90v207q0 7 2 18h238v316Z" /></svg>
    <div v-if="hasCount">{{ count }}</div>
    <div v-if="showLabel" class="severity-label">{{ label }}</div>
  </div>
</template>

<style lang="scss" scoped>
  .severity {
    align-items: center;
    display: flex;

    svg {
      margin-right: 2px;
    }

    .severity-label {
      margin-left: 4px;
    }

    i {
      margin-right: 2px;
    }
  }

  .severity-icon {
    width: 20px;
    height: 20px;

    // Security: reuse the "important" color the old critical/important
    // severities used — the theme has no dedicated severity var, so this
    // is the closest match.
    &.severity-security {
      fill: orange;
      color: orange;
    }

    &.severity-patch {
      fill: rgb(148, 148, 148);
      color: rgb(148, 148, 148);
    }

    // Enhancement uses the same grey as patch but with the circle-plus icon
    // font glyph rather than the shield SVG.
    &.severity-enhancement {
      color: rgb(148, 148, 148);
      font-size: 20px;
      line-height: 20px;
    }
  }
</style>
