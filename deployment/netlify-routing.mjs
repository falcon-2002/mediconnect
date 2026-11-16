import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function gatewayOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Set API_GATEWAY_ORIGIN to the public HTTPS API Gateway origin.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || (url.port && url.port !== '443') ||
      !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host))
    throw new Error('API_GATEWAY_ORIGIN must be a public HTTPS origin without credentials, path, query, or fragment.');
  return url.origin;
}

export function redirects(value) {
  const origin = gatewayOrigin(value);
  return `/api/* ${origin}/api/:splat 200!
/* /index.html 200
`;
}

export async function writeRouting(value, directory = fileURLToPath(new URL('../frontend/dist/', import.meta.url))) {
  // A missing/invalid deployment target fails the build; never fall back to localhost.
  const rules = redirects(value);
  await writeFile(resolve(directory, '_redirects'), rules);
  await writeFile(resolve(directory, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  writeRouting(process.env.API_GATEWAY_ORIGIN).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
