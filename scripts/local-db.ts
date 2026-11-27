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
