<script>
import ResourceTable from '@shell/components/ResourceTable';
import ResourceFetch from '@shell/mixins/resource-fetch';
import { CATALOG, POD, SCHEMA } from '@shell/config/types';
import Banner from '@components/Banner/Banner.vue';
import Masthead from '@shell/components/ResourceList/Masthead';
import ProxyStatus from '../components/ProxyStatus.vue';
import { installHelmChart } from '../shared/utils';
import { getProxyService, pingProxy } from '../shared/api';

// If we add the Helm chart, this is the name we will use
const HELM_REPOSITORY_NAME = 'suse-manager-proxy';

// Helm repository URL
const HELM_REPOSITORY_URL = 'https://nwmac.github.io/suse-manager-extension';

// Helm chart we will install from the repository
const HELM_CHART_NAME = 'suse-manager-proxy';

const SUMA_SERVER = 'susemanager.cattle.io.manager';

// How often we poll while waiting for each install step to complete
const POLL_INTERVAL = 2000;

// How long we wait for the Helm repository index to be downloaded
const REPO_TIMEOUT = 2 * 60 * 1000;

// How long we wait for the Helm install operation to complete (matches the install timeout)
const INSTALL_TIMEOUT = 10 * 60 * 1000;

// How long we wait for the proxy to respond once the chart has been installed
const PROXY_TIMEOUT = 3 * 60 * 1000;

// How long we wait for Rancher to pick up the schema for the MLM server CRD before reloading the page
const SCHEMA_TIMEOUT = 30 * 1000;

// Steps shown to the user while installing the proxy
const INSTALL_STEPS = [
  { id: 'repo', label: 'Adding the Helm repository' },
  { id: 'chart', label: 'Downloading the Helm repository index' },
  { id: 'install', label: 'Installing the Helm chart' },
  { id: 'proxy', label: 'Waiting for the proxy to start' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      // Install progress - map of step id to 'active' | 'done' | 'error'
      stepStatus:   {},
      // Extra detail shown against the active step
      stepDetail:   '',
      // Helm operation for the chart install (used to show the logs)
      operation:    undefined,
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

  computed: {
    installSteps() {
      return INSTALL_STEPS.map((step) => ({ ...step, status: this.stepStatus[step.id] }));
    },

    showSteps() {
      return Object.keys(this.stepStatus).length > 0;
    },

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

      // The proxy was installed or removed elsewhere - refresh to switch between the install page and the list.
      // While we are installing, enable() takes care of this once the install completes
      if (!this.busy && ((!this.haveSchema && n) || (this.haveSchema && !n))) {
        this.$fetch();
      }
    }
  },

  methods: {
    async enable() {
      this.busy = true;
      this.error = '';
      this.stepStatus = {};
      this.stepDetail = '';
      this.operation = undefined;

      try {
        const repo = await this.runStep('repo', () => this.ensureHelmRepo());
        const versionInfo = await this.runStep('chart', () => this.waitForChart(repo));

        await this.runStep('install', () => this.installChart(repo, versionInfo));
        await this.runStep('proxy', () => this.waitForProxy());

        // The chart installs the CRD for MLM servers - wait for its schema so the page switches to the list
        await this.waitForSchema();
        await this.$fetch();
      } catch (e) {
        this.error = e?.message || `${ e }`;
      } finally {
        this.busy = false;
      }
    },

    async runStep(id, fn) {
      this.stepStatus = { ...this.stepStatus, [id]: 'active' };
      this.stepDetail = '';

      try {
        const res = await fn();

        this.stepStatus = { ...this.stepStatus, [id]: 'done' };
        this.stepDetail = '';

        return res;
      } catch (e) {
        this.stepStatus = { ...this.stepStatus, [id]: 'error' };
        throw e;
      }
    },

    // Add the Helm repository, if it is not there
    async ensureHelmRepo() {
      if (this.haveHelmRepo) {
        return this.haveHelmRepo;
      }

      const repo = await this.$store.dispatch('management/create', {
        type:     CATALOG.CLUSTER_REPO,
        metadata: { name: HELM_REPOSITORY_NAME },
        spec:     { url: HELM_REPOSITORY_URL }
      });

      this.haveHelmRepo = await repo.save();

      return this.haveHelmRepo;
    },

    // Rancher needs to download the repository index before the chart can be found, so retry until it is there
    async waitForChart(repo) {
      const deadline = Date.now() + REPO_TIMEOUT;

      while (true) {
        try {
          return await this.$store.dispatch('management/request', {
            method: 'GET',
            url:    `${ repo.links.info }&chartName=${ HELM_CHART_NAME }`,
          });
        } catch (e) {
          if (Date.now() > deadline) {
            throw new Error(`Unable to locate the required Helm Chart '${ HELM_CHART_NAME }' in the Helm Repository '${ repo.metadata.name }'`);
          }

          this.stepDetail = 'Waiting for Rancher to download the repository index';
          await sleep(POLL_INTERVAL);
        }
      }
    },

    // Install the chart and wait for the Helm operation to complete
    async installChart(repo, versionInfo) {
      const res = await installHelmChart(repo, versionInfo.chart, {});
      const operationId = `${ res.operationNamespace }/${ res.operationName }`;
      const deadline = Date.now() + INSTALL_TIMEOUT;

      await repo.waitForOperation(operationId);

      this.operation = await this.$store.dispatch('management/find', {
        type: CATALOG.OPERATION,
        id:   operationId,
      });

      // The operation itself has no completion state - it records the pod that runs the Helm command.
      // Check that pod's phase, along with the status of the Helm release (the App) it creates
      const podNamespace = this.operation.status?.podNamespace;
      const podName = this.operation.status?.podName;
      // installHelmChart installs the release into the suse-manager namespace, named after the chart
      const appId = `suse-manager/${ versionInfo.chart.name }`;

      while (true) {
        const [pod, app] = await Promise.all([
          podName ? this.findOrUndefined(POD, `${ podNamespace }/${ podName }`) : undefined,
          this.findOrUndefined(CATALOG.APP, appId),
        ]);

        const phase = pod?.status?.phase;
        const releaseStatus = app?.spec?.info?.status;

        if (releaseStatus === 'deployed' || phase === 'Succeeded') {
          return this.operation;
        }

        if (releaseStatus === 'failed' || phase === 'Failed') {
          throw new Error('Installation of the Helm chart failed - see the logs for details');
        }

        if (Date.now() > deadline) {
          throw new Error('Timed out waiting for the Helm chart to install - see the logs for details');
        }

        this.stepDetail = releaseStatus ? `Helm release is ${ releaseStatus }` : (phase ? `Helm operation is ${ phase.toLowerCase() }` : '');
        await sleep(POLL_INTERVAL);
      }
    },

    async findOrUndefined(type, id) {
      try {
        return await this.$store.dispatch('management/find', {
          type,
          id,
          opt: { force: true, watch: false }
        });
      } catch (e) {
        return undefined;
      }
    },

    // Wait for the proxy service to exist and respond
    async waitForProxy() {
      const deadline = Date.now() + PROXY_TIMEOUT;

      while (true) {
        const service = await getProxyService(this.$store);

        if (service && await pingProxy(this.$store)) {
          return;
        }

        if (Date.now() > deadline) {
          throw new Error('The SUSE Multi-Linux Manager Extension Proxy was installed but is not responding - please check the suse-manager-rancher-proxy deployment in the suse-manager namespace');
        }

        this.stepDetail = service ? 'Waiting for the proxy to respond' : 'Waiting for the proxy service to be created';
        await sleep(POLL_INTERVAL);
      }
    },

    // Rancher pushes new schemas over its websocket, so wait for the MLM server schema to show up.
    // If it doesn't arrive, reload the page so the schemas are fetched again
    async waitForSchema() {
      const deadline = Date.now() + SCHEMA_TIMEOUT;

      while (!this.$store.getters['management/schemaFor'](this.resource)) {
        if (Date.now() > deadline) {
          window.location.reload();

          return;
        }

        await sleep(POLL_INTERVAL);
      }
    },

    showLogs() {
      this.operation?.openLogs();
    },
  }
};
</script>

