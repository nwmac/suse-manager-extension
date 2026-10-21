<script>
import PatchDetails from '../components/PatchDetails.vue';

/**
 * Patch name that opens the patch details in a slide-in drawer when clicked
 */
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
  },

  methods: {
    showDetails() {
      const onClose = () => this.$store.commit('slideInPanel/close');

      this.$store.commit('slideInPanel/open', {
        component:      PatchDetails,
        componentProps: {
          patch:              this.row,
          onClose,
          width:              '50%',
          showHeader:         false,
          // Ignore hash changes - the patch tables live on tabs that use the hash
          closeOnRouteChange: ['name', 'params', 'query'],
        },
      });
    },
  },
};
</script>

<template>
  <a
    href="#"
    @click.prevent.stop="showDetails"
  >{{ value }}</a>
</template>
