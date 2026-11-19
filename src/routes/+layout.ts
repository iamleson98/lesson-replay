// The render app is one client-rendered page: the worker's headless browser
// opens /render with the job in the URL fragment, so nothing is prerendered.
export const prerender = false;
export const ssr = false;
export const csr = true;
