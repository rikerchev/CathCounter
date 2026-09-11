export function hasRole(user, role) {
  if (!user) return false;
  if (user.role === role) return true;
  if (Array.isArray(user.roles) && user.roles.includes(role)) return true;
  return false;
}

export function hasAnyRole(user, roles) {
  if (!user) return false;
  return roles.some((r) => hasRole(user, r));
}

const PRIORITY = ["admin", "water_owner", "advertiser", "user"];

export function highestRole(roles) {
  if (!roles || roles.length === 0) return "user";
  for (const r of PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return "user";
}

export function toggleRole(roles, role) {
  if (!roles) roles = [];
  if (roles.includes(role)) {
    return roles.filter((r) => r !== role);
  }
  return [...roles, role];
}

export const ROLE_LABELS = {
  admin: "Администратор",
  water_owner: "Собственик на водоема",
  advertiser: "Рекламодател",
  user: "Потребител",
};