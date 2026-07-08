<script>
import { CAPI, MANAGEMENT } from '@shell/config/types';
import { checkForSumaProxy, getSuseManagerConfig, sumaListRegistrations } from '../shared/api';
import { groupPatches, sumaSystemForNode } from '../shared/utils';
import Banner from '@components/Banner/Banner.vue';
import SeverityIcon from './SeverityIcon.vue';

const REGISTRATIONS_POLL_MS = 5000;

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
      suseManager:          false,
      isCluster:            true,
      isMachine:            false,
      suseManagerConfig:    false,
      registrations:        undefined,
      registrationsPollId:  null,
      lastRunningCount:     0,
    };
  },

  async fetch() {
    await this.loadSumaData();
  },

  beforeUnmount() {
    this.stopRegistrationsPoll();
  },

  watch: {
    // When the cluster's SUSE Manager link annotation is added/changed (e.g. after
    // linking via the ManageLinkDialog) reload so the panel updates without a page refresh.
    linkAnnotation() {
      this.loadSumaData();
    }
  },

  computed: {
    linkAnnotation() {
      return this.resource?.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION];
    },

    registrationsSummary() {
      return this.registrations?.summary;
    },

    activeRegistrationCount() {
      const s = this.registrationsSummary;

      return (s?.pending || 0) + (s?.running || 0);
    },

    recentRegistrationFailures() {
      return this.registrations?.items?.filter((i) => i.status === 'failed') || [];
    },

    url() {
      const base = this.suseManagerConfig?.spec?.url || '';

      console.error('URL');
      console.error(base);

      if (base && this.suseManager && !this.isCluster) {
        const sumaSystems = this.$store.getters['suma/getSystemGroup'](this.suseManager);
        const sumaSystem = sumaSystemForNode(sumaSystems, this.resource);

        console.error(sumaSystem);

        if (sumaSystem) {

          return `${base}/rhn/systems/details/Overview.do?sid=${ sumaSystem.id }`;
        };
      }

      return '';
    },

    sumaInfo() {
      if (!this.suseManager) {
        return false;
      }

      const p = this.suseManager.split('/');
      const base = this.suseManagerConfig?.spec?.url || '';
      const groupId = this.$store.getters['suma/getSystemGroupId'](this.suseManager);
      const groupUrl = base && groupId !== undefined ? `${ base }/rhn/groups/GroupDetail.do?sgid=${ groupId }` : '';

      return {
        id:    p[0],
        group: p[1],
        groupUrl,
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
  },

  methods: {
    async loadSumaData() {
      const hasProxy = await checkForSumaProxy(this.$store);

      if (!hasProxy) {
        return;
      }

      let cluster;
      let node;

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
        this.isMachine = false;
      } else if (this.resource?.type === CAPI.MACHINE) {
        const clusterName = this.resource.spec?.clusterName;

        if (clusterName) {
          const provCluster = await this.$store.dispatch('management/find', {
            type: CAPI.RANCHER_CLUSTER,
            id:   `${ this.resource.metadata.namespace }/${ clusterName }`,
            opt:  { watch: false }
          });

          cluster = provCluster;
          node = this.resource;
          this.isCluster = false;
          this.isMachine = true;
        }
      } else {
        cluster = this.resource;
        node = undefined;
        this.isCluster = true;
        this.isMachine = false;
      }

      if (!cluster) {
        return;
      }

      const suseManagerLink = cluster.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION];

      // Reset local state so an unlink (annotation removed) reactively hides the panel.
      this.suseManager = suseManagerLink || false;
      if (!suseManagerLink) {
        this.suseManagerConfig = false;
        this.stopRegistrationsPoll();
        this.registrations = undefined;

        return;
      }

      // Only the cluster-scoped panel needs to poll — machine/node views don't
      // display the group-wide banner.
      if (this.isCluster) {
        this.startRegistrationsPoll(suseManagerLink, cluster);
      } else {
        this.stopRegistrationsPoll();
      }

      getSuseManagerConfig(this.$store, suseManagerLink).then((s) => {
        this.suseManagerConfig = s;
      });

      await this.$store.dispatch('suma/updateClusterMap', {
        clusterId: cluster.status?.clusterName,
        sumaId:    suseManagerLink,
      });

      if (cluster.status?.clusterName) {
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
    },

    startRegistrationsPoll(suseManagerLink, cluster) {
      this.stopRegistrationsPoll();
      this.lastRunningCount = 0;
      this.pollRegistrations(suseManagerLink, cluster);
      this.registrationsPollId = setInterval(() => this.pollRegistrations(suseManagerLink, cluster), REGISTRATIONS_POLL_MS);
    },

    stopRegistrationsPoll() {
      if (this.registrationsPollId !== null) {
        clearInterval(this.registrationsPollId);
        this.registrationsPollId = null;
      }
    },

    async pollRegistrations(suseManagerLink, cluster) {
      const [suseManagerId, systemGroupName] = suseManagerLink.split('/');

      if (!suseManagerId || !systemGroupName) {
        return;
      }

      try {
        const data = await sumaListRegistrations(this.$store, suseManagerId, systemGroupName);
        const activeBefore = this.lastRunningCount;
        const activeNow = (data?.summary?.pending || 0) + (data?.summary?.running || 0);

        this.registrations = data;
        this.lastRunningCount = activeNow;

        // When registrations transition from "in flight" to "all done", refresh
        // the cached systems list so patches / group membership reflect the
        // newly-registered nodes without a page reload.
        if (activeBefore > 0 && activeNow === 0 && cluster?.status?.clusterName) {
          this.$store.dispatch('suma/fetchSumaSystemsList', {
            store:       this.$store,
            suseManagerLink,
            clusterName: cluster.status.clusterName,
            cluster,
          });
        }
      } catch (e) {
        // Poll is best-effort — swallow errors so a transient proxy blip
        // doesn't blow up the panel.
        console.error('[suma] pollRegistrations failed', e); // eslint-disable-line no-console
      }
    },
  }
};
</script>

