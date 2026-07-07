import JSZip from 'jszip';
import { SERVICE } from '@shell/config/types';
import { SUMA_SERVER_RESOURCE_NAME } from './definitions';

const NAMESPACE = 'suse-manager';
const SERVICE_NAME = 'suse-manager-rancher-proxy';

function isError(obj) {
  return obj.type === 'Status';
}

// Check there is a Service rather than an error status response
// export async function checkForSumaProxy(store) {
//   return getProxyService(store)?.kind === 'Service';
// }

export async function checkForSumaProxy(store) {
  // suse-manager-rancher-proxy
  try {
    const service = await store.dispatch('management/find', {
      type: SERVICE,
      id:   `${ NAMESPACE }/${ SERVICE_NAME }`,
      namespace: NAMESPACE
    });

    return service.kind === 'Service';;
  } catch (err) {
    return false;
  }
}

export async function getProxyService(store) {
  // suse-manager-rancher-proxy
  try {
    const service = await store.dispatch('management/find', {
      type: SERVICE,
      id:   `${ NAMESPACE }/${ SERVICE_NAME }`,
      namespace: NAMESPACE
    });

    return service;
  } catch (err) {
    return false;
  }
}

export async function getSuseManagerConfig(storeOrDispatch, id) {
  try {
    const dispatch = storeOrDispatch.dispatch ? storeOrDispatch.dispatch : storeOrDispatch;
    const server = id.split('/')[0];
    const service = await dispatch('management/find', {
      type: SUMA_SERVER_RESOURCE_NAME,
      id:   `${ NAMESPACE }/${ server }`,
      namespace: NAMESPACE
    });

    return service;
  } catch (err) {
    console.error('getSuseManagerConfig error', err);
    return false;
  }
}

export async function pingProxy(store) {
  try {
    const response = await proxyRequest(store, '', '/ping');

    return false;
  } catch (e) {
    console.log(e);
    console.log(e._status);

    return e._status === 403;
  }
}

