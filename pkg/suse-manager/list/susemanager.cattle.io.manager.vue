<script>
import ResourceTable from '@shell/components/ResourceTable';
import ResourceFetch from '@shell/mixins/resource-fetch';
import { CATALOG, SCHEMA } from '@shell/config/types';
import Banner from '@components/Banner/Banner.vue';
import Masthead from '@shell/components/ResourceList/Masthead';
import ProxyStatus from '../components/ProxyStatus.vue';
import { installHelmChart } from '../shared/utils';

// If we add the Helm chart, this is the name we will use
const HELM_REPOSITORY_NAME = 'suse-manager-proxy';

// Helm repository URL
const HELM_REPOSITORY_URL = 'https://nwmac.github.io/suse-manager-extension';

// Helm chart we will install from the repository
const HELM_CHART_NAME = 'suse-manager-proxy';

const SUMA_SERVER = 'susemanager.cattle.io.manager';

// Route name Rancher uses for any resource detail page.
const DETAIL_ROUTE_NAME = 'c-cluster-product-resource-namespace-id';

export default {
  components: {
    Banner,
    Masthead,
    ProxyStatus,
    ResourceTable,
  },
  mixins:     [ResourceFetch],
  props:      {
    // resource: {
    //   type:     String,
    //   required: true,
    // },

    // schema: {
    //   type:     Object,
    //   required: false,
    // },
  },
  data() {
    console.error('--------');

    console.error(this.$router);
    console.error(this.$route);

    return {
      haveSchema:   false,
      schema:       undefined,
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
    this.schema = schema;

    console.error(this.haveSchema);

    // If we do not have the schema, we are showing the install page, so do not show the masthead
    // this.showMasthead = !this.haveSchema;
    // console.log(this);
    // console.log(this.schema);
    // console.log(this.schema);

    // If we can not see the schema, then the proxy is either not installed or we don't have access

    // Fetch storage classes so we can determine if a PVC can be expanded
    // this.$store.dispatch(`${ inStore }/findAll`, { type:  });

    // if (this.$store.getters[`${ inStore }/canList`](CATALOG.APP)) {
    // }

    if (schema) {
      await this.$fetchType(this.resource);

      // If exactly one MLM server is configured and we arrived via the nav
      // (route meta.skipList set on the virtualType in product.js), skip the
      // list and drop the user straight into its detail page — one less
      // click. Any other entry point (the "back to list" link from the
      // detail masthead, direct URLs, etc.) doesn't set skipList, so the
      // list renders normally.
      if (this.$route.query?.skipList === 'true' && this.rows?.length === 1) {
        const row = this.rows[0];

        this.$router.replace({
          name:   DETAIL_ROUTE_NAME,
          params: {
            resource:  this.resource,
            namespace: row.metadata?.namespace,
            id:        row.metadata?.name,
          },
        });

        return;
      }
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

  // This is a hacky workaround
  typeDisplay() {
    const schema = this.$store.getters[`management/schemaFor`](this.resource);

    this.showMasthead = !!schema;

    return 'SUSE Multi-Linux Manager';
  },

  computed: {
    resourceSchema() {
      return this.$store.getters[`management/schemaFor`](this.resource);
    },

    allSchemas() {
      return this.$store.getters[`management/all`](SCHEMA);
    }
  },

  watch: {
    allSchemas(neu, old) {
      const n = neu?.find((s) => s.id === this.resource);

      if ((!this.haveSchema && n) || (this.haveSchema && !n)) {
        this.$router.replace({
          name: 'c-cluster-manager-suse-manager',
          path: '/c/:cluster/manager/suse-manager',
          params: {
            product: 'manager',
            cluster: '_',
          }
        });
      }
    }
  },

  methods: {
    async enable() {
      // TODO: Check permissions

      this.busy = true;
      this.error = '';

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
        console.error('Installing ...');

        const res = await installHelmChart(this.haveHelmRepo, this.versionInfo.chart, {});

        console.error(res);

        // this.busy = false;

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
    <div v-if="haveSchema">
      <ProxyStatus />
      <ResourceTable
        :loading="loading"
        :schema="schema"
        :rows="rows"
      />
  </div>
  <div v-else class="suma-install">
      <div class="suma-panel">
        <img src="../suma_icon.png" />
        <div>
          <div class="title">Rancher SUSE Multi-Linux Manager Integration</div>
        </div>
      </div>
      <div class="suma-panel-indent">
        <p>The Rancher SUSE Multi-Linux Manager Extension Proxy is not installed.</p>
        <p>This component is required in order for the UI to communicate with your SUSE Multi-Linux Manager instance(s).</p>
        <button
          class="btn role-primary"
          :disabled="busy"
          @click="enable()"
        >
          Install SUSE Multi-Linux Manager Extension Proxy
        </button>
        <div
          v-if="busy"
          class="suma-loading"
          >
          <i class="icon icon-spinner icon-spin" />
          Installing SUSE Multi-Linux Manager Extension Proxy ...
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
