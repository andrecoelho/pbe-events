// Railway infrastructure for PBE Events, for both environments (staging and production).
// Preview with `railway config plan --environment <env>`, apply with `railway config apply --environment <env>`.
// Anything removed from this file can be deleted on apply, so always read the plan first.
// Variables (secrets) stay in Railway and are not managed here.
import { database, defineRailway, github, project, service, volume } from 'railway/iac';

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment('production');
  if (!production && !ctx.isEnvironment('staging')) {
    throw new Error('Only the staging and production environments are described here; add the new one first.');
  }
  const region = 'us-west2';
  const volumeAlerts = { usage: { '100': {}, '80': {}, '95': {} } };

  // Pinned to the image already running. Changing the major version needs a data migration.
  const postgresDatabase = database('postgres', 'postgres', {
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:17',
    region
  });
  postgresDatabase.deploy = { multiRegionConfig: { [region]: { numReplicas: 1 } } };

  // Sizes as they are on Railway today. Volumes can grow but never shrink.
  const volumeSize = production ? 500 : 5000; // production: 500 MB, staging: 5000 MB
  const postgresDbVolume = volume('postgres-db-volume', {
    alerts: volumeAlerts,
    allowOnlineResize: true,
    region,
    sizeMB: volumeSize
  });
  const pbeEventsAppData = volume('pbe-events-app-data', {
    alerts: volumeAlerts,
    allowOnlineResize: true,
    region,
    sizeMB: volumeSize
  });

  const runpbe = service('runpbe', {
    // production deploys main, staging deploys staging; both wait for GitHub CI to pass.
    source: github('andrecoelho/pbe-events', { branch: production ? 'main' : 'staging', checkSuites: true }),
    build: { buildEnvironment: 'V3', builder: 'RAILPACK' },
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    replicas: { [region]: 1 },
    networking: { privateNetworkEndpoint: 'pbe-events' },
    volumeMounts: { '/app-data': pbeEventsAppData }
  });

  return project('PBE Events Manager', {
    variables: { managed: false },
    resources: [runpbe, postgresDatabase, postgresDbVolume, pbeEventsAppData]
  });
});
