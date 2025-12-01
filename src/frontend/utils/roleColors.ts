export type RoleId = 'owner' | 'admin' | 'judge';

export const roleGradients: Record<RoleId, string> = {
  owner: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
  admin: 'bg-gradient-to-b from-sky-400 to-indigo-500',
  judge: 'bg-gradient-to-b from-amber-400 to-orange-500'
};

export const roleBadgeColors: Record<RoleId, string> = {
  owner: 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-white border-0',
  admin: 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white border-0',
  judge: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0'
};
