<script>
import ResourceTable from '@shell/components/ResourceTable';
import ResourceFetch from '@shell/mixins/resource-fetch';
import { CATALOG } from '@shell/config/types';
import Banner from '@components/Banner/Banner.vue';

// If we add the Helm chart, this is the name we will use
const HELM_REPOSITORY_NAME = 'suse-manager-proxy';

// Helm repository URL
const HELM_REPOSITORY_URL = 'https://charts.kubewarden.io';

// Helm chart we will install from the repository
const HELM_CHART_NAME = 'neil';

const SUMA_SERVER = 'susemanager.cattle.io.manager';

export default {
  components: {
    Banner,
    ResourceTable,
  },
  mixins:     [ResourceFetch],
  props:      {
    // resource: {
    //   type:     String,
    //   required: true,
    // },

    schema: {
      type:     Object,
      required: false,
    },
  },
  data() {
    return {
      haveSchema:   false,
      haveHelmRepo: false,
      repos:        [],
      versionInfo:  undefined,
      busy:         false,
      error:        '',
      resource:     SUMA_SERVER,

    };
  },

  async fetch() {
    const inStore = this.$store.getters['currentStore']();

    // TODO: This is there for testing
    const schema = this.$store.getters[`${ inStore }/schemaFor`](this.resource);
    // const schema = this.$store.getters[`${ inStore }/schemaFor`](this.resource);

    this.haveSchema = !!schema;

    console.error(this.haveSchema);

    // If we can not see the schema, then the proxy is either not installed or we don't have access

    // Fetch storage classes so we can determine if a PVC can be expanded
    // this.$store.dispatch(`${ inStore }/findAll`, { type:  });

    // if (this.$store.getters[`${ inStore }/canList`](CATALOG.APP)) {
    // }

    if (schema) {
      await this.$fetchType(this.resource);
    }

    // Check for the Helm Repository

    // return this.$store.getters['cluster/canList'](CATALOG.CLUSTER_REPO) &&
    // this.$store.getters['cluster/canList'](CATALOG.APP);

    // If the Schema is not there, then we either do not have access, or the 
    if (!this.haveSchema) {
      if (this.$store.getters['management/schemaFor'](CATALOG.CLUSTER_REPO)) {
        this.repos = await this.$store.dispatch('management/findAll', { type: CATALOG.CLUSTER_REPO, opt: { force: true } });
        this.haveHelmRepo = this.repos.find((r) => { return r.spec?.url === HELM_REPOSITORY_URL });
      }
    }
  },

  methods: {
    async enable() {
      // TODO: Check permissions

      this.busy = true;
      this.error = '';

      await new Promise(resolve => setTimeout(resolve, 5000));

      // Add the Helm repository, if it is not there
      if (!this.haveHelmRepo) {
        const data = {
          type: CATALOG.CLUSTER_REPO,
          metadata: {
            name: HELM_REPOSITORY_NAME,
          },
          spec: {
            url: HELM_REPOSITORY_URL
          }
        };

        // Create a model for the new repository and save it
        const repo = await this.$store.dispatch('management/create', data);

        this.haveHelmRepo = await repo.save();
      }

      console.log(this.haveHelmRepo);

      // Repository should have been created
      // Try and fetch the chart that we want to install from the newly added repository
      try {
        this.versionInfo = await this.$store.dispatch('management/request', {
          method: 'GET',
          url: `${this.haveHelmRepo.links.info}&chartName=${HELM_CHART_NAME}`,
        });

        console.log('OK');
        console.log(this.versionInfo);

        this.busy = false;

        // Got the chart version info for the chart
      } catch (e) {
        console.error('Could not get chart');
        console.log(e);

        this.error = `Unable to locate the required Helm Chart '${ HELM_CHART_NAME }' in the Helm Repository '${ this.haveHelmRepo.metadata.name }'`;
        this.busy = false;
      }
    }
  }
};
</script>

<template>
  <div>
    <ResourceTable
      v-if="haveSchema"
      :loading="loading"
      :schema="schema"
      :rows="rows"
    />
    <div v-else class="suma-install">
      <div class="suma-panel">
        <img src="../suma_icon.png" />
        <div>
          <div class="title">Rancher SUSE Manager Integration</div>
        </div>
      </div>
      <div class="suma-panel-indent">
        <p>The Rancher SUSE Manager Extension Proxy is not installed.</p>
        <p>This component is required in order for the UI to communicate with your SUSE Manager instance(s).</p>
        <button
          class="btn role-primary"
          :disabled="busy"
          @click="enable()"
        >
          Install SUSE Manager Extension Proxy
        </button>
        <div
          v-if="busy"
          class="suma-loading"
          >
          <i class="icon icon-spinner icon-spin" />
          Installing SUSE Manager Extension Proxy ...
          </div>
        <Banner
          v-if="error"
          color="error"
          >{{  error  }}
        </Banner>
      </div>
    </div>
  </div>
</template>
<style lang="scss" scoped>
  .suma-panel {
    align-items: center;
    display: flex;

    .title {
      margin: 20px 0;
      font-size: 24px;
      // height: 96px;
    }

    img {
      width: 96px;
    }
  }

  .suma-loading {
    align-items: center;
    display: flex;
    margin: 20px 0;

    > i {
      margin-right: 5px;
    }
  }

  .suma-panel-indent {
    margin-left: 96px;

    p {
      margin: 5px 0;
    }

    button {
      margin-top: 20px;
    }
  }
</style>
