<script>
import { CAPI, MANAGEMENT } from '@shell/config/types';
import { checkForSumaProxy } from '../shared/api';
import { groupPatches, sumaSystemForNode } from '../shared/utils';
import Banner from '@components/Banner/Banner.vue';
import SeverityIcon from './SeverityIcon.vue';

// Annotation on a provisioing cluster that indicates which SUSE Manager and system group
const SUSE_MANAGER_LINK_ANNOTATION = 'susemanager.cattle.io/link';

export default {
  name: 'SumaPanel',

  components: {
    Banner,
    SeverityIcon,
 },

  props: {
    resource: {
      type:    Object,
      default: () => {}
    }
  },

  data() {
    return {
      suseManager: false,
      isCluster: true
    };
  },

  async fetch() {
    const hasProxy = await checkForSumaProxy(this.$store);

    if (hasProxy) {
      // this is where we get vital information from (either cluster or node details depending on the view)
      // const currScreenValueProp = this.$parent?.$parent?.value;

      // If this is not a cluster, get the cluster
      var cluster;
      var node;

      if (this.resource?.type === MANAGEMENT.NODE) {
        const currNode = this.resource;
        const mgmtCluster = await this.$store.dispatch('management/find', {
          type: MANAGEMENT.CLUSTER,
          id:   currNode.mgmtClusterId,
          opt:  { watch: false }
        });

        const provCluster = await this.$store.dispatch('management/find', {
          type: CAPI.RANCHER_CLUSTER,
          id:   mgmtCluster.provClusterId,
          opt:  { watch: false }
        });

        cluster = provCluster;
        node = this.resource;
        this.isCluster = false;
      } else {
        cluster = this.resource;
        node = undefined;
        this.isCluster = true;
      }

      // this means we are on the cluster details view...
      if (cluster) {
        const suseManagerLink = cluster.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION];

        console.error(suseManagerLink);

        if (suseManagerLink) {
          this.suseManager = suseManagerLink;

          await this.$store.dispatch('suma/updateClusterMap', {
            clusterId: cluster.status?.clusterName,
            sumaId:    suseManagerLink,
          });

          if (cluster.status?.clusterName) {
            console.error('Fetching info ...')
            await this.$store.dispatch('suma/fetchSumaSystemsList', {
              store:       this.$store,
              suseManagerLink,
              clusterName: cluster.status?.clusterName,
              cluster,
              node
            });
          } else {
            console.error('we are missing the cluster name to get SUMA data', this.resource); // eslint-disable-line no-console
          }
        }
      }
    }
  },

  computed: {
    sumaInfo() {
      if (!this.suseManager) {
        return false;
      }

      const p = this.suseManager.split('/');

      return {
        id:    p[0],
        group: p[1],
        link:  {
          name:   'c-cluster-product-resource-namespace-id',
          params: {
            namespace: 'suse-manager',
            resource:  'susemanager.cattle.io.manager',
            id:        p[0]
          }
        }
      };
    },

    loading() {
      console.log('Loading');
      console.log(this.suseManager);
      if (this.suseManager && this.isCluster) {
        const loading = this.$store.getters['suma/getSystemGroupLoadingStatus'](this.suseManager);

        console.error('LOADING');
        console.error(loading);

        return loading;
      }

      return {
        loading: false,
        error:   undefined,
      };
    },

    total() {
      return this.summary?.total;
    },

    summary() {
      if (this.suseManager && !this.isCluster) {
        const sumaSystems = this.$store.getters['suma/getSystemGroup'](this.suseManager);
        const sumaSystem = sumaSystemForNode(sumaSystems, this.resource);

        return groupPatches(sumaSystem);
      }

      return undefined;
    }
  }
};
</script>

<template>
  <div class="suma-panel">
    <div
      class="suma-info"
      v-if="sumaInfo"
    >
      <img src="../suma_icon.png"/>
      <div>
        <span v-if="isCluster">Machines in this cluster are managed by SUSE Manager</span>
        <span v-else>The Server for this Node is managed by SUSE Manager</span>
        <router-link
          :to="sumaInfo.link"
        >
        {{ sumaInfo.id }}
        </router-link>
        <span class="soft">(System Group: {{ sumaInfo.group }})</span>
      </div>
    </div>
    <div
      class="suma-detail"
      v-if="total"
      >
        <svg class="severity-patches" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20"><path fill="currentColor" d="M10.5 8a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0m0 2a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0m-2.5.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1m4.5-.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0M10 12.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1m-6.94 2.768a2.5 2.5 0 0 1 0-3.536l8.672-8.672a2.5 2.5 0 0 1 3.536 0l1.671 1.672a2.5 2.5 0 0 1 0 3.535L8.268 16.94a2.5 2.5 0 0 1-3.536 0zm.708-2.829a1.5 1.5 0 0 0 0 2.121l1.671 1.672a1.5 1.5 0 0 0 2.121 0L9.293 14.5L5.5 10.707zm10.025-2.44L10 6.208L6.207 10L10 13.793zm.707-.706l1.732-1.733a1.5 1.5 0 0 0 0-2.121l-1.671-1.672a1.5 1.5 0 0 0-2.122 0L10.707 5.5zm-3.793 6.621l1.025 1.025a2.5 2.5 0 0 0 3.536 0l1.671-1.671a2.5 2.5 0 0 0 0-3.536l-1.025-1.025l-.707.707l1.025 1.025a1.5 1.5 0 0 1 0 2.121l-1.672 1.672a1.5 1.5 0 0 1-2.121 0l-1.025-1.025zM8.586 4.793L7.56 3.768a1.5 1.5 0 0 0-2.121 0L3.767 5.439a1.5 1.5 0 0 0 0 2.122l1.026 1.025l-.707.707L3.06 8.268a2.5 2.5 0 0 1 0-3.536l1.672-1.671a2.5 2.5 0 0 1 3.535 0l1.026 1.025z"/></svg>
        <span>{{ total }} Patches available</span>
        <SeverityIcon
          severity="critical"
          :count="summary.critical"
          :show-label="true"
        />
        <SeverityIcon
          severity="important"
          :count="summary.important"
          :show-label="true"
        />
        <SeverityIcon
          severity="moderate"
          :count="summary.moderate"
          :show-label="true"
        />
        <SeverityIcon
          severity="low"
          :count="summary.low"
          :show-label="true"
        />
        <SeverityIcon
          severity="bug"
          :count="summary.bug"
          :show-label="true"
        />
    </div>
    <div v-if="loading.error">
      <Banner color="error" :label="loading.error.error" />
  </div>
</div>
</template>

<style lang="scss" scoped>
.suma-panel {
  .suma-list {
    display: flex;
  }

  .severity-patches {
    width: 20px;
    height: 20px;
  }

  .suma-detail {
    margin-left: 29px;
    margin-top: 5px;
    display: flex;
    align-items: center;

    > div {
      margin-left: 8px;
    }
  }

  .suma-info {
    align-items: center;
    display: flex;
    border-top: 1px solid var(--border);
    padding-top: 10px;
    //display: none;

    > img {
      width: 24px;
      margin-right: 5px;
    }

    .soft {
      opacity: 0.7;
    }
  }
}
</style>
