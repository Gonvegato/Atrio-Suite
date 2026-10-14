#!/usr/bin/env node
'use strict';
// Polaris de mentira para las pruebas: el puerto base abierto (como si estuviera en marcha) y su API web en https
// (base + 1) con lo que usa Atrio: entrar con usuario (cookie «auth» + token CSRF en la página), emparejamientos
// pendientes, PIN, código de un solo uso (OTP) y clientes. Usuario «sol», contraseña «luna».
// Uso: node fakepolaris.js <puerto base> <directorio para el certificado>
const net = require('net');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const BASE = Number(process.argv[2] || 47210);
const DIR = process.argv[3] || '/tmp/fakepolaris';
fs.mkdirSync(DIR, { recursive: true });
const key = path.join(DIR, 'key.pem');
const crt = path.join(DIR, 'crt.pem');
if (!fs.existsSync(crt)) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });

const PAIRING = 'ab'.repeat(16);
const SESSION = 'sesion-de-prueba';
const CSRF = 'csrf-de-prueba';
const clients = [];
net.createServer((s) => s.end()).listen(BASE, '127.0.0.1');
https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
  const send = (code, o, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(o)); };
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    console.log('[fakepolaris]', req.method, req.url, body);
    if (req.url === '/api/login' && req.method === 'POST') {
      const b = JSON.parse(body || '{}');
      if (b.username !== 'sol' || b.password !== 'luna') return send(401, { status: false, error: 'Invalid username or password.' });
      return send(200, { status: true }, { 'Set-Cookie': `auth=${SESSION}; Secure; HttpOnly; SameSite=Strict; Path=/` });
    }
    const authed = (req.headers.cookie || '').includes(`auth=${SESSION}`);
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<html><head><meta name="csrf-token" content="${CSRF}">\n</head><body></body></html>`);
    }
    if (!authed) return send(401, { status: false, error: 'Unauthorized' });
    if (req.method !== 'GET' && req.headers['x-csrf-token'] !== CSRF) return send(403, { error: 'CSRF token missing or invalid' });
    if (req.url === '/api/pin' && req.method === 'GET') return send(200, { pairings: [{ id: PAIRING, name: 'Nova', address: '192.168.1.50' }] });
    if (req.url === '/api/pin' && req.method === 'POST') {
      const b = JSON.parse(body || '{}');
      const ok = b.pairing_id === PAIRING && b.pin === '1234';
      if (ok) clients.push({ name: b.name, uuid: `c${clients.length}` });
      return send(200, { status: ok });
    }
    if (req.url === '/api/otp' && req.method === 'POST') {
      const b = JSON.parse(body || '{}');
      if (!b.passphrase || b.passphrase.length < 4) return send(400, { error: 'Passphrase too short!' });
      return send(200, { otp: '4321', ip: '192.168.1.20', name: 'PC-de-prueba', status: true });
    }
    if (req.url === '/api/clients/list') return send(200, { named_certs: clients, status: true });
    return send(404, { error: 'no' });
  });
}).listen(BASE + 1, '127.0.0.1', () => console.log(`[fakepolaris] en ${BASE} y https ${BASE + 1}`));