async function proxyRequest(store, suseManagerLink, url, method = 'get', data) {
  const p = suseManagerLink.split('/');
  const baseUrl = '/api/v1/namespaces/suse-manager/services/https:suse-manager-rancher-proxy:5443/proxy/'
  const proxyUrl = `${ baseUrl }rhn/manager/api${ url }`;

  console.log('>>>>>>>>');
  console.log('Proxy Request ' + url);
  console.log(suseManagerLink);
  console.error(p);

  const proxy = await store.dispatch(`management/request`, {
    url:     proxyUrl,
    method,
    data,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Suse-Manager-Target': p[0],
    },
    responseType: 'json',
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
 * SUMA api.getVersion - returns the MLM API version string.
 * Used by "Test Connection" to verify the proxy can reach MLM, log in
 * with the configured credentials, and get a valid response back.
 * @param {object} store - Vue store object
 * @param {string} suseManagerID - SUSE Manager resource name
 */
export async function sumaGetVersion(store, suseManagerID) {
  const response = await proxyRequest(store, suseManagerID, '/api/getVersion');

  if (isError(response)) {
    throw new Error(response.message || 'Unable to reach SUSE Multi-Linux Manager');
  }

  return response.data?.result;
}

/**
 * SUMA api.systemVersion - returns the MLM server version string.
 * @param {object} store - Vue store object
 * @param {string} suseManagerID - SUSE Manager resource name
 */
export async function sumaGetSystemVersion(store, suseManagerID) {
  const response = await proxyRequest(store, suseManagerID, '/api/systemVersion');

  if (isError(response)) {
    throw new Error(response.message || 'Unable to reach SUSE Multi-Linux Manager');
  }

  return response.data?.result;
}

/**
 * SUMA system.listSystems - returns all systems visible to the configured user.
 * @param {object} store - Vue store object
 * @param {string} suseManagerID - SUSE Manager resource name
 */
export async function sumaListSystems(store, suseManagerID) {
  const response = await proxyRequest(store, suseManagerID, '/system/listSystems');

  if (isError(response)) {
    throw new Error(response.message || 'Unable to reach SUSE Multi-Linux Manager');
  }

  return response.data?.result || [];
}

/**
 * SUMA list all systemgroups
 * @param {object} store - Vue store object
 */
export async function sumaListAllGroups(store, suseManagerLink) {
  const groups = await proxyRequest(store, suseManagerLink, '/systemgroup/listAllGroups');

  if (isError(groups)) {
    return groups;
  }

  return groups.data?.result || [];
}

export async function sumaGetSystemsInSystemGroup(store, suseManagerID, groupName) {
    try {
      const sumaSystems = await sumaListGroupSystems(store, suseManagerID, groupName);

      console.error('sumaGetSystemsInSystemGroup', sumaSystems);

      if (isError(sumaSystems)) {
        return sumaSystems;
      }

      // Get the IP addresses for all of the SUMA Systems
      const ids = sumaSystems.map((system) => system.id);
      const networkInfos = await proxyRequest(store, suseManagerID, `/system/getNetworkForSystems?sids=${ ids.join(',') }`);
      const netData = networkInfos.data?.result || [];

      console.log(netData);

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
 * Fetch a CAPI machine's SSH bundle from Rancher and extract the SSH
 * connection info Rancher uses for the machine.
 *
 * Rancher exposes a `sshkeys` link on `cluster.x-k8s.io.machine` resources
 * provisioned via an rke-machine.cattle.io infrastructure ref. The link
 * returns a ZIP containing `<machineName>/id_rsa`, `<machineName>/id_rsa.pub`
 * and `<machineName>/config.json` (the latter holding IPAddress, IPv6Address,
 * SSHUser, SSHPort, MachineName). See rancher/rancher pkg/api/steve/machine.
 *
 * Returns `{ user, port, host, privateKey }` or throws if the link is missing
 * or the bundle is malformed.
 */
export async function fetchMachineSshConfig(machine) {
  const url = machine?.links?.sshkeys;

  console.log('[suma] fetchMachineSshConfig: machine=%s, sshkeys URL=%s', machine?.id, url);

  if (!url) {
    throw new Error('Machine has no sshkeys link (not provisioned via a Rancher node driver?)');
  }

  const res = await fetch(url, { credentials: 'include' });

  console.log('[suma] fetchMachineSshConfig: response status=%d %s', res.status, res.statusText);

  if (!res.ok) {
    throw new Error(`Failed to download SSH keys: ${ res.status } ${ res.statusText }`);
  }

  const zipData = await res.arrayBuffer();

  console.log('[suma] fetchMachineSshConfig: downloaded %d bytes', zipData.byteLength);

  const zip = await JSZip.loadAsync(zipData);

  const allEntries = [];
  let configEntry;
  let keyEntry;
  let pubKeyEntry;

  zip.forEach((path, entry) => {
    allEntries.push(path);

    const base = path.split('/').pop();

    if (base === 'config.json') {
      configEntry = entry;
    } else if (base === 'id_rsa') {
      keyEntry = entry;
    } else if (base === 'id_rsa.pub') {
      pubKeyEntry = entry;
    }
  });

  console.log('[suma] fetchMachineSshConfig: zip contents:', allEntries);

  if (!keyEntry) {
    throw new Error('SSH key bundle is missing id_rsa');
  }
  if (!configEntry) {
    throw new Error('SSH key bundle is missing config.json');
  }

  const [configText, privateKey, publicKey] = await Promise.all([
    configEntry.async('string'),
    keyEntry.async('string'),
    pubKeyEntry ? pubKeyEntry.async('string') : Promise.resolve(undefined),
  ]);

  console.log('[suma] fetchMachineSshConfig: config.json raw=', configText);

  const cfg = JSON.parse(configText);

  console.log('[suma] fetchMachineSshConfig: parsed config:', cfg);
  console.log('[suma] fetchMachineSshConfig: id_rsa.pub:', publicKey);
  console.log('[suma] fetchMachineSshConfig: id_rsa (private key, %d chars):\n%s', privateKey.length, privateKey);

  const result = {
    user:       cfg.SSHUser,
    port:       cfg.SSHPort || 22,
    host:       cfg.IPAddress,
    ipv6:       cfg.IPv6Address,
    name:       cfg.MachineName,
    privateKey,
  };

  console.log('[suma] fetchMachineSshConfig: returning:', { ...result, privateKey: `<${ privateKey.length } chars>` });

  return result;
}

/**
 * SUMA activationkey.listActivationKeys
 */
export async function sumaListActivationKeys(store, suseManagerID) {
  const response = await proxyRequest(store, suseManagerID, '/activationkey/listActivationKeys');

  if (isError(response)) {
    throw new Error(response.message || 'Unable to list activation keys');
  }

  return response.data?.result || [];
}

/**
 * SUMA system.bootstrap / system.bootstrapWithPrivateSshKey
 * Pass either sshPassword OR sshPrivKey (with optional sshPrivKeyPass).
 */
export async function sumaBootstrapSystem(store, suseManagerID, params) {
  const usePrivateKey = !!params.sshPrivKey;
  const endpoint = usePrivateKey ? '/system/bootstrapWithPrivateSshKey' : '/system/bootstrap';

  const body = {
    host:            params.host,
    sshPort:         params.sshPort ?? 22,
    sshUser:         params.sshUser,
    activationKey:   params.activationKey,
    reactivationKey: params.reactivationKey ?? '',
    saltSSH:         !!params.saltSSH,
  };

  if (typeof params.proxyId === 'number') {
    body.proxyId = params.proxyId;
  }

  if (usePrivateKey) {
    body.sshPrivKey = params.sshPrivKey;
    body.sshPrivKeyPass = params.sshPrivKeyPass ?? '';
  } else {
    body.sshPassword = params.sshPassword ?? '';
  }

  const safeBody = { ...body };

  if (safeBody.sshPrivKey) {
    safeBody.sshPrivKey = `<${ safeBody.sshPrivKey.length } chars>`;
  }
  if (safeBody.sshPassword) {
    safeBody.sshPassword = `<${ safeBody.sshPassword.length } chars>`;
  }
  if (safeBody.sshPrivKeyPass) {
    safeBody.sshPrivKeyPass = `<${ safeBody.sshPrivKeyPass.length } chars>`;
  }

  console.log('[suma] sumaBootstrapSystem: suseManagerID=%s endpoint=%s', suseManagerID, endpoint);
  console.log('[suma] sumaBootstrapSystem: request body:', safeBody);

  const response = await proxyRequest(store, suseManagerID, endpoint, 'post', body);

  console.log('[suma] sumaBootstrapSystem: response status=%d data=', response?.status, response?.data);

  if (isError(response)) {
    throw new Error(response.message || 'Bootstrap failed');
  }

  // SUMA returns 1 on success, but also bubble up any error message in the body
  if (response.data && response.data.success === false) {
    throw new Error(response.data.message || 'Bootstrap failed');
  }

  return response.data?.result;
}

/**
 * SUMA systemgroup.addOrRemoveSystems - add (or remove) systems to a group.
 */
export async function sumaAddOrRemoveSystemsInGroup(store, suseManagerID, systemGroupName, serverIds, add = true) {
  const body = {
    systemGroupName,
    serverIds,
    add,
  };

  const response = await proxyRequest(store, suseManagerID, '/systemgroup/addOrRemoveSystems', 'post', body);

  if (isError(response)) {
    throw new Error(response.message || 'Unable to update system group membership');
  }

  if (response.data && response.data.success === false) {
    throw new Error(response.data.message || 'Unable to update system group membership');
  }

  return response.data?.result;
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
 * SUMA system.getDetails - returns extended system detail struct
 */
export async function sumaGetSystemDetails(store, suseManagerID, sid) {
  const response = await proxyRequest(store, suseManagerID, `/system/getDetails?sid=${ sid }`);

  return response.data?.result || undefined;
}

/**
 * SUMA system.getRunningKernel - returns the kernel version currently running
 */
export async function sumaGetRunningKernel(store, suseManagerID, sid) {
  const response = await proxyRequest(store, suseManagerID, `/system/getRunningKernel?sid=${ sid }`);

  return response.data?.result || undefined;
}

/**
 * SUMA system.getInstalledProducts - list of products installed on the system
 */
export async function sumaGetInstalledProducts(store, suseManagerID, sid) {
  const response = await proxyRequest(store, suseManagerID, `/system/getInstalledProducts?sid=${ sid }`);

  return response.data?.result || [];
}

/**
 * SUMA system.getRegistrationDate - date the system was registered
 */
export async function sumaGetRegistrationDate(store, suseManagerID, sid) {
  const response = await proxyRequest(store, suseManagerID, `/system/getRegistrationDate?sid=${ sid }`);

  return response.data?.result || undefined;
}

/**
 * SUMA system.getSubscribedBaseChannel - base channel the system is subscribed to
 */
export async function sumaGetSubscribedBaseChannel(store, suseManagerID, sid) {
  const response = await proxyRequest(store, suseManagerID, `/system/getSubscribedBaseChannel?sid=${ sid }`);

  return response.data?.result || undefined;
}

/**
 * SUMA system.listSubscribedChildChannels - child channels the system is subscribed to
 */
export async function sumaListSubscribedChildChannels(store, suseManagerID, sid) {
  const response = await proxyRequest(store, suseManagerID, `/system/listSubscribedChildChannels?sid=${ sid }`);

  return response.data?.result || [];
}

/**
 * SUMA system.listSuggestedReboot - list of systems that suggest a reboot
 */
export async function sumaListSystemsRequiringReboot(store, suseManagerID) {
  const response = await proxyRequest(store, suseManagerID, '/system/listSuggestedReboot');

  return response.data?.result || [];
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
  // SUMA expects arrays of ints for sids and errataIds — coerce, because ids
  // can flow in as strings (e.g. from a Resource's metadata.name).
  const data = {
    sids:      (sids || []).map((s) => Number(s)),
    errataIds: (errataIds || []).map((e) => Number(e)),
  };

  let schedule;
  let okay = false;
  let errorMsg;

  try {
    schedule = await proxyRequest(store, suseManagerID, '/system/scheduleApplyErrata', 'post', data);
    okay = schedule.status === 200 && schedule.data?.success;
    errorMsg = schedule.data?.message;
  } catch (e) {
    // management/request rejects on non-2xx — surface the SUMA error message when present
    errorMsg = e?.data?.message || e?._statusText || e?.message || 'Request failed';
  }

  if (okay) {
    store.dispatch('suma/updateNotifications', {
      type:    'success',
      message: 'OS Patches successfully scheduled. OS Patching will begin shortly.'
    });

    // Kick a couple of event refreshes so the SumaNotification panel picks up
    // the newly scheduled action(s). SUMA takes a moment to surface them.
    const refreshEvents = () => {
      sids.forEach((sid) => {
        store.dispatch('suma/updateSystemEventsList', {
          store,
          suseManagerLink: suseManagerID,
          sid,
        });
      });
    };

    setTimeout(refreshEvents, 2000);
    setTimeout(refreshEvents, 10000);
  } else {
    store.dispatch('suma/updateNotifications', {
      type:    'error',
      message: `Something went wrong when applying OS patches. Please try again (${ errorMsg })`
    });
  }

  return schedule;
}

/**
 * SUMA system.scheduleReboot - schedule an immediate reboot of a single system.
 */
export async function sumaScheduleSystemReboot(store, suseManagerID, sid) {
  const payload = {
    sid:                Number(sid),
    // SUMA requires earliestOccurrence — send "now" so the reboot fires ASAP.
    earliestOccurrence: new Date().toISOString(),
  };

  let schedule;
  let okay = false;
  let errorMsg;

  try {
    schedule = await proxyRequest(store, suseManagerID, '/system/scheduleReboot', 'post', payload);
    okay = schedule.status === 200 && schedule.data?.success;
    errorMsg = schedule.data?.message;
  } catch (e) {
    errorMsg = e?.data?.message || e?._statusText || e?.message || 'Request failed';
  }

  if (okay) {
    store.dispatch('suma/updateNotifications', {
      type:    'success',
      message: 'System reboot successfully scheduled.'
    });

    // Give the SumaNotification panel a chance to see the new in-progress action.
    const refresh = () => {
      store.dispatch('suma/updateSystemEventsList', {
        store,
        suseManagerLink: suseManagerID,
        sid,
      });
    };

    setTimeout(refresh, 2000);
    setTimeout(refresh, 10000);
  } else {
    store.dispatch('suma/updateNotifications', {
      type:    'error',
      message: `Failed to schedule reboot: ${ errorMsg }`
    });
  }

  return { okay, error: okay ? undefined : errorMsg, raw: schedule };
}

/**
 * SUMA schedule.listCompletedActions - list actions that have completed
 */
export async function sumaListCompletedActions(store, suseManagerID) {
  const response = await proxyRequest(store, suseManagerID, '/schedule/listCompletedActions');

  return response.data?.result || [];
}

/**
 * SUMA schedule.listFailedActions - list actions that have failed
 */
export async function sumaListFailedActions(store, suseManagerID) {
  const response = await proxyRequest(store, suseManagerID, '/schedule/listFailedActions');

  return response.data?.result || [];
}
