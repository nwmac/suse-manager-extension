import { CATALOG as CATALOG_ANNOTATIONS } from '@shell/config/labels-annotations';
import { MANAGEMENT } from '@shell/config/types';

/**
 * Cluster list rows are management clusters (they proxy their actions to the provisioning cluster),
 * so resolve to the provisioning cluster, which is where the SUSE Manager link annotation lives
 * @param resource Management or provisioning cluster
 */
export function toProvCluster(resource: any) {
  return resource?.type === MANAGEMENT.CLUSTER ? resource.provCluster : resource;
}

// A resource less that 1m30s old is considered new
const RECENT_TIME_WINDOW = 90;

/**
 * Find matching System from SUSE Manager for a node
 * @param systems Find
 * @param node 
 */
export function sumaSystemForNode(systems: any[], node: any) {
  let nodeIP = node?.internalIp;

  if (!nodeIP && node?.status?.addresses) {
    nodeIP = node?.status?.addresses.find((a: any) => a.type === 'InternalIP')?.address;
  }

  if (!systems || !nodeIP) {
    return undefined;
  }

  const found = systems.find((system) => {
    return system.network?.ip === nodeIP;
  });

  return systems.find((system) => {
    return system.network?.ip === nodeIP;
  });
}

// MLM returns three advisory types on relevant errata: "Security Advisory",
// "Bug Fix Advisory" (which we display as "Patch") and "Product Enhancement
// Advisory". Detect which by substring match on advisory_type — MLM's exact
// wording has varied slightly across versions.
const SEVERITY_SORT: { [key: string]: number } = {
  security:    1,
  patch:       2,
  enhancement: 3,
};


export function processPatch(patch: any) {
  const type = patch.advisory_type || '';

  if (type.includes('Security')) {
    patch.severity = 'security';
  } else if (type.includes('Enhancement')) {
    patch.severity = 'enhancement';
  } else {
    // Bug Fix Advisories and anything else falls under "Patch".
    patch.severity = 'patch';
  }

  patch.security = (patch.severity === 'security');
  patch.synopsis = patch.advisory_synopsis;
  patch.severitySort = SEVERITY_SORT[patch.severity] || 100;
}


export function groupPatches(server: any) {
  const summary: { [key: string]: number } = {
    total:       0,
    security:    0,
    patch:       0,
    enhancement: 0,
    unknown:     0,
  };

  if (server?.listLatestUpgradablePackages) {
    summary.total = server.listLatestUpgradablePackages.length;

    server.listLatestUpgradablePackages.forEach((patch: any) => {
      const sev = patch.severity || 'unknown';

      if (summary[sev] !== undefined) {
        summary[sev] = summary[sev] + 1;
      }
    });
  }

  return summary;
}

// Matches the "(and N more patches)" suffix SUMA adds to combined patch update action names.
// SUMA truncates action names (to 128 chars), so the suffix may be cut short (e.g. missing the ')')
const MORE_PATCHES_SUFFIX = /\s*\(and\s+(\d+)\b[^()]*\)?\s*$/;

/**
 * SUMA action names for combined patch updates always include an
 * "(and N more patches)" suffix — even when N is 0. Strip the noise-only case and
 * repair the suffix when SUMA has truncated it.
 */
export function stripEmptyMoreSuffix(name: string): string {
  return (name || '').replace(MORE_PATCHES_SUFFIX, (match: string, more: string) => {
    const n = parseInt(more, 10);

    return n > 0 ? ` (and ${ n } more patch${ n === 1 ? '' : 'es' })` : '';
  });
}

/**
 * Number of patches covered by a SUMA patch action, derived from its "(and N more patches)" suffix.
 * Returns undefined if the name does not include the suffix (e.g. it was truncated away)
 */
export function patchCountFromActionName(name: string): number | undefined {
  const match = (name || '').match(MORE_PATCHES_SUFFIX);

  return match ? parseInt(match[1], 10) + 1 : undefined;
}

/**
 * Applying an errata usually triggers a follow-on "Package List Refresh"
 * action on the target system. It's not a patch action, so we exclude it from
 * the in-progress notification panel and the finalize/outcome flow — the
 * banner would otherwise flip from "Applying patch…" to "Package List
 * Refresh…" and never reach a clean "N applied" completion state.
 */
export function isPatchRelevantAction(ev: any): boolean {
  const type = (ev?.action_type || '').toLowerCase();

  return !type.includes('package list refresh');
}

/**
 * Format a SUMA action / event into the single-line "- action_type on
 * profile_name => name" display we use across the notification panel and
 * completion summaries.
 */
export function formatActionLine(action: any): string {
  const name = stripEmptyMoreSuffix(action?.name || '');

  return `- ${ action?.action_type } on ${ action?.profile_name } => ${ name }`;
}

export function processError(error: any, t: any) {
  console.error('processError');
  console.error(error);
  error.error = error.message;

  if (error.code === 503) {
    error.error = t('suma.errors.proxy');
  }

  return error;
}

/**
 * Install Helm Chart
 * 
 * Note: This should really be provided via the shell rather than copied here
 */
export async function installHelmChart(repo: any, chart: any, values: any = {}) {
  /*
    Refer to the developer docs at docs/developer/helm-chart-apps.md
    for details on what values are injected and where they come from.
  */
  // TODO: This is needed in order to support system registry for air-gapped environments
  // this.addGlobalValuesTo(values);

  console.error(chart);

  const chartInstall = {
    chartName:   chart.name,
    version:     chart.version,
    releaseName: chart.name,
    description: chart.name,
    // description: ''.description,
    annotations: {
      [CATALOG_ANNOTATIONS.SOURCE_REPO_TYPE]: chart.repoType,
      [CATALOG_ANNOTATIONS.SOURCE_REPO_NAME]: chart.repoName
    },
    values,
  };

  /*
    Configure Helm CLI options for doing the install or
    upgrade operation.
  */
  const installRequest = {
    charts:    [chartInstall],
    noHooks:   false,
    timeout:   '600s',
    wait:      true,
    namespace: 'suse-manager',
    projectId: '',
    disableOpenAPIValidation: false,
    skipCRDs: false,
  };

  // Install the Chart
  const res = await repo.doAction('install', installRequest);

  return res;
}

// Return if the given resource should be considered 'new', based on the creation timestamp
export function isNewResource(svc: any) {
  const created = svc?.metadata?.creationTimestamp;

  if (created) {
    const dt = Date.parse(created);

    // If we can't parse the creation string, we don't know if it is new
    if (isNaN(dt)) {
      return false;
    }

    const now = Date.now();
    const diff = (now - dt) / 1000;

    return diff < RECENT_TIME_WINDOW;
  }
}
