const DEFAULT_ROUTE = '/capture';

/**
 * Parses current hash into a normalized route string.
 */
export function getRoute() {
  const route = window.location.hash.replace(/^#/, '') || DEFAULT_ROUTE;
  return route.startsWith('/') ? route : `/${route}`;
}

/**
 * Registers callback for route updates.
 */
export function onRouteChange(callback) {
  const wrapped = () => callback(getRoute());
  window.addEventListener('hashchange', wrapped);
  callback(getRoute());
  return () => window.removeEventListener('hashchange', wrapped);
}

export function goTo(route) {
  window.location.hash = route;
}
