import { CATALOG as CATALOG_ANNOTATIONS } from '@shell/config/labels-annotations';

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

// const CRITICAL_PREFIX = 'critical:';
// const IMPORTANT_PREFIX = 'important:';
// const MODERATE_PREFIX = ':';
// const LOW_PREFIX = 'low:';

const SECURITY_ADVISORY = 'Security Advisory';
const SEVERITY_REGEX = /^([a-z]+): Security.*/;

const SEVERITY_SORT: { [key: string]: number } = {
  'critical': 1,
  'important': 2,
  'moderate': 3,
  'low': 4,
  'bug': 5,
};

const SEVERITYSORT: { [sort: number]: string } = {
  100: 'critical',
};


export function processPatch(patch: any) {
  // Process the patch object
  // Process Type and Synopsis to get the actual severity
  patch.security = (patch.advisory_type === SECURITY_ADVISORY);

  if (patch.security) {
    // Get the severity
    const severity = patch.advisory_synopsis.match(SEVERITY_REGEX);

    if (severity?.length === 2) {
      patch.severity = severity[1];
      patch.synopsis = patch.advisory_synopsis.substr(patch.severity.length + 1).trim();
    } else {
      patch.synopsis = patch.advisory_synopsis;
    }
  } else {
    patch.synopsis = patch.advisory_synopsis;
    patch.severity = 'bug';
  }

  patch.severitySort = SEVERITY_SORT[patch.severity] || 100;
}


export function groupPatches(server: any) {
  const summary: { [key: string]: number }= {
    total: 0,
    critical: 0,
    important: 0,
    moderate: 0,
    low: 0,
    recommended: 0,
    bug: 0,
    unknown: 0,
  };

  // severitySort
  console.error('groupPatches');
  console.error(server);

  if (server?.listLatestUpgradablePackages) {
    summary.total = server.listLatestUpgradablePackages.length;

    server.listLatestUpgradablePackages.forEach((patch: any) => {
      const sev = patch.severity || SEVERITYSORT[patch.severitySort] || 'unknown';

      if (summary[sev] !== undefined) {
        summary[sev] = summary[sev] + 1;
      }
    });
  }

  console.error('SUMMARY');
  console.error(summary);

  return summary;
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
