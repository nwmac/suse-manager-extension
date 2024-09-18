import { CATALOG as CATALOG_ANNOTATIONS } from '@shell/config/labels-annotations';

/**
 * Fiond matching System from SUSE Manager for a node
 * @param systems Find
 * @param node 
 */
export function sumaSystemForNode(systems: any[], node: any) {
  if (!systems || !node?.internalIp) {
    return undefined;
  }

  return systems.find((system) => {
    return system.network?.ip === node.internalIp;
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

  if (server?.listLatestUpgradablePackages) {
    summary.total = server.listLatestUpgradablePackages.length;

    server.listLatestUpgradablePackages.forEach((patch: any) => {
      const sev = patch.severity || 'unknown';
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
// export async function installHelmChart(repo: any, chart: any, version: string = '', values: any = {}) {

//     /* Default values defined in the Helm chart itself */
//     const fromChart = this.versionInfo?.values || {};

//     const errors = [];

//     /*
//       Refer to the developer docs at docs/developer/helm-chart-apps.md
//       for details on what values are injected and where they come from.
//     */
//     // TODO: This is needed in order to support system registry for air-gapped environments
//     // this.addGlobalValuesTo(values);

//     /*
//       Migrated annotations are required to allow a deprecated legacy app to be
//       upgraded.
//     */

//     const chartInstall = {
//       chartName:   chart.chartName,
//       version:     this.version?.version || this.query.versionName,
//       releaseName: form.metadata.name,
//       description: this.customCmdOpts.description,
//       annotations: {
//         [CATALOG_ANNOTATIONS.SOURCE_REPO_TYPE]: chart.repoType,
//         [CATALOG_ANNOTATIONS.SOURCE_REPO_NAME]: chart.repoName
//       },
//       values,
//     };

//     /*
//       Configure Helm CLI options for doing the install or
//       upgrade operation.
//     */
//     const installRequest = {
//       charts:    [chartInstall],
//       noHooks:   false,
//       timeout:   '600s',
//       wait:      true,
//       namespace: 'TODO',
//       projectId: '',
//       disableOpenAPIValidation: false,
//       skipCRDs: false.
//     };

//     // Install the Chart
//     const res = await repo.doAction('install', installRequest);

//     return res;
//   }
// }
