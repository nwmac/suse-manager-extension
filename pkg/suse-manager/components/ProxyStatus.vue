<script>
import { pingProxy, getProxyService } from '../shared/api';
import { isNewResource } from '../shared/utils';
import Banner from '@components/Banner/Banner.vue';

const PROXY_SERVICE_NAME = 'suse-manager-rancher-proxy';
const PROXY_SERVICE_NAMESPACE = 'suse-manager';

export default {
  name: 'SuseManagerProxyStatus',

  components: { Banner },

  props: {
  },

  data() {
    return {
      error: undefined,
      warning: undefined,
      suseManager: false,
      isCluster: true,
      checkTimer: undefined,
    };
  },

  async fetch() {
    // Try and check the status of the proxy, taking into account the user permissions
    // const schema = this.$store.getters[`${ inStore }/schemaFor`](this.resource);
    // this.repos = await this.$store.dispatch('management/findAll', { type: CATALOG.CLUSTER_REPO, opt: { force: true } });
    await this.check();
  },

  methods: {
    async check() {
      // Check to see if the service is available
      const service = await getProxyService(this.$store);

      if (service === false) {
        this.error = 'SUSE Manager Proxy is unavailable - please check the Helm Application installation';
        this.warning = undefined;
      } else {
        // Service is there, now check that we can ping it
        const ping = await pingProxy(this.$store);

        console.error('>>>>>>>>');
        console.error(ping);
        console.error(service);

        if (!ping) {
          const isNew = isNewResource(service);
  
          if (isNew) {
            this.error = undefined;
            this.warning = 'The SUSE Manager Proxy is not responding - it was recently installed, so it may still be starting up';
          } else {
            this.error = 'The SUSE Manager Proxy is not responding - please check the Helm Application installation';
            this.warning = undefined;
          }
        } else {
          this.error = undefined;
          this.warning = undefined;
        }
      }

      if (this.error || this.warning) {
        this.checkTimer = setTimeout(() => { this.check(); }, 5000)
      } else {
        // If things are okay, check less frequently
        this.checkTimer = setTimeout(() => { this.check(); }, 30000)
      }
    }
  },

  beforeDestroy() {
    clearTimeout(this.checkTimer);
  },

  computed: {
  }
};
</script>

<template>
  <div
    v-if="error || warning"
    class="proxy-status"
  >
    <Banner
      v-if="warning"
      color="warning"
    >
      {{ warning }}
    </Banner>
    <Banner
      v-if="error"
      color="error"
    >
      {{ error }}
    </Banner>
  </div>
</template>

<style lang="scss" scoped>
  .proxy-status {
    align-items: center;
    display: flex;
  }
</style>
