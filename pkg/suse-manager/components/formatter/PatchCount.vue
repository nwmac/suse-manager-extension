<script>
import { groupPatches, sumaSystemForNode } from '../../shared/utils';
import SeverityIcon from '../SeverityIcon';

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

  components: {
    SeverityIcon,
  },

  computed: {
    loading() {
      if (this.loadingGetter) {
        return this.$store.getters[this.loadingGetter](this.row.nameDisplay);
      }

      return false;
    },

    href() {
      const detailLocation = this.row.detailLocation;

      return {
        ...detailLocation,
        hash: '#suma-patches',
      };
    },

    info() {
      if (this.row.mgmtClusterId) {
        const sumaInstanceId = this.$store.getters['suma/getSumaInstanceForCluster'](this.row.mgmtClusterId);
        const sumaSystems = this.$store.getters['suma/getSystemGroup'](sumaInstanceId);
        const sumaSystem = sumaSystemForNode(sumaSystems, this.row);

        if (!sumaSystem?.listLatestUpgradablePackages) {
          return {};
        }

        const total = `${ sumaSystem.listLatestUpgradablePackages.length }`;
        const summary = groupPatches(sumaSystem);
        let worst;

        if (summary.critical > 0) {
          worst = 'critical'
        } else if (summary.important > 0) {
          worst = 'important'
        } else if (summary.moderate > 0) {
          worst = 'moderate'
        } else if (summary.low > 0) {
          worst = 'low'
        } else {
          worst = 'bug';
        }

        return {
          total,
          worst
        }
      }

      return {};
    },
  }
};
</script>

<template>
  <div class="link-text-icon">
    <SeverityIcon
      v-if="info.worst"
      :severity="info.worst"
    />
    <router-link
      :to="href"
    >
      <span v-if="info.total">{{ info.total }}</span>
      <span v-else>--</span>
    </router-link>
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
