<script>
import { get } from '@shell/utils/object';

export default {
  props: {
    row: {
      type:     Object,
      required: true,
    },

    value: {
      type:     [Object, String],
      required: true
    },

    urlKey: {
      type:    Function,
      default: null,
    },

    labelKey: {
      type:    String,
      default: null,
    },

    loadingGetter: {
      type:    String,
      default: null,
    },
  },

  computed: {
    loading() {
      if (this.loadingGetter) {
        return this.$store.getters[this.loadingGetter](this.row.nameDisplay);
      }

      return false;
    },
    href() {
      if ( this.urlKey ) {
        return this.urlKey(this.row);
      }

      return this.value?.url;
    },

    label() {
      if ( this.labelKey ) {
        return get(this.row, this.labelKey);
      } else if ( typeof this.value === 'string' ) {
        return this.value;
      }

      return this.value?.text || this.href;
    },
  }
};
</script>

<template>
  <div class="link-text-icon">
    <i
      v-if="loading"
      class="loading-indicator icon-spinner"
    />
    <n-link
      v-else-if="href"
      :to="href"
    >
      <span>{{ label }}</span>
    </n-link>
    <span v-else>?</span>
  </div>
</template>
<style lang="scss" scoped>
.link-text-icon {
  display: flex;
  align-items: center;

  span {
    margin-right: 5px;
  }
}

.loading-indicator {
  animation-name: spin;
  animation-duration: 3000ms;
  animation-iteration-count: infinite;
  animation-timing-function: linear;

  @keyframes spin {
    from {
        transform:rotate(0deg);
    }
    to {
        transform:rotate(360deg);
    }
}
}
</style>
