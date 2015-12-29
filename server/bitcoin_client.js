var bitcoin = require('bitcoin');
var fs = require('fs');
var path = require('path');
var config = require('../config/config');

///setup ssl for this.
var client = new bitcoin.Client({
    host: config.BITCOIND_HOST,
    port: config.BITCOIND_PORT,
    user: config.BITCOIND_USER,
    pass: config.BITCOIND_PASS,
    ssl: true,
    sslStrict: true,
    sslCa: new Buffer('-----BEGIN CERTIFICATE-----\n' + config.BITCOIND_CERT  + '\n-----END CERTIFICATE-----')
});

module.exports = client;