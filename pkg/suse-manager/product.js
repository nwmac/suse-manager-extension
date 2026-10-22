import { STATE, NAME as NAME_COL, AGE } from '@shell/config/table-headers';

// We extend the cluster management product
export const CLUSTER_MGMT = 'manager';

export function init(plugin, store) {
  const {
    basicType,
    configureType,
    headers,
    mapGroup,
    weightType,
    virtualType,
  } = plugin.DSL(store, CLUSTER_MGMT);

  const SUMA_SERVER = 'susemanager.cattle.io.manager';
  const SUSE_MANAGER = 'susemanager';

  virtualType({
    labelKey:   'suma.label',
    name:       SUMA_SERVER,
    group:      'Root',
    namespaced: false,
    icon:       'globe',
    route:      {
      name: 'c-cluster-product-resource',
      path: '/c/:cluster/manager/resource',
      params: {
        resource: SUMA_SERVER,
        product:  'manager'
      },
      query: {
        skipList: 'true'
      }
    },
    exact:      true
  });

  basicType([
    SUMA_SERVER,
  ]);

  weightType(SUMA_SERVER, -1);

  // The list component renders its own masthead - only once the MLM server schema exists
  // (before the proxy is installed, it shows the install page instead)
  configureType(SUMA_SERVER, { showListMasthead: false });

  // headers(UI_PLUGIN, [
  //   STATE,
  //   NAME_COL,
  //   {
  //     name:     'version',
  //     label:    'Version',
  //     value:    'version',
  //     getValue: row => row.version
  //   },
  //   {
  //     name:     'cacheState',
  //     label:    'Cache State',
  //     value:    'status.cacheState',
  //     getValue: row => row.status?.cacheState
  //   },
  //   AGE,
  // ]);
}