<template>
  <div>
    <div v-if="haveSchema">
      <Masthead
        :resource="resource"
        :schema="schema"
      />
      <ProxyStatus />
      <ResourceTable
        :loading="loading"
        :schema="schema"
        :rows="rows"
        :table-views="true"
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
        <ul
          v-if="showSteps"
          class="suma-install-steps"
        >
          <li
            v-for="step in installSteps"
            :key="step.id"
            :class="step.status || 'pending'"
          >
            <i
              v-if="step.status === 'active'"
              class="icon icon-spinner icon-spin"
            />
            <i
              v-else-if="step.status === 'done'"
              class="icon icon-checkmark"
            />
            <i
              v-else-if="step.status === 'error'"
              class="icon icon-error"
            />
            <i
              v-else
              class="icon icon-dot-open"
            />
            <span>{{ step.label }}</span>
            <span
              v-if="step.status === 'active' && stepDetail"
              class="step-detail"
            >- {{ stepDetail }}</span>
            <a
              v-if="step.id === 'install' && operation && operation.links && operation.links.logs"
              href="#"
              class="step-logs"
              @click.prevent="showLogs"
            >View logs</a>
          </li>
        </ul>
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

  .suma-install-steps {
    list-style: none;
    margin: 20px 0;
    padding: 0;

    li {
      align-items: center;
      display: flex;
      margin: 8px 0;

      // Fixed square box with the glyph centred, so the spinner rotates in place
      > i {
        display: inline-block;
        flex-shrink: 0;
        height: 16px;
        line-height: 16px;
        margin-right: 8px;
        text-align: center;
        width: 16px;
      }

      &.pending {
        color: var(--disabled-text);
      }

      &.done > i {
        color: var(--success);
      }

      &.error > i {
        color: var(--error);
      }

      .step-detail {
        color: var(--muted);
        margin-left: 5px;
      }

      .step-logs {
        margin-left: 10px;
      }
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