<template>
  <div class="suma-panel" :class="{'border': !!sumaInfo}">
    <div
      class="suma-info"
      v-if="sumaInfo"
    >
      <img src="../suma_icon.png"/>
      <div class="info">
        <span v-if="isCluster">Machines in this cluster are managed by SUSE Multi-Linux Manager</span>
        <span v-else-if="isMachine">The Server for this machine is managed by SUSE Multi-Linux Manager</span>
        <span v-else>The Server for this node is managed by SUSE Multi-Linux Manager</span>
        <router-link
          :to="sumaInfo.link"
        >
        {{ sumaInfo.id }}
        </router-link>
        <span class="soft">
          (System Group:
          <a
            v-if="sumaInfo.groupUrl"
            :href="sumaInfo.groupUrl"
            target="_blank"
          >{{ sumaInfo.group }}</a>
          <template v-else>{{ sumaInfo.group }}</template>)
        </span>
      </div>
      <div v-if="url" class="open-suma">
        <a :href="url" target="_blank">
          SUSE Multi-Linux Manager
          <i class="icon icon-external-link" />
        </a>
      </div>
    </div>
    <Banner
      v-if="isCluster && activeRegistrationCount > 0"
      class="registration-banner"
      color="info"
    >
      <div class="registration-busy">
        <i class="icon icon-spinner icon-spin" />
        Registering {{ activeRegistrationCount }} {{ activeRegistrationCount === 1 ? 'node' : 'nodes' }} with SUSE Multi-Linux Manager
        <span v-if="registrationsSummary?.done">— {{ registrationsSummary.done }} done</span><span v-if="registrationsSummary?.failed">, {{ registrationsSummary.failed }} failed</span>
      </div>
    </Banner>
    <Banner
      v-else-if="isCluster && recentRegistrationFailures.length > 0"
      class="registration-banner"
      color="warning"
    >
      {{ recentRegistrationFailures.length }} recent node
      {{ recentRegistrationFailures.length === 1 ? 'registration' : 'registrations' }} failed.
      <span v-for="(f, i) in recentRegistrationFailures" :key="f.nodeId || i" class="failure-detail">
        {{ f.nodeName }}: {{ f.message }}<span v-if="i < recentRegistrationFailures.length - 1">;</span>
      </span>
    </Banner>
    <div
      class="suma-detail"
      v-if="total"
      >
        <svg class="severity-patches" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20"><path fill="currentColor" d="M10.5 8a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0m0 2a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0m-2.5.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1m4.5-.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0M10 12.5a.5.5 0 1 0 0-1a.5.5 0 0 0 0 1m-6.94 2.768a2.5 2.5 0 0 1 0-3.536l8.672-8.672a2.5 2.5 0 0 1 3.536 0l1.671 1.672a2.5 2.5 0 0 1 0 3.535L8.268 16.94a2.5 2.5 0 0 1-3.536 0zm.708-2.829a1.5 1.5 0 0 0 0 2.121l1.671 1.672a1.5 1.5 0 0 0 2.121 0L9.293 14.5L5.5 10.707zm10.025-2.44L10 6.208L6.207 10L10 13.793zm.707-.706l1.732-1.733a1.5 1.5 0 0 0 0-2.121l-1.671-1.672a1.5 1.5 0 0 0-2.122 0L10.707 5.5zm-3.793 6.621l1.025 1.025a2.5 2.5 0 0 0 3.536 0l1.671-1.671a2.5 2.5 0 0 0 0-3.536l-1.025-1.025l-.707.707l1.025 1.025a1.5 1.5 0 0 1 0 2.121l-1.672 1.672a1.5 1.5 0 0 1-2.121 0l-1.025-1.025zM8.586 4.793L7.56 3.768a1.5 1.5 0 0 0-2.121 0L3.767 5.439a1.5 1.5 0 0 0 0 2.122l1.026 1.025l-.707.707L3.06 8.268a2.5 2.5 0 0 1 0-3.536l1.672-1.671a2.5 2.5 0 0 1 3.535 0l1.026 1.025z"/></svg>
        <span>{{ total }} Patches available</span>
        <SeverityIcon
          severity="security"
          :count="summary.security"
          :show-label="true"
        />
        <SeverityIcon
          severity="patch"
          :count="summary.patch"
          :show-label="true"
        />
        <SeverityIcon
          severity="enhancement"
          :count="summary.enhancement"
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
  &.border {
    border: 1px solid var(--border);
    padding: 10px;
    margin-top: 20px;
    border-radius: var(--border-radius);
  }

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

  .registration-banner {
    margin-top: 10px;

    .registration-busy {
      align-items: center;
      display: flex;
      line-height: 1;
    }

    i.icon-spinner {
      margin-right: 6px;
    }

    .failure-detail {
      margin-right: 4px;
    }
  }

  .suma-info {
    align-items: center;
    display: flex;
    //display: none;

    > img {
      width: 24px;
      margin-right: 5px;
    }

    .soft {
      opacity: 0.7;
    }

    .info {
      flex: 1;
    }

    .open-suma {
      align-content: flex-end;
    }
  }
}
</style>
