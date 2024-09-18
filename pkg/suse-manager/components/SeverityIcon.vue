<script>
export default {
  name: 'SeverityIcon',

  props: {
    severity: {
      type:    String,
      default: 'bug',
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

  data() {
    return {
      suseManager: false,
      isCluster: true,
    };
  },

  computed: {
    isBug() {
      return this.severity === 'bug';
    },

    severityClass() {
      return `severity-${ this.severity}`;
    },

    hasCount() {
      return this.count >= 0;
    },

    label() {
      return this.severity ? `${this.severity.substr(0, 1).toUpperCase()}${this.severity.substr(1)}` : '';
    }
  }
};
</script>

<template>
  <div class="severity">
    <svg v-if="!isBug" class="severity-icon" :class="severityClass" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q97-30 162-118.5T718-480H480v-315l-240 90v207q0 7 2 18h238v316Z"/></svg>
    <svg v-else class="severity-icon" :class="severityClass" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e8eaed"><path d="M480-200q66 0 113-47t47-113v-160q0-66-47-113t-113-47q-66 0-113 47t-47 113v160q0 66 47 113t113 47Zm-80-120h160v-80H400v80Zm0-160h160v-80H400v80Zm80 40Zm0 320q-65 0-120.5-32T272-240H160v-80h84q-3-20-3.5-40t-.5-40h-80v-80h80q0-20 .5-40t3.5-40h-84v-80h112q14-23 31.5-43t40.5-35l-64-66 56-56 86 86q28-9 57-9t57 9l88-86 56 56-66 66q23 15 41.5 34.5T688-640h112v80h-84q3 20 3.5 40t.5 40h80v80h-80q0 20-.5 40t-3.5 40h84v80H688q-32 56-87.5 88T480-120Z"/></svg>
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
  }

  .severity-icon {
    &:not(.severity-bug) {
      width: 20px;
      height: 20px;
    }

    &.severity-critical {
      fill: red;
    }
    &.severity-important {
      fill: orange;
    }
    &.severity-moderate {
      fill: rgb(211, 168, 76);
    }
    &.severity-low {
      fill: rgb(148, 148, 148);
    }
    &.severity-bug {
      fill: rgb(148, 148, 148);
    }
  }
</style>
