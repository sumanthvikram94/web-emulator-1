const fse = require('fs-extra');
const path = require('path');
const zoweService = require('./zowe.service');
const os = require('os');
const { util } = require('./utils.service');

/**
 * Auto-scaling logics
 */
class AutoScalingEnvService {

    constructor() {
        if(!zoweService.isOnZowe){
            this.logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger('com.rs.rte.auto-scaling');
            this.autoscalePath = path.join(process.cwd(), '../config/autoscale');
            fse.ensureDirSync(this.autoscalePath)
            this.zluxServerFile = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/serverConfig/zluxserver.json');
            this.serverConfigPath = path.join(process.cwd(), '../config/server');
            this.logConfigPath = path.join(this.serverConfigPath, 'logging.json');
            this._setClusterConfig();
            this.logger.debug('Cluster configuration: ' + JSON.stringify(this._clusterConfig));
        }
    }

    /**
     * @private
     * Reads the system ENVs and set clusterConfig
     */
    _setClusterConfig() {
        // We support up to 5 nodes for HA purpose
        const bootstrap0 = this._decodeBootstrap(process.env.RTEW_CLUSTER_AUTO_SCALING_BOOTSTRAP)
        const bootstrap1 = this._decodeBootstrap(process.env.RTEW_CLUSTER_AUTO_SCALING_BOOTSTRAP_1)
        const bootstrap2 = this._decodeBootstrap(process.env.RTEW_CLUSTER_AUTO_SCALING_BOOTSTRAP_2)
        const bootstrap3 = this._decodeBootstrap(process.env.RTEW_CLUSTER_AUTO_SCALING_BOOTSTRAP_3)
        const bootstrap4 = this._decodeBootstrap(process.env.RTEW_CLUSTER_AUTO_SCALING_BOOTSTRAP_4)
        const bootstrapAddrs = [...bootstrap0, ...bootstrap1, ...bootstrap2, ...bootstrap3, ...bootstrap4]
        this._clusterConfig = {
            enabled: !(process.env.RTEW_CLUSTER_ENABLED === 'false'), // false only when RTEW_CLUSTER_ENABLED is 'false'
            autoScaling: {
                enabled: process.env.RTEW_CLUSTER_AUTO_SCALING_ENABLED === 'true', // true only when RTEW_CLUSTER_AUTO_SCALING_ENABLED is 'true'
                nodeType: process.env.RTEW_CLUSTER_NODE_TYPE === 'scalable'? 'scalable': 'persistent', 
                discovery: process.env.RTEW_CLUSTER_AUTO_SCALING_DISCOVERY === 'mdns'? 'mdns': 'bootstrap', // 'mdns' only when RTEW_CLUSTER_AUTO_SCALING_DISCOVERY is 'mdns', otherwise 'bootstrap'
                peerList: bootstrapAddrs
            }
        }

        // Print configuration to log
        if (this._clusterConfig.enabled === true) {
            this.logger.info('Clustering enabled');
            if (this._clusterConfig.autoScaling.enabled === true){
                this.logger.info('Auto-scaling enabled');
                this.logger.info('Type of local node is: ' + this._clusterConfig.nodeType);
                this.logger.info('Peer discovery method is: ' + this._clusterConfig.discovery);
                this.logger.debug('Existing peers are: ' + JSON.stringify(this._clusterConfig.peerList));
            }
        }
        
        // System ENVs to override multiaddr in meta_peers
        const proxyProtocol = process.env.RTEW_CLUSTER_PROXY_PROTOCOL // This relies on the protocols supported by libp2p
        const proxyIp = process.env.RTEW_CLUSTER_PROXY_IP // Higher priority than RTEW_CLUSTER_PROXY_HOSTNAME
        const proxyHostname = process.env.RTEW_CLUSTER_PROXY_HOSTNAME
        const proxyDomain = process.env.RTEW_CLUSTER_PROXY_DOMAIN // Works only when RTEW_CLUSTER_PROXY_HOSTNAME takes effect.

        // We provide an option to use the hostname obtained by code. The value will rely on the machine settings for hostname.
        let hostname = proxyHostname? (proxyHostname === 'RTEW_OS_HOSTNAME'? os.hostname: proxyHostname) : undefined
        // hostname.domain - In case hostname not including domain, and domain is required for the communication.
        hostname = proxyDomain && hostname? hostname + '.' + proxyDomain: hostname

        const ip = proxyIp? proxyIp: hostname
        const proxyPort = process.env.RTEW_CLUSTER_PROXY_PORT
        if (ip || proxyPort){
            this._clusterConfig.proxy = {
                protocol: proxyProtocol,
                ip,
                port: proxyPort
            }
            // Print configuration to log
            this.logger.info('Overrides peer address metadata to: ' + JSON.stringify(this._clusterConfig.proxy))
        }
    }

