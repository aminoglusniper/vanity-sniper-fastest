const fs = require('fs');
const path = require('path');
const aminoglu = require('aminoglu');

const token = '';
const claim_guild_id = '';
const request_count = 1;

const mfapath = path.join(__dirname, 'mfa.txt');
let mfa = fs.existsSync(mfapath) ? fs.readFileSync(mfapath, 'utf8').trim() : '';

function prebuild(code) {
  const body = JSON.stringify({ code });
  const headers = [
    ['authorization', token],
    ['content-type', 'application/json'],
    ['user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'],
    ['x-super-properties', 'eyJicm93c2VyIjoiQ2hyb21lIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiQ2hyb21lIiwiY2xpZW50YnVpbGRfbnVtYmVyIjozNTU2MjR9'],
    ['content-length', String(Buffer.byteLength(body))],
  ];
  if (mfa) headers.push(['x-discord-mfa-authorization', mfa]);

  return {
    h1: { body, headers, tcp_nodelay: true, protocol: 'h1' },
    h2: { body, headers, tcp_nodelay: true, protocol: 'h2' },
  };
}

const prebuilt = new Map();
const vanity_map = new Map();

function reloadmfa() {
  try {
    if (!fs.existsSync(mfapath)) return;
    const newmfa = fs.readFileSync(mfapath, 'utf8').trim();
    if (newmfa && newmfa !== mfa) {
      mfa = newmfa;
      for (const code of prebuilt.keys()) {
        prebuilt.set(code, prebuild(code));
      }
    }
  } catch {}
}

if (fs.existsSync(mfapath)) {
  fs.watch(mfapath, () => {
    reloadmfa();
  });
}

function fire(code) {
  const pre = prebuilt.get(code);
  if (!pre) return;
  const url = `https://canary.discord.com/api/v10/guilds/${claim_guild_id}/vanity-url`;

  for (let i = 0; i < request_count; i++) {
    aminoglu
      .patch(url, pre.h1.body, pre.h1)
      .then((res) => console.log('[H1]', res.status, res.body))
      .catch((e) => console.error('[H1] Error:', e.message));

    aminoglu
      .patch(url, pre.h2.body, pre.h2)
      .then((res) => console.log('[H2]', res.status, res.body))
      .catch((e) => console.error('[H2] Error:', e.message));
  }
}

async function warmup() {
  const headers = [
    ['authorization', token],
    ['content-type', 'application/json'],
    ['user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'],
    ['x-super-properties', 'eyJicm93c2VyIjoiQ2hyb21lIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiQ2hyb21lIiwiY2xpZW50YnVpbGRfbnVtYmVyIjozNTU2MjR9'],
  ];
  if (mfa) headers.push(['x-discord-mfa-authorization', mfa]);

  try {
    await aminoglu.get('https://canary.discord.com/api/v10/users/@me', {
      headers,
      tcp_nodelay: true,
      protocol: 'h1',
    });
    await aminoglu.get('https://canary.discord.com/api/v10/users/@me', {
      headers,
      tcp_nodelay: true,
      protocol: 'h2',
    });
  } catch {}
}

async function start() {
  await warmup();

  await aminoglu.gateway(
    {
      token,
      gatewayUrl: 'wss://gateway.discord.gg/?v=10&encoding=json',
      socketOptions: { tcp_nodelay: true },
      properties: {
        os: 'Windows',
        browser: 'Discord Client',
        release_channel: 'canary',
        client_version: '1.0.600',
        client_build_number: 350000,
      },
    },
    async (msg) => {
      if (msg.kind !== 'text') return;

      let p;
      try {
        p = JSON.parse(msg.text);
      } catch {
        return;
      }

      if (p.t === 'READY') {
        for (const g of p.d.guilds || []) {
          const v = g.properties?.vanity_url_code ?? g.vanity_url_code;
          if (v) {
            vanity_map.set(g.id, v);
            prebuilt.set(v, prebuild(v));
          }
        }
        return;
      }

      if (p.t === 'GUILD_UPDATE') {
        const v = p.d.properties?.vanity_url_code ?? p.d.vanity_url_code;
        if (v === null) {
          const code = vanity_map.get(p.d.id);
          if (code) fire(code);
        }
      }
    }
  );
}

start();
