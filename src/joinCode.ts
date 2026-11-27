// Team join codes (#44), shared by the server and the pages. Codes are stored as six characters from an
// alphabet without look-alikes ('K7P4QX', see migrations/0004_team_join_codes.sql) and shown as 'K7P-4QX'.

export const JOIN_CODE_LENGTH = 6;

// What someone typed or pasted ('k7p-4qx', 'K7P 4QX') as a stored code, or null when it can't be one.
export function normalizeJoinCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');

  return /^[2-9A-HJKMNP-Z]{6}$/.test(code) ? code : null;
}

export function formatJoinCode(code: string) {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

// The link a team opens to join, e.g. https://example.com/join/K7P4QX.
export function joinLink(origin: string, code: string) {
  return new URL(`/join/${code}`, origin).toString();
}
