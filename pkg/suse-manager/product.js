import { STATE, NAME as NAME_COL, AGE } from '@shell/config/table-headers';

export const CLUSTER_MGMT = 'manager';

export function init(plugin, store) {
  const {
    basicType,
    headers,
    mapGroup,
    weightType,
    virtualType,
  } = plugin.DSL(store, CLUSTER_MGMT);

  // const SUMA_SERVER = 'susemanager.cattle.io.manager';
  const SUSE_MANAGER = 'susemanager';

  // mapGroup('plugins', 'Extensions');

  virtualType({
    labelKey:   'suma.label',
    name:       SUSE_MANAGER,
    group:      'Root',
    namespaced: false,
    icon:       'globe',
    route:      {
      name: 'c-cluster-manager-suma',
      path: '/c/:cluster/manager/suma',
    },
    exact:      true
  });

  basicType([
    SUSE_MANAGER,
  ]);

  weightType(SUSE_MANAGER, -1);

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