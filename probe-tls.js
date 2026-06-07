const tls = require('tls');
const host = process.argv[2] || 'ac-joescza-shard-00-00.wux2kgg.mongodb.net';
const port = Number(process.argv[3]) || 27017;

console.log(`Probing TLS to ${host}:${port}`);

const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
  console.log('connected, authorized:', socket.authorized);
  try {
    console.log('cipher:', socket.getCipher());
    console.log('peer cert subject:', socket.getPeerCertificate(true).subject);
  } catch (e) {
    console.error('error reading cert/cipher:', e.message);
  }
  socket.end();
});

socket.on('error', (err) => {
  console.error('TLS socket error:');
  console.error(err);
});
