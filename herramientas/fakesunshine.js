#!/usr/bin/env node
'use strict';
// Sunshine de mentira para las pruebas: el puerto base abierto (como si estuviera en marcha) y su API web en https
// (base + 1) con lo que usa Atrio: emparejamientos pendientes, PIN y clientes. Usuario «sol», contraseña «luna».
// Uso: node fakesunshine.js <puerto base> <directorio para el certificado>
const net = require('net');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const BASE = Number(process.argv[2] || 47210);
const DIR = process.argv[3] || '/tmp/fakesunshine';
fs.mkdirSync(DIR, { recursive: true });
const key = path.join(DIR, 'key.pem');
const crt = path.join(DIR, 'crt.pem');
if (!fs.existsSync(crt)) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });

const PAIRING = 'ab'.repeat(16);
const clients = [];
net.createServer((s) => s.end()).listen(BASE, '127.0.0.1');
https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
  const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.headers.authorization !== `Basic ${Buffer.from('sol:luna').toString('base64')}`) return send(401, { error: 'Unauthorized' });
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    console.log('[fakesunshine]', req.method, req.url, body);
    if (req.url === '/api/pin' && req.method === 'GET') return send(200, { pairings: [{ id: PAIRING, name: 'Moonlight', address: '192.168.1.50' }] });
    if (req.url === '/api/pin' && req.method === 'POST') {
      const b = JSON.parse(body || '{}');
      const ok = b.pairing_id === PAIRING && b.pin === '1234';
      if (ok) clients.push({ name: b.name, uuid: `c${clients.length}` });
      return send(200, { status: ok });
    }
    if (req.url === '/api/clients/list') return send(200, { named_certs: clients, status: true });
    return send(404, { error: 'no' });
  });
}).listen(BASE + 1, '127.0.0.1', () => console.log(`[fakesunshine] en ${BASE} y https ${BASE + 1}`));
