<script>
import Chrome from '@shell/components/Drawer/Chrome.vue';
import DrawerCard from '@shell/components/Drawer/DrawerCard.vue';
import Tabbed from '@shell/components/Tabbed';
import Tab from '@shell/components/Tabbed/Tab';
import Loading from '@shell/components/Loading';
import Banner from '@components/Banner/Banner.vue';
import SeverityIcon from './SeverityIcon.vue';
import { sumaGetErrataDetails } from '../shared/api';

/**
 * Slide-in drawer showing the details of a patch (errata), similar to the patch details page in MLM
 */
export default {
  name: 'PatchDetails',

  components: {
    Banner,
    Chrome,
    DrawerCard,
    Loading,
    SeverityIcon,
    Tab,
    Tabbed,
  },

  props: {
    // Patch row (SumaPatches resource) from the patches table
    patch: {
      type:     Object,
      required: true,
    },

    onClose: {
      type:    Function,
      default: () => {},
    },
  },

  async fetch() {
    const suseManagerId = this.patch.suma?.suseManagerId;

    if (!suseManagerId) {
      this.error = 'Unable to determine the SUSE Multi-Linux Manager for this patch';

      return;
    }

    try {
      this.errata = await sumaGetErrataDetails(this.$store, suseManagerId, this.patch.advisory_name);
    } catch (e) {
      this.error = e?.data?.message || e?.message || 'Unable to load the patch details from SUSE Multi-Linux Manager';
    }
  },

  data() {
    return {
      errata: undefined,
      error:  undefined,
    };
  },

  computed: {
    details() {
      return this.errata?.details || {};
    },

    sumaURL() {
      return this.patch.sumaURL;
    },

    summary() {
      return [
        { label: 'Issued', value: this.details.issue_date },
        { label: 'Status', value: this.details.advisory_status },
        { label: 'Updated', value: this.details.update_date },
        { label: 'From', value: this.details.errataFrom },
        { label: 'Reboot suggested', value: this.details.reboot_suggested ? 'Yes' : 'No' },
      ];
    },

    packages() {
      return [...(this.errata?.packages || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },

    systems() {
      return [...(this.errata?.systems || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },
  },

  methods: {
    packageName(pkg) {
      const epoch = pkg.epoch ? `${ pkg.epoch }:` : '';

      return `${ pkg.name }-${ epoch }${ pkg.version }-${ pkg.release }.${ pkg.arch_label }`;
    },

    mlmLink(path) {
      return this.sumaURL ? `${ this.sumaURL }${ path }` : undefined;
    },
  },
};
</script>

<template>
  <Chrome
    :aria-target="patch.advisory_name"
    :remove-footer="true"
    class="patch-details"
    @close="onClose"
  >
    <template #title>
      <SeverityIcon
        :severity="patch.severity"
        class="severity"
      />
      <span class="title-text">{{ patch.advisory_name }}</span>
      <a
        v-if="patch.sumaErrataUrl"
        class="open-suma"
        :href="patch.sumaErrataUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        SUSE Multi-Linux Manager
        <i class="icon icon-external-link" />
      </a>
    </template>
    <template #body>
      <Loading
        v-if="$fetchState.pending"
        mode="relative"
      />
      <Banner
        v-else-if="error"
        color="error"
        :label="error"
      />
      <Tabbed
        v-else
        :use-hash="false"
        :side-tabs="false"
      >
        <Tab
          name="details"
          label="Details"
          :weight="3"
        >
          <div class="cards">
            <DrawerCard>
              <h3>Synopsis</h3>
              <p class="synopsis">
                {{ details.synopsis || patch.synopsis }}
              </p>
              <dl class="summary">
                <template
                  v-for="item in summary"
                  :key="item.label"
                >
                  <dt>{{ item.label }}</dt>
                  <dd>{{ item.value || '-' }}</dd>
                </template>
              </dl>
            </DrawerCard>
            <DrawerCard>
              <h3>Topic</h3>
              <p class="text">
                {{ details.topic || '(none)' }}
              </p>
            </DrawerCard>
            <DrawerCard>
              <h3>Description</h3>
              <p class="text">
                {{ details.description || '(none)' }}
              </p>
            </DrawerCard>
            <DrawerCard>
              <h3>Solution</h3>
              <p class="text">
                {{ details.solution || '-' }}
              </p>
            </DrawerCard>
            <DrawerCard>
              <h3>Affected Channels</h3>
              <ul
                v-if="errata.channels.length"
                class="list"
              >
                <li
                  v-for="channel in errata.channels"
                  :key="channel.channel_id"
                >
                  <a
                    v-if="sumaURL"
                    :href="mlmLink(`/rhn/channels/ChannelDetail.do?cid=${ channel.channel_id }`)"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ channel.name || channel.label }}</a>
                  <template v-else>
                    {{ channel.name || channel.label }}
                  </template>
                </li>
              </ul>
              <p v-else>
                (none)
              </p>
            </DrawerCard>
            <DrawerCard>
              <h3>CVEs</h3>
              <ul
                v-if="errata.cves.length"
                class="list"
              >
                <li
                  v-for="cve in errata.cves"
                  :key="cve"
                >
                  <a
                    :href="`https://www.cve.org/CVERecord?id=${ encodeURIComponent(cve) }`"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ cve }}</a>
                </li>
              </ul>
              <p v-else>
                (none)
              </p>
            </DrawerCard>
            <DrawerCard v-if="details.references">
              <h3>References</h3>
              <p class="text">
                {{ details.references }}
              </p>
            </DrawerCard>
            <DrawerCard v-if="details.notes">
              <h3>Notes</h3>
              <p class="text">
                {{ details.notes }}
              </p>
            </DrawerCard>
          </div>
        </Tab>
        <Tab
          name="packages"
          :label="`Packages (${ packages.length })`"
          :weight="2"
        >
          <DrawerCard>
            <ul
              v-if="packages.length"
              class="list"
            >
              <li
                v-for="pkg in packages"
                :key="pkg.id"
              >
                <a
                  v-if="sumaURL"
                  :href="mlmLink(`/rhn/software/packages/Details.do?pid=${ pkg.id }`)"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ packageName(pkg) }}</a>
                <template v-else>
                  {{ packageName(pkg) }}
                </template>
              </li>
            </ul>
            <p v-else>
              (none)
            </p>
          </DrawerCard>
        </Tab>
        <Tab
          name="systems"
          :label="`Affected Systems (${ systems.length })`"
          :weight="1"
        >
          <DrawerCard>
            <ul
              v-if="systems.length"
              class="list"
            >
              <li
                v-for="system in systems"
                :key="system.id"
              >
                <a
                  v-if="sumaURL"
                  :href="mlmLink(`/rhn/systems/details/Overview.do?sid=${ system.id }`)"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ system.name }}</a>
                <template v-else>
                  {{ system.name }}
                </template>
              </li>
            </ul>
            <p v-else>
              (none)
            </p>
          </DrawerCard>
        </Tab>
      </Tabbed>
    </template>
  </Chrome>
</template>

<style lang="scss" scoped>
.patch-details {
  .severity {
    margin-right: 8px;
  }

  .title-text {
    flex: 1;
  }

  .open-suma {
    font-size: 14px;
    margin-right: 16px;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  h3 {
    margin-bottom: 12px;
  }

  .synopsis {
    margin-bottom: 12px;
  }

  .summary {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0;

    dt {
      font-weight: bold;
    }

    dd {
      margin: 0;
    }
  }

  .text {
    white-space: pre-wrap;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;

    li + li {
      margin-top: 4px;
    }
  }
}
</style>