    /**
     * @returns The cluster configuration calculated with system ENVs
     */
    getClusterConfig() {
        return this._clusterConfig
    }

    /**
     * Change the bootstrap token from base64 string to Array
     * @private
     * @param {*} bs 
     * @returns 
     */
    _decodeBootstrap(bs) {
        if (bs !== undefined && bs.length > 0) {
            try {
                const data = util.b64ToJSON(bs);
                if (data && Array.isArray(data)) {
                    return data
                } else {
                    return []
                }
            } catch (e) {
                return []
            }
        } else {
            return []
        }
    }

    /**
     * Writes the bootstrap token to file bzwapps/config/server/autoscale/bootstrap.txt
     * @param {*} bzdb 
     */
    async writeBootstrapToken(bzdb) {
        const addrs = await bzdb.getNodeAddrs();
        if (addrs) {
            const base64data = util.JSONToB64(addrs);
            const bootstrapPath = path.join(this.autoscalePath, 'bootstrap.txt');
            try {
                fse.writeFile(bootstrapPath, base64data);
                this.logger.info('Bootstrap token generation succeed.')
            } catch(e) {
                this.logger.severe('Error encountered while writing the bootstrap token to file!')
                console.error(e)
            }
        }
    }

    async writeToken(bzdb) {
        /**
         * server.txt: node in adminConfig, node and loglevels in zluxServer.json, serverLogging
         * config.txt: meta_config
         * authConfig.txt: authConfig, dataSourceConfig
        */
        for(let key of ['server.txt', 'config.txt', 'authConfig.txt']) {
            fse.removeSync(path.join(this.autoscalePath, key))
        }
        
        await this.writeAuthConfigToken(bzdb);
        await this.writeDatasourceToken(bzdb);
        await this.writeLoggingToken(bzdb);
        await this.writeAdminConfigToken(bzdb)
        await this.writeZluxServerToken(bzdb);
        await this.writeNodeConfigToken(bzdb);
        await this.writeMetaConfigToken(bzdb);
    }

