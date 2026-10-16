<script>
import { groupPatches, sumaSystemForNode } from '../shared/utils';
import SeverityIcon from '../components/SeverityIcon.vue';
import { MANAGEMENT, CAPI } from '@shell/config/types';

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

  async fetch() {
    let clusterID = this.row.mgmtClusterId;

    // If we have a cluster Name, we need to get the cluster ID for it
    if (!clusterID && this.row.spec?.clusterName) {
      const provCluster = await this.$store.dispatch('management/find', {
        type: CAPI.RANCHER_CLUSTER,
        id:   `fleet-default/${ this.row.spec.clusterName }`,
        opt:  { watch: false }
      });

      if (provCluster) {
        console.error(provCluster.mgmt);
        clusterID = provCluster.mgmt?.id;
      }
    }

    this.clusterID = clusterID;
  },

  data() {
    return {
      clusterID: null,
    };
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
      if (this.clusterID) {
        const sumaInstanceId = this.$store.getters['suma/getSumaInstanceForCluster'](this.clusterID);
        const sumaSystems = this.$store.getters['suma/getSystemGroup'](sumaInstanceId);
        const sumaSystem = sumaSystemForNode(sumaSystems, this.row);

        if (!Array.isArray(sumaSystem?.listLatestUpgradablePackages)) {
          return {};
        }

        const total = `${ sumaSystem.listLatestUpgradablePackages.length }`;
        const summary = groupPatches(sumaSystem);
        let worst;

        // MLM only reports three advisory categories; walk them in order of
        // importance and pick the first one that has any patches so the row
        // shows an icon representative of the worst outstanding update.
        if (summary.security > 0) {
          worst = 'security';
        } else if (summary.patch > 0) {
          worst = 'patch';
        } else {
          worst = 'enhancement';
        }

        return {
          total,
          hasTotal: true,
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
      <span v-if="info.hasTotal">{{ info.total }}</span>
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
