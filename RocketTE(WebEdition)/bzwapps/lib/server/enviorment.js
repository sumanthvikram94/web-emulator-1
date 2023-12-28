'use strict';
const jsonUtils = require('../zlux/zlux-proxy-server/js/jsonUtils.js');
const path = require('path');
const fs = require('../zlux/zlux-proxy-server/js/node_modules/fs-extra');
const NODE_CONFIG = path.join(__dirname, '../../deploy/instance/ZLUX/serverConfig/nodejsConfig.json');
const process = require('process');

function getNodeArgs() {
	let node_args = '--harmony'
	try {
		const nodeV = process.version; //format: vxx.xx.xx
		const nodeVnum = Number(nodeV.substring(1, nodeV.indexOf('.')))//since from nodejs 17, openssl upgrade to 3.0
		const LEGACYPROVIDER = "--openssl-legacy-provider"
		const OPENSSLCONFIG = "--tls-cipher-list=DEFAULT@SECLEVEL=0"
		if (nodeVnum >= 17) {
			const nodeConfig =fs.existsSync(NODE_CONFIG)? jsonUtils.parseJSONWithComments(NODE_CONFIG):null
			//allow Weak Cipher (TLS1.0 & 1.1)
			if (nodeConfig && nodeConfig.opensslWeakCiphers) {
				node_args += " " + OPENSSLCONFIG
			};
			if (nodeConfig && nodeConfig.opensslLegacyProvider) {
				node_args += " " + LEGACYPROVIDER
			};
		}
		return node_args;
	} catch (err) {
		return node_args;
	}
}

console.log(getNodeArgs())

