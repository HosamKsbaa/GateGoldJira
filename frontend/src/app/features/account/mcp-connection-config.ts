// A stdio proxy starts browser OAuth on clients without a remote-auth button.
// Pin the bridge version so a copied configuration has the tested behavior.
export const mcpRemotePackage = 'mcp-remote@0.15.1';

export function mcpOAuthConfig(endpoint: string, clientId: string) {
  const url = new URL(endpoint);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use HTTPS for a shared MCP server or a loopback URL for local development.');
  }
  return {
    mcpServers: {
      gategoldjira: {
        command: 'npx',
        args: [
          '-y', mcpRemotePackage, endpoint,
          '--transport', 'http-only',
          '--host', '127.0.0.1',
          '--resource', endpoint,
          '--static-oauth-client-info', JSON.stringify({ client_id: clientId }),
          '--static-oauth-client-metadata', JSON.stringify({ scope: 'gategoldjira:access', token_endpoint_auth_method: 'none' }),
          '--auth-timeout', '180',
        ],
      },
    },
  };
}
