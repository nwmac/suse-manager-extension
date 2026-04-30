import { STATE, NAME as NAME_COL, AGE } from '@shell/config/table-headers';

// We extend the cluster management product
export const CLUSTER_MGMT = 'manager';

export function init(plugin, store) {
  const {
    basicType,
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
      }
    },
    exact:      true
  });

  basicType([
    SUMA_SERVER,
  ]);

  weightType(SUMA_SERVER, -1);

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