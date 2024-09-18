<script>
import SeverityIcon from '../SeverityIcon.vue';

export default {
  components: { SeverityIcon },
  props: {
    row: {
      type:     Object,
      required: true,
    },

    value: {
      type:     [Object, String],
      required: true
    },
  },

  computed: {
    severity() {
      return this.value;
    }
  }
};
</script>

<template>
  <SeverityIcon :severity="severity" />
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
