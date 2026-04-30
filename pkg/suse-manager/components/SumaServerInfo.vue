<script>
import { groupPatches, sumaSystemForNode } from '../shared/utils';
import Banner from '@components/Banner/Banner.vue';

export default {
  name: 'SumaServerInfo',

  components: { Banner },

  props: {
    node: {
      type:    Object,
      default: () => {}
    },

    system: {
      type:    Object,
      default: () => {}
    }    
  },

  data() {
    console.error(this.node);
    console.error(this.system);

    return {
      suseManager: false,
      isCluster: true,
      systemEvents: [],
    };
  },

  watch: {
    system(a, b) {
      console.error('SYSTEM Changed');
      console.error(a);
      console.error(b);
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

    summary() {
      if (this.suseManager && !this.isCluster) {
        const sumaSystems = this.$store.getters['suma/getSystemGroup'](this.suseManager);
        const sumaSystem = sumaSystemForNode(sumaSystems, this.resource);

        return groupPatches(sumaSystem).total;
      }

      return false;
    },

    systemObj() {
      if (this.system) {
        console.error('System', this.system);

        return this.system;
      }

      return false;
    },

    systemInfo() {
      if (!this.system) {
        return [];
      }

      console.error(this.system);
      
      return [
        {
          name: 'Hostname',
          value: this.system.hostname,
        },
        {
          name: 'IP Address',
          value: this.system.network?.ip
        },
        {
          name: 'IPv6 Address',
          value: this.system.network?.ip6
        },
        {
          name: 'Minion Id',
          value: this.system.minion_id,
        },
        {
          name: 'Virtualization',
          value: this.system.virtualization,
        },
        // {
        //   name: 'Virtualization Host',
        //   value: '',
        // },
        {
          name: 'UUID',
          value: this.system.machine_id,
        },
        {
          name: 'SUSE Manager System ID',
          value: this.system.id,
        },
        {
          name: 'System Name',
          value: this.system.clusterGroup,
        },
      ];
    }
  }
};
</script>

<template>
  <div class="suma-panel">
    <div v-if="systemObj">
      <div class="row">
        <div class="col span-6">
          <table class="info">
            <tr v-for="item in systemInfo" :key="item.name">
              <td>{{ item.name }}</td>
              <td>{{ item.value }}</td>
            </tr>
          </table>
        </div>
        <div class="col span-6">
          <div>Lock Status: {{ systemObj.lock_status }}</div>
          <div>Virtualization: {{ systemObj.virtualization }}</div>
          <div>Last Boot: {{ systemObj.last_boot }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .info {
    tr {
      > td {
        padding: 5px 0;
      }

      > td:first-child {
        padding-right: 20px;
        opacity: 0.7;
      }
    }
  }
</style>
