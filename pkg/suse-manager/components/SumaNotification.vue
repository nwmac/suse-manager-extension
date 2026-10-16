<script>
import { mapGetters } from 'vuex';
import { Banner } from '@components/Banner';
import { allHash } from '@shell/utils/promise';
import { CAPI, MANAGEMENT } from '@shell/config/types';
import { formatActionLine } from '../shared/utils';

export default {
  name:       'SumaNotification',
  components: { Banner },

  // The extension panel host (ExtensionPanel) passes the current detail
  // resource down as `resource` — this is the cluster, node, or machine
  // whose detail page is being viewed.
  props: {
    resource: {
      type:    Object,
      default: () => ({}),
    },
  },

  data() {
    return {
      poolingInterval: null,
      // Action id → { action_type, profile_name, name } snapshot for every action
      // observed in-progress during the current session. Retained so we can
      // format the outcome message after the batch drains, then cleared.
      sessionActions: {},
      // Ids of actions that were already in-progress the first time the watcher
      // fired for this panel instance. Excluded from sessionActions so the
      // outcome message only counts actions the user initiated from this page —
      // not stale in-progress work from a previous session/tab/user.
      baselineActionIds: null,
      // The last non-empty relevantActions we saw. Held on-screen while we
      // wait for SUMA to surface completed / failed outcomes so the panel
      // doesn't blink to empty between the in-progress banner disappearing
      // and the outcome banner appearing.
      lastActionsSnapshot: [],
      // True from the moment relevantActions drains to empty until we've
      // either received an outcome from summarizePatchOutcomes or given up.
      pendingOutcome: false,
    };
  },

  computed: {
    ...mapGetters('suma', ['getSumaActionsInProgress', 'getNotifications']),

    /**
     * Events in progress that relate to the currently displayed resource.
     * For a cluster: every event in the SUMA group backing that cluster.
     * For a node or machine: only events whose sid matches the SUMA system
     * that maps to this node/machine.
     */
    relevantActions() {
      const events = this.getSumaActionsInProgress || [];

      if (!events.length) {
        return [];
      }

      const type = this.resource?.type;

      // On a cluster detail page, show everything for the group backing this cluster
      if (type === CAPI.RANCHER_CLUSTER) {
        const groupSystems = this.$store.getters['suma/getSystemGroup'](this.suseManagerLink) || [];
        const sids = new Set(groupSystems.map((s) => s.id));

        return events.filter((ev) => sids.has(ev.sid));
      }

      // On a node/machine detail page, narrow to the matching SUMA system
      const targetSid = this.currentSystemId;

      if (targetSid) {
        return events.filter((ev) => ev.sid === targetSid);
      }

      return [];
    },

    /**
     * What the in-progress banner should render. Falls back to the last
     * captured snapshot while we're waiting for the outcome (pendingOutcome),
     * so the banner doesn't blink off between "finished" and "outcome known".
     */
    displayActions() {
      if (this.relevantActions.length) {
        return this.relevantActions;
      }

      if (this.pendingOutcome) {
        return this.lastActionsSnapshot;
      }

      return [];
    },

    /**
     * The MLM group link (`mlm-name/group-name`) for the cluster this resource
     * belongs to. Established by the SumaPanel component's fetch — we just read it
     * out of the store's clusterInstanceMap here.
     */
    suseManagerLink() {
      const type = this.resource?.type;

      if (type === CAPI.RANCHER_CLUSTER) {
        const clusterName = this.resource?.status?.clusterName;

        return clusterName ? this.$store.getters['suma/getSumaInstanceForCluster'](clusterName) : '';
      }

      if (type === MANAGEMENT.NODE) {
        const mgmtClusterId = this.resource?.mgmtClusterId;

        return mgmtClusterId ? this.$store.getters['suma/getSumaInstanceForCluster'](mgmtClusterId) : '';
      }

      if (type === CAPI.MACHINE) {
        // For a machine, spec.clusterName is the prov cluster name (not the mgmt cluster id
        // that clusterInstanceMap is keyed by). Resolve the prov cluster synchronously from
        // the store (SumaPanel has already dispatched a find for it) and use its
        // status.clusterName — the mgmt cluster id.
        const clusterName = this.resource?.spec?.clusterName;
        const ns = this.resource?.metadata?.namespace;

        if (!clusterName || !ns) {
          return '';
        }

        const provCluster = this.$store.getters['management/byId'](CAPI.RANCHER_CLUSTER, `${ ns }/${ clusterName }`);
        const mgmtClusterId = provCluster?.status?.clusterName;

        return mgmtClusterId ? this.$store.getters['suma/getSumaInstanceForCluster'](mgmtClusterId) : '';
      }

      return '';
    },

    /**
     * The SUMA system id backing this node or machine (undefined for cluster views).
     */
    currentSystemId() {
      const type = this.resource?.type;

      if (type !== MANAGEMENT.NODE && type !== CAPI.MACHINE) {
        return undefined;
      }

      const groupSystems = this.$store.getters['suma/getSystemGroup'](this.suseManagerLink) || [];
      const match = groupSystems.find((s) => {
        let nodeIP = this.resource?.internalIp;

        if (!nodeIP && this.resource?.status?.addresses) {
          nodeIP = this.resource.status.addresses.find((a) => a.type === 'InternalIP')?.address;
        }

        return s?.network?.ip && s.network.ip === nodeIP;
      });

      return match?.id;
    },
  },

  methods: {
    formatActionLine,

    /**
     * Called when the in-progress list drains to empty. Holds the banner up
     * via pendingOutcome, retries summarizePatchOutcomes until SUMA has the
     * terminal state (or we give up), then refreshes the systems list so
     * newly-applied patches drop out of the upgradable list.
     */
    async finalizeSession() {
      const actions = this.sessionActions;

      this.sessionActions = {};
      this.pendingOutcome = true;

      // Poll for the outcome. SUMA typically needs a beat to move actions
      // from the in-progress bucket into completed / failed.
      const MAX_ATTEMPTS = 6;

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 500 : 2000));

        const reported = await this.$store.dispatch('suma/summarizePatchOutcomes', {
          store:           this.$store,
          suseManagerLink: this.suseManagerLink,
          actions,
        });

        if (reported) {
          break;
        }
      }

      this.pendingOutcome = false;
      this.baselineActionIds = null;

      // Refresh the systems list so applied patches drop out of the upgradable
      // count. SUMA's /system/getRelevantErrata is not updated until the target
      // system checks back in with the new package state, which can take from
      // a few seconds to ~a minute after the action completes. Snapshot the
      // total upgradable count now, then poll with backoff and stop as soon as
      // the count actually changes so we don't spin forever.
      const clusterName = this.suseManagerLink.split('/')[1];
      const baseline = this.totalUpgradablePatchCount();
      const delays = [0, 5000, 10000, 20000, 30000, 60000];

      for (const delay of delays) {
        if (delay) {
          await new Promise((r) => setTimeout(r, delay));
        }

        if (this._destroyed) {
          return;
        }

        await this.$store.dispatch('suma/fetchSumaSystemsList', {
          store:           this.$store,
          suseManagerLink: this.suseManagerLink,
          clusterName,
        });

        if (this.totalUpgradablePatchCount() !== baseline) {
          return;
        }
      }
    },

    /**
     * Sum of listLatestUpgradablePackages across every system in the group
     * backing this cluster. Used as a change-detection signal after a patch
     * action so we can stop polling SUMA once the count actually moves.
     */
    totalUpgradablePatchCount() {
      const systems = this.$store.getters['suma/getSystemGroup'](this.suseManagerLink) || [];

      return systems.reduce((sum, s) => sum + (s?.listLatestUpgradablePackages?.length || 0), 0);
    },

    async updateEventsInProgress() {
      const reqs = {};
      const seen = new Set();

      this.relevantActions.forEach((ev) => {
        const suseManagerId = ev.suseManagerId;
        const sid = ev.sid;

        if (!suseManagerId || !sid) {
          return;
        }

        const key = `${ suseManagerId }::${ sid }`;

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        reqs[key] = this.$store.dispatch('suma/updateSystemEventsList', {
          store:           this.$store,
          suseManagerLink: suseManagerId,
          sid,
        });
      });

      return await allHash(reqs);
    },
  },

  beforeDestroy() {
    this._destroyed = true;
    if (this.poolingInterval) {
      clearInterval(this.poolingInterval);
    }
  },

  watch: {
    relevantActions: {
      handler(neu, old) {
        const hasNew = neu && neu.length;
        const hadOld = old && old.length;

        // On the first watcher fire, remember any actions already in-progress —
        // they belong to some earlier session (previous nav, another tab, another
        // user) and would otherwise inflate this session's "N applied" outcome.
        if (this.baselineActionIds === null) {
          this.baselineActionIds = new Set(
            (neu || [])
              .map((ev) => (ev?.id !== undefined && ev?.id !== null ? String(ev.id) : null))
              .filter((id) => id !== null)
          );
        }

        // Accumulate a snapshot of every action seen in-progress during the
        // running session so we can format the outcome message once the
        // batch drains (SUMA's completed / failed action listings don't
        // include per-system fields like profile_name).
        (neu || []).forEach((ev) => {
          if (ev?.id !== undefined && ev?.id !== null) {
            const idStr = String(ev.id);

            if (this.baselineActionIds.has(idStr)) {
              return;
            }
            this.sessionActions[idStr] = {
              action_type:  ev.action_type,
              profile_name: ev.profile_name,
              name:         ev.name,
            };
          }
        });

        // Keep the last non-empty in-progress list around so we can keep
        // rendering it while we wait for the outcome after the drain.
        if (hasNew) {
          this.lastActionsSnapshot = neu.slice();
        }

        if (hasNew && !this.poolingInterval) {
          this.poolingInterval = setInterval(this.updateEventsInProgress, 5000);
        } else if (!hasNew && this.poolingInterval) {
          clearInterval(this.poolingInterval);
          this.poolingInterval = null;
        }

        // Session ended — no more in-progress actions. Kick off the finalize
        // flow which keeps the panel visible until we can report an outcome.
        // Skip when nothing was tracked in sessionActions (e.g. only baseline
        // actions drained), otherwise we'd poll SUMA for an outcome we have
        // no ids to match against.
        if (hadOld && !hasNew && this.suseManagerLink && Object.keys(this.sessionActions).length > 0) {
          this.finalizeSession();
        }
      },
      immediate: true
    },
  },
};
</script>

<template>
  <div>
    <Banner
      v-if="getNotifications && getNotifications.type"
      :color="getNotifications.type"
      class="msg-banner"
    >
      <p>{{ getNotifications.message }}</p>
    </Banner>
    <Banner
      v-else-if="displayActions.length"
      color="info"
      class="msg-banner"
    >
      <p class="msg-title">
        {{ t('suma.notification.title') + ':' }}
      </p>
      <p
        v-for="act in displayActions"
        :key="act.id"
      >
        {{ formatActionLine(act) }}
      </p>
    </Banner>
  </div>
</template>

<style lang="scss" scoped>
.msg-banner {
  .msg-title {
    margin-bottom: 10px;
  }
  &::v-deep div {
    display: block !important;
  }
}
</style>
