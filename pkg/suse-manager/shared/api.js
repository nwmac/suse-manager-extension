import { SERVICE } from '@shell/config/types';

const NAMESPACE = 'suse-manager';
const SERVICE_NAME = 'suse-manager-rancher-proxy';

function isError(obj) {
  return obj.type === 'Status';
}

export async function checkForSumaProxy(store) {
  // suse-manager-rancher-proxy
  try {
    const service = await store.dispatch('management/find', {
      type: SERVICE,
      id:   `${ NAMESPACE }/${ SERVICE_NAME }`,
      namespace: NAMESPACE
    });

    return service.kind === 'Service';
  } catch (err) {
    return false;
  }
}

async function proxyRequest(store, suseManagerLink, url, method = 'get', data) {
  console.log('>>')
  console.error(typeof(suseManagerLink));
  console.log(arguments);

  const p = suseManagerLink.split('/');
  const baseUrl = '/api/v1/namespaces/suse-manager/services/https:suse-manager-rancher-proxy:5443/proxy/'
  const proxyUrl = `${ baseUrl }rhn/manager/api${ url }`;

  const proxy = await store.dispatch(`management/request`, {
    url:     proxyUrl,
    method,
    data,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Suse-Manager-Target': p[0],
    },
    responseType: 'application/json',
    redirectUnauthorized: false
  }, { root: true });

  return proxy;
}

async function __proxyRequest(store, suseManagerLink, url) {
  const p = suseManagerLink.split('/');
  const baseUrl = '/api/v1/namespaces/suse-manager/services/https:suse-manager-rancher-proxy:5443/proxy/'
  const proxyUrl = `${ baseUrl }rhn/manager/api${ url }`;

  try {
    const proxy = await store.dispatch(`management/request`, {
      url:     proxyUrl,
      method:  'get',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Suse-Manager-Target': p[0],
      },
      responseType: 'application/json',
      redirectUnauthorized: false
    }, { root: true });

    return proxy;

  } catch(e) {
    console.log('An error occurred');
    return e;
  }
}

// /**
//  * SUMA login endpoint
//  * @param {object} store - Vue store object
//  * @param {object} credentials - login credentials
//  */
// export async function sumaLogin(store, credentials) {
//   const login = await store.dispatch(`management/request`, {
//     url:     '/rhn/manager/api/auth/login',
//     method:  'post',
//     headers: { 'Content-Type': 'application/json' },
//     data:    {
//       login:    credentials.login,
//       password: credentials.password
//     },
//     responseType: 'application/json'
//   }, { root: true });

//   if (login.status === 200 && login.data?.success) {
//     return true;
//   }

//   return false;
// }

/**
 * SUMA list all systemgroups
 * @param {object} store - Vue store object
 */
export async function sumaListAllGroups(store, suseManagerLink) {
// export async function sumaListAllGroups(store) {
  // const groups = await store.dispatch(`management/request`, {
  //   url:             '/rhn/manager/api/systemgroup/listAllGroups',
  //   responseType:    'application/json',
  //   withCredentials: true
  // }, { root: true });

  // return groups.data?.result || [];

  const groups = await proxyRequest(store, suseManagerLink, '/systemgroup/listAllGroups');

  if (isError(groups)) {
    return groups;
  }

  return groups.data?.result || [];
}

export async function sumaGetSystemsInSystemGroup(store, suseManagerID, groupName) {

  try {
  const sumaSystems = await sumaListGroupSystems(store, suseManagerID, groupName);

  if (isError(sumaSystems)) {
    return sumaSystems;
  }

  // Get the IP addresses for all of the SUMA Systems
  const ids = sumaSystems.map((system) => system.id);
  const networkInfos = await proxyRequest(store, suseManagerID, `/system/getNetworkForSystems?sids=${ ids.join(',') }`);
  const netData = networkInfos.data?.result || [];

  netData.forEach((data) => {
    const system = sumaSystems.find((s) => s.id = data.system_id);

    if (system) {
      system.network = data;
    }
  });

  return sumaSystems;

} catch (e) {
  console.error('ERROR');
}
}

/**
 * SUMA list all systems in a systemgroup
 * @param {object} store - Vue store object
 * @param {string} groupName - systemgroup name
 */
export async function sumaListGroupSystems(store, suseManagerID, groupName) {
  const groups = await proxyRequest(store, suseManagerID, `/systemgroup/listSystems?systemGroupName=${ groupName }`);

  return groups.data?.result || [];
}

/**
 * SUMA list of all patches available in a system (upgradable packages)
 * @param {object} store - Vue store object
 * @param {string, int} sid - system id
 */
export async function sumaListLatestUpgradablePackages(store, suseManagerID, sid) {
  const groups = await proxyRequest(store, suseManagerID, `/system/getRelevantErrata?sid=${ sid }`);

  return groups.data?.result || [];
}

/**
 * SUMA list of all event regarding a given system
 * @param {object} store - Vue store object
 * @param {string, int} sid - system id
 */
export async function sumaListSystemEvents(store, suseManagerID, sid) {
  const groups = await proxyRequest(store, suseManagerID, `/system/listSystemEvents?sid=${ sid }`);

  return groups.data?.result || [];
}

/**
 * SUMA apply selected OS patches (upgradable packages) to a given system
 * @param {object} store - Vue store object
 * @param {array} suseManagerID - suse manager id
 * @param {array} sid - array of system ids
 * @param {array} errataIds - array of patches (erratas) ids
 */
export async function sumaScheduleApplyErrata(store, suseManagerID, sids, errataIds) {
  const data = {
    sids,
    errataIds
  };

  console.error('>>>>>>>>');
  console.log(suseManagerID);
  console.log(sids);
  console.log(errataIds);

  const schedule = await proxyRequest(store, suseManagerID, '/system/scheduleApplyErrata', 'post', data);

  // Check the response, should contain a list of action ids that we can use to rack completion of patches

  const okay = schedule.status === 200 && schedule.data?.success;

  console.error(schedule);
  if (okay) {

    // show success notification
    store.dispatch('suma/updateNotifications', {
      type:    'success',
      message: 'OS Patches successfully scheduled. OS Patching will begin shortly.'
    });

    // prepare all requests for SUMA system IDs for updating events list
  //   const reqs = {};

  //   sids.forEach((sid) => {
  //     store.dispatch('suma/updateSystemEventsList', {
  //       store,
  //       sid
  //     });
  //   });

  //   // update list of suma actions in progress after a given timeout
  //   setTimeout(async() => {
  //     await allHash(reqs);
  //   }, 4000 );
  } else {
    const msg = schedule.data?.message;

    // show error notification
    store.dispatch('suma/updateNotifications', {
      type:    'error',
      message: `Something went wrong when applying OS patches. Please try again (${msg})`
    });
  }

  return schedule;
}
