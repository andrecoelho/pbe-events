// Guard for dev-only database scripts: exits unless POSTGRES_URL is a database on this machine.
// The Railway tunnels are on localhost too, so their ports are refused as well.
const TUNNEL_PORTS: Record<string, string> = { '15432': 'staging', '15433': 'production' };

export function requireLocalDatabase(script: string) {
  const url = new URL(process.env.POSTGRES_URL ?? '');
  const target = `${url.hostname}:${url.port}${url.pathname}`;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const tunnel = TUNNEL_PORTS[url.port];

  if (!local || tunnel || process.env.NODE_ENV === 'production') {
    const why = tunnel ? `that's the ${tunnel} tunnel` : 'it only runs against a local dev database';
    console.error(`Refusing to run ${script} on ${target}: ${why}.`);
    process.exit(1);
  }

  return target;
}

// For scripts that may also run on staging: exits unless POSTGRES_URL is the staging tunnel
// (see scripts/with-staging-db.sh). Production stays out of reach.
export function requireStagingTunnel(script: string) {
  const url = new URL(process.env.POSTGRES_URL ?? '');
  const target = `${url.hostname}:${url.port}${url.pathname}`;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

  if (!local || TUNNEL_PORTS[url.port] !== 'staging' || process.env.NODE_ENV === 'production') {
    console.error(`Refusing to run ${script} --staging on ${target}: it only runs through the staging tunnel.`);
    process.exit(1);
  }

  return `staging (${target})`;
}
