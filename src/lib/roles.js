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

// v2.76 — the user's real role set, guaranteed to include their scalar
// `role` even when the `roles[]` array hasn't been given it yet. This
// matters for any account whose admin (or other) status was ever granted
// directly on `role` without also being added to `roles` — the original
// "root" admin in particular, created before the multi-role `roles[]`
// column existed, typically has role: "admin" but roles: [] (schema
// default). Every place that recomputes role/roles from "the user's
// current roles" (AdminRoleRequests approving a request, AdminWaterBodies
// approving a water body and auto-granting water_owner, AdminUsers'
// per-role toggle buttons) used to read `u.roles` alone. For that root
// admin, `u.roles` is `[]`, so toggling in an unrelated role (e.g.
// approving a "water_owner" request) computed roles=["water_owner"] and
// then role = highestRole(roles) = "water_owner" — silently overwriting
// "admin" and locking the account out of every admin screen. Routing all
// three call sites through this function instead of reading `u.roles`
// directly means the existing scalar role is always folded in first, so
// granting one role can never make another, already-held one disappear.
export function effectiveRoles(user) {
  const roles = Array.isArray(user?.roles) ? [...user.roles] : [];
  if (user?.role && !roles.includes(user.role)) roles.push(user.role);
  return roles;
}

// v2.77 — "Собственик на водоема" renamed to "Търговец" in the UI only. The
// underlying role key stays "water_owner" everywhere (DB CHECK constraint,
// RoleRequest enum, PRIORITY above, every hasRole()/hasAnyRole() call) —
// only this label changed. A merchant can now register either a water body
// or a commercial venue (see AdminTraders.jsx / MerchantRequest.jsx); the
// role is granted the same way as before, automatically when an admin
// approves their first object.
export const ROLE_LABELS = {
  admin: "Администратор",
  water_owner: "Търговец",
  advertiser: "Рекламодател",
  user: "Потребител",
};