const paths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  inbox: '<path d="M4 4h16l2 11v5H2v-5L4 4Zm-2 11h6l2 3h4l2-3h6"/>',
  users:
    '<circle cx="9" cy="8" r="4"/><path d="M2 21v-3c0-3 3-5 7-5s7 2 7 5v3M17 4a4 4 0 0 1 0 8m2 3c2 1 3 3 3 6"/>',
  suppliers: '<path d="M3 21V7l9-4 9 4v14H3Zm5 0v-7h8v7M7 8h2m6 0h2M7 11h2m6 0h2"/>',
  quote: '<path d="M6 2h9l4 4v16H6V2Zm9 0v5h4M9 11h7m-7 4h7m-7 4h4"/>',
  box: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 4 9-4M7 5.8l9 5"/>',
  truck:
    '<path d="M2 5h12v12H2V5Zm12 4h4l4 5v3h-8M2 17h20"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  wallet: '<rect x="3" y="5" width="19" height="15" rx="2"/><path d="M3 8V4l15-2v3m4 7h-6v4h6"/>',
  chart: '<path d="M4 3v18h18M8 16v-5m5 5V7m5 9v-8"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 2 4 4-1 1-3 4-2-1-4-3-1-1-4-4-1-3 2Z"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  logout: '<path d="M10 3H3v18h7m4-15 6 6-6 6m-7-6h13"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true">${paths[name] || paths.box}</svg>`;