    /**
     * Writes authentication configurations into file as b64 string
     * @param {*} bzdb 
     */
    async writeAuthConfigToken(bzdb) {
        try {
            const data = await bzdb.select('authConfig');
            const config = data.rowCount > 0? data.data[0]: {}
            const token = util.JSONToB64({authConfig: config});
           
            this.writeFile(token, 'authConfig');
            this.writeAuthServerConfigToken(config.dataserviceAuthentication?.defaultAuthentication);
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes ldap/sso/mql server configuration into file as b64 string
     * @param {*} bzdb 
     */
    async writeAuthServerConfigToken(type) {
        try {
            const maps = {
                ldap: 'ldapServerConfig.json',
                sso: 'ssoServerConfig.json',
                mssql: 'msSQLServerConfig.json'
            };
            
            if(maps[type] == null) {
                return;
            }

            const serverPath = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/authConfig');
            const dsfile = path.join(serverPath, maps[type]);

            if( !fse.pathExistsSync(dsfile)) {
                return;
            }

            const config = zoweService.jsonUtils.parseJSONWithComments(dsfile);
            const token = util.JSONToB64({authServerConfig: config});

            if(type === 'sso') {
                this.writeSSOCertConfigToken();
            }
           
            this.writeFile(token, 'authServerConfig');
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes certificate key and cert into file as b64 string
     * @param {*} bzdb 
    */
    async writeCertConfigToken(files, type) {
        try {
            function splitStringIntoArray(inputString, chunkSize) {
                const resultArray = [];
                for (let i = 0; i < inputString.length; i += chunkSize) {
                    resultArray.push(inputString.slice(i, i + chunkSize));
                }
                return resultArray;
            }

            const chunkSize = 1200;

            files.forEach(dsfile => {
                const config = fse.readFileSync(dsfile).toString();
                const parts = dsfile.split("\\");
                const fileName = parts.pop();
                const stringArray = splitStringIntoArray(config.toString(), chunkSize);

                stringArray.forEach((s, i) => {
                    const data = {};
                    data[fileName] = s;
                    const token = util.JSONToB64(data);

                    this.writeFile(token, `${type}-${fileName}-${i + 1}`);
                })            
            });
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes sso certificate key and cert into file as b64 string
     * @param {*} bzdb 
    */
    async writeSSOCertConfigToken() {
        const dir = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/upload');
        const files = await fse.readdir(dir);
        const fileNames = files.map(d => {
           return path.join(dir, d);
        });

        this.writeCertConfigToken(fileNames, 'sso');
    }

    /**
     * Writes sso certificate key and cert into file as b64 string
     * @param {*} bzdb 
    */
    async writeHttpsCertConfigToken(node) {
        if(node.https == null) return;

        const basePath = path.join(process.cwd());
        const files = [];

        if(node.https.pfx) {
            files.push(path.join(basePath, node.https.pfx));
        } else {
            for(let key of ['keys', 'certificates']) {
                node.https[key].forEach(k => {
                    files.push(path.join(basePath, k));
                })
            }
        }

        this.writeCertConfigToken(files, 'https');
    }

    /**
     * Writes authentication configurations into file as b64 string
     * @param {*} bzdb 
    */
    async writeDatasourceToken(bzdb) {
        try {
            const dsfile = this.getConfigPath()['dataSourceConfig'];

            if( !fse.pathExistsSync(dsfile)) {
                return;
            }

            const config = zoweService.jsonUtils.parseJSONWithComments(dsfile);
            const token = util.JSONToB64({dataSourceConfig: config});
           
            this.writeFile(token, 'authConfig');
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes admin config into file as b64 string
     * @param {*} bzdb 
    */
    async writeAdminConfigToken(bzdb) {
        try {
            const data = await bzdb.select('adminConfig');
            const config = data.rowCount > 0? data.data[0]: {};
            const {node} = config; // session time out MS
            const token = util.JSONToB64({adminConfig: {node}});
           
            this.writeFile(token, 'server');
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes server logging into file as b64 string
     * @param {*} bzdb 
    */
    async writeLoggingToken(bzdb) {
        try {
            const data = await bzdb.select('serverLogging');
            const config = data.rowCount > 0? data.data[0]: {}
            const token = util.JSONToB64({loggingConfig: config});

            this.writeFile(token, 'server');
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes node and logLevels of zluxServer.json into file as b64 string
     * @param {*} bzdb 
    */
    async writeZluxServerToken(bzdb) {
        try {
            const data = zoweService.jsonUtils.parseJSONWithComments(this.zluxServerFile);
            const {node, logLevels} = data;
            const token = util.JSONToB64({zluxServer: {node, logLevels}});
           
            this.writeFile(token, 'server');
            this.writeHttpsCertConfigToken(node);
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes nodejs configurations into file as b64 string
     * @param {*} bzdb 
     */
    async writeNodeConfigToken(bzdb) {
        try {
            const data = await bzdb.select('nodejsConfig');
            const config = data.rowCount > 0? data.data[0]: {}
            const token = util.JSONToB64({nodeConfig: config});
           
            this.writeFile(token, 'server');
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Writes meta configurations into file as b64 string
     * @param {*} bzdb 
     */
    async writeMetaConfigToken(bzdb) {
        try {
            const data = await bzdb.select('meta_config');
            const config = data.rowCount > 0? data.data[0]: {}
            const token = util.JSONToB64({metaConfig: {value: config}});
            
            this.writeFile(token);
        } catch (e) {
            console.error(e)
        }
    }

    
    async writeFile(token, file = 'config') {
        const authConfigPath = path.join(this.autoscalePath, `${file}.txt`);
        // fse.writeFile(authConfigPath, token);
        fse.ensureFileSync(authConfigPath);
        const txt = fse.readFileSync(authConfigPath).toString();
        fse.writeFileSync(authConfigPath, txt ? `${txt},${token}` : token);
    }

    /**
     * Apply the auth configuration provided with ENV vars.
     */
    applyConfigToken() {
        const paths = this.getConfigPath();
        for(let config of ['RTEW_CONFIG', 'RTEW_SERVER', 'RTEW_AUTH_CONFIG', 'RTEW_AUTH_SERVER_CONFIG']) {
            const configToken = process.env[config];
            if (configToken && configToken.length > 0) {
                try{
                    const configs = configToken.split(',').filter(d => d.length > 0);
                    configs.forEach(token => {
                        const config = util.b64ToJSON(token);

                        for(let key in config) {
                            const filePath = paths[key];

                            if(!filePath) return;

                            let data = config[key];

                            if(key === 'zluxServer') {
                                let serverConfig = zoweService.jsonUtils.parseJSONWithComments(this.zluxServerFile);
                                
                                data = Object.assign(serverConfig, config[key]);
                            }

                            if(key === 'adminConfig') {
                                const adminConfig = JSON.parse(fse.readFileSync(filePath, 'utf8'));

                                data = Object.assign(adminConfig, config[key]);
                            }

                            fse.ensureFileSync(filePath);
                            fse.writeFileSync(filePath, JSON.stringify(data, null, 2));
                        }
                    })
                   
                } catch(e) {
                    console.error(e)
                }
            }
        }
    }

    /**
     * https: .cert, .key, .pfx
     * sso: server.cert, server.key, sso.cert
     * 
     * env: RTEW_HTTPS_PFX_*    =>    https.pfx, 
     *      RTEW_HTTPS_CERT_*   =>    https.cert
     *      RTEW_HTTPS_KEY_*   =>    https.key
     *      RTEW_SSO_KEY_*     =>    sso.sp.key
     *      RTEW_SSO_CERT_*    =>    sso.sp.cert
     *      RTEW_SSO_IDP_*     =>    sso.idp.cert
    */
    applyCertToken() {
        const certs = [];    

        const data = zoweService.jsonUtils.parseJSONWithComments(this.zluxServerFile);
        
        if(data.node.https?.pfx) {
            certs.push({pfx: {
                path: data.node.https.pfx,
                files: ['RTEW_HTTPS_PFX_1', 'RTEW_HTTPS_PFX_2', 'RTEW_HTTPS_PFX_3', 'RTEW_HTTPS_PFX_4']
            }});
        } else if(data.node.https) {
            certs.push({cert: {
                path: path.join(process.cwd(), data.node.https.certificates[0]),
                files: ['RTEW_HTTPS_CERT_1', 'RTEW_HTTPS_CERT_2', 'RTEW_HTTPS_CERT_3', 'RTEW_HTTPS_CERT_4']
              }},
              {key: {
                path: path.join(process.cwd(), data.node.https.keys[0]),
                files: ['RTEW_HTTPS_KEY_1', 'RTEW_HTTPS_KEY_2', 'RTEW_HTTPS_KEY_3', 'RTEW_HTTPS_KEY_4']
              }})
        }

        const authFile = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/authConfig/authentication.json');

        try {
            if(fse.pathExistsSync(authFile)) {
                const config = zoweService.jsonUtils.parseJSONWithComments(authFile);
    
                if(config.dataserviceAuthentication?.defaultAuthentication === 'sso') {
                    const uploadPath = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/upload');
                    const serverPath = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/authConfig');
                    const dsfile = path.join(serverPath, 'ssoServerConfig.json');
                    const ssoConfig = zoweService.jsonUtils.parseJSONWithComments(dsfile);
        
                    certs.push({ssoKey: {
                        path: path.join(uploadPath, ssoConfig.sp.certificate),
                        files: ['RTEW_SSO_KEY_1', 'RTEW_SSO_KEY_2', 'RTEW_SSO_KEY_3', 'RTEW_SSO_KEY_4']
                    }},
                     {ssoCert: {
                        path: path.join(uploadPath, ssoConfig.sp.private_key),
                        files: ['RTEW_SSO_CERT_1', 'RTEW_SSO_CERT_2', 'RTEW_SSO_CERT_3', 'RTEW_SSO_CERT_4']
                     }},
                     {ssoIDP: {
                        path: path.join(uploadPath, ssoConfig.idp.certificates),
                        files: ['RTEW_SSO_IDP_1', 'RTEW_SSO_IDP_2', 'RTEW_SSO_IDP_3', 'RTEW_SSO_IDP_4']
                     }})
                }
            }
    
            for(let config of certs) {
                for(let key in config) {
                    let data = '';
                    for(let file of config[key].files) {
                        const configToken = process.env[file];
                        if (configToken && configToken.length > 0) {
                            try{
                                const config = util.b64ToJSON(configToken);
            
                                for(let key in config) {
                                    data += config[key];
                                }
                            } catch(e) {
                                console.error(e)
                            }
                        }
                    }
                    const filePath = config[key].path;
    
                    fse.ensureFileSync(filePath);
                    fse.writeFileSync(filePath, JSON.stringify(data, null, 2));
                }
            }
        } catch(e) {
            console.error(e)
        }
    }

    /**
     * 
     * @returns file path for each configuration.
     */
    getConfigPath() {
        const basePath = process.cwd();
        const configPath = path.join(zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/');
        const serverPath = path.join(basePath, zoweService.instanceDir, 'ZLUX/serverConfig');

        return {
            authConfig: path.join(basePath, configPath, 'authConfig/authentication.json'),
            dataSourceConfig: path.join(basePath, configPath, 'configurations/dataSourceSetting.json'),
            adminConfig: path.join(basePath, zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzadm/configurations/adminConfig.json'),
            loggingConfig: path.join(serverPath, 'logging.json'),
            zluxServer: path.join(serverPath, 'zluxserver.json'),
            nodeConfig: path.join(serverPath, 'nodejsConfig.json'),
            metaConfig: path.join(basePath, configPath, '_metadata/config/config.json'),
        }
    }

    getEnvName() {
        return {
            authConfig: 'RTEW_AUTH_CONFIG',
            config: 'RTEW_CONFIG',
            server: 'RTEW_SERVER'
        }

    }

    /**
     * update token in txt file
     * name: configuration key in txt file
     * value: updated value
     * file: txt file which saved current configuration
     */
    updateConfigFile(name, value, file) {
        const authConfigPath = path.join(this.autoscalePath, `${file}.txt`);
        fse.ensureFileSync(authConfigPath);
        const configToken = fse.readFileSync(authConfigPath).toString();

        if (configToken && configToken.length > 0) {
            try{
                const configs = configToken.split(',').filter(d => d.length > 0);
                let txt = '';

                configs.forEach(token => {
                    const config = util.b64ToJSON(token);

                    for(let key in config) {
                        if(key === name) {
                            const obj = {};
                            obj[name] = value;
                            const data = util.JSONToB64(obj);
                            txt += (txt === '' ? data : `,${data}`);
                        } else {
                            txt += (txt === '' ? token : `,${token}`);
                        }
                    }
                });
                fse.writeFileSync(authConfigPath, txt);
            } catch(e) {
                console.error(e)
            }
        }
    }

    /**
     * Writes all date required by auto-scaling function.
     * @param {*} bzdb 
     */
    async writeAutoScalingData(bzdb) {
        if (this._clusterConfig.enabled === true && this._clusterConfig.autoScaling.enabled === true 
            && this._clusterConfig.autoScaling.nodeType === 'persistent') {
                if ( this._clusterConfig.autoScaling.discovery === 'bootstrap' ) {
                    this.writeBootstrapToken(bzdb);
                }
                this.writeToken(bzdb);
        }
    }

    /**
     * Apply the configurations provided by ENV vars
     */
    applyAutoScalingConfigs() {
        this.applyCertToken();
        // this.applyLogConfigToken();
    }
}

const autoScalingEnvService = new AutoScalingEnvService();

module.exports = autoScalingEnvService;