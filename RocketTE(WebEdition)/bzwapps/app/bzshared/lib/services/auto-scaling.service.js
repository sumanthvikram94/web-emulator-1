const fse = require('fs-extra');
const path = require('path');
const zoweService = require('./zowe.service');
const autoScalingEnvService = require('./auto-scaling-env.service');
const os = require('os');
const { util } = require('./utils.service');

/**
 * Auto-scaling logics
 */
class AutoScalingService {

    constructor() {
        if(zoweService.isOnZowe){
            this._clusterConfig = {enabled: false , autoScaling: { enabled: false}}
        }else{
            this.overwriteMode = false;
            this.logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger('com.rs.rte.auto-scaling');
            this.autoscalePath = path.join(process.cwd(), '../config/autoscale');
            fse.ensureDirSync(this.autoscalePath);
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
        const bootstrapPath = path.join(this.autoscalePath, 'bootstrap.json');
        let bootstrapAddrs = [];

        if(fse.pathExistsSync(bootstrapPath)) {
            fse.readdirSync(this.autoscalePath); // get latest data
            const data = JSON.parse(fse.readFileSync(bootstrapPath, 'utf-8'));
            const addrs = Object.values(data);

            addrs.forEach(d => {
                if (d && Array.isArray(d)) {
                    bootstrapAddrs.push(...d);
                } else {
                    bootstrapAddrs.push(d)
                }
            });
        }

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
                this.logger.info('Type of local node is: ' + this._clusterConfig.autoScaling.nodeType);
                this.logger.info('Peer discovery method is: ' + this._clusterConfig.autoScaling.discovery);
                this.logger.debug('Existing peers are: ' + JSON.stringify(this._clusterConfig.autoScaling.peerList));
            }
        }
        
        // System ENVs to override multiaddr in meta_peers
        const proxyProtocol = process.env.RTEW_CLUSTER_PROXY_PROTOCOL // This relies on the protocols supported by libp2p
        const proxyIp = process.env.RTEW_CLUSTER_PROXY_IP // Higher priority than RTEW_CLUSTER_PROXY_HOSTNAME
        const proxyHostname = process.env.RTEW_CLUSTER_PROXY_HOSTNAME
        const proxyDomain = process.env.RTEW_CLUSTER_PROXY_DOMAIN // Works only when RTEW_CLUSTER_PROXY_HOSTNAME takes effect.

        // We provide an option to use the hostname obtained by code. The value will rely on the machine settings for hostname.
        let hostname = proxyHostname? (proxyHostname === 'RTEW_OS_HOSTNAME'? os.hostname(): proxyHostname) : undefined
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
            const bootstrapPath = path.join(this.autoscalePath, 'bootstrap.json');
            const proxyHostname = process.env.RTEW_CLUSTER_PROXY_HOSTNAME;
            const key = proxyHostname ? (proxyHostname === 'RTEW_OS_HOSTNAME'? os.hostname(): proxyHostname) : undefined;
            let data = {};

            if(fse.pathExistsSync(bootstrapPath)) {
                fse.readdirSync(this.autoscalePath); // get file list to prevent catching.
                // data = zoweService.jsonUtils.parseJSONWithComments(bootstrapPath);
                data = JSON.parse(fse.readFileSync(bootstrapPath, 'utf-8'));
            }

            if(key != null) {
                data[key] = addrs;
            }

            try {
                fse.writeFileSync(bootstrapPath, JSON.stringify(data, null, 2), 'utf8');
                this.logger.info(`Bootstrap token generation succeed. ${JSON.stringify(data)}`)
            } catch(e) {
                this.logger.severe('Error encountered while writing the bootstrap token to file!')
                console.error(e)
            }
        }
    }

    async writeConfigurations(bzdb) {
        const bzdbConfigs = ['authConfig', 'adminConfig', 'serverLogging', 'nodejsConfig', 'securityHeader'];
        const fileConfigs = [
            {name: 'zluxserver', path: this.zluxServerFile},
            {name: 'datasource', path: this.getConfigPath()['dataSourceSetting']}
        ]
        for await(let key of bzdbConfigs) {
            await this.writeBZDBConfigs(bzdb, key);
        }

        for await(let node of fileConfigs) {
            await this.writeFileConfigs(node.name, node.path);
        }
    }

    /**
     * Writes authentication configurations: (fallback, ldap, sso, mssql) into file as b64 string
     * @param {*} bzdb 
     * @param {*} name 
     */
    async writeBZDBConfigs(bzdb, name) {
        try {
            const data = await bzdb.select(name);
            const config = data.rowCount > 0? data.data[0]: {};
            const fileName = this.getFileName()[name] || name;

            if(name === 'authConfig') {
                this.writeAuthServerConfigs(config.dataserviceAuthentication?.defaultAuthentication);
            }

            if(Object.keys(config).length === 0) return;

            this.writeFile(config, fileName);
        } catch (e) {
            this.logger.severe(`Failed to write BZDB configs: ${name}`);
            console.error(e)
        }
    }

    /**
     * based on data to wirte file
     * @param {*} name 
     * @param {*} file
     */
    async writeFileConfigs(name, file) {
        try {
            if(!fse.pathExistsSync(file)) return;

            const data = zoweService.jsonUtils.parseJSONWithComments(file);
            const fileName = this.getFileName()[name] || name;
            
            this.writeFile(data, fileName);

            if(name === 'zluxserver') {
                this.writeHttpsCerts(data?.node);
            }
        } catch (e) {
            this.logger.severe(`Failed to write file configs: ${name}`);
            console.error(e)
        }
    }


     /**
     * Writes authentication configurations: (ldap, sso, mssql) into file as b64 string
     * @param {*} type: ldap / sso / mssql
     */
    async writeAuthServerConfigs(type) {
        try {
            const maps = {
                ldap: 'ldapServerConfig',
                sso: 'ssoServerConfig',
                mssql: 'msSQLServerConfig'
            };
            const serverPath = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/authConfig');
            const fileName = maps[type];

            if(!fileName) return;

            const dsfile = path.join(serverPath, `${fileName}.json`);

            if( !fse.pathExistsSync(dsfile)) {
                return;
            }

            const config = zoweService.jsonUtils.parseJSONWithComments(dsfile);

            if(type === 'sso') {
                this.writeSSOCerts();
            }
           
            this.writeFile(config, fileName);
            this.logger.debug('Successed to auth server configs: ' + fileName);
        } catch (e) {
            this.logger.severe(`Failed to auth server configs: ${type}`);
            console.error(e)
        }
    }


    /**
     * Writes certificate key and cert into file as b64 string
     * @param {*} files: files path
     * @param {*} type: sso / https
     * @param {boolean} updated: update need to re-write file otherwise check file exist or not
     */
    async writeCerts(files, type, updated) {
        try {
            files.forEach(dsfile => {
                if(!fse.pathExistsSync(dsfile)) return;

                const config = fse.readFileSync(dsfile);
                const fileName = path.basename(dsfile);
                const certPath = path.join(this.autoscalePath, `${type}_${fileName}`);

                // if exist, do not save
                if(!this.overwriteMode && !updated && fse.pathExistsSync(certPath)) {
                    return;
                }

                fse.writeFileSync(certPath, config, 'binary');
                this.logger.info('Successed to write cert configs: ' + certPath);
            });
        } catch (e) {
            this.logger.severe(`Failed to auth cert configs: ${type}`);
            console.error(e)
        }
    }

    /**
     * Writes sso certificate key and cert into file as b64 string
     * @param {boolean} updated: when updating file need to re-wirte otherwise check file exist or not, don't do anything if file exist 
    */
    async writeSSOCerts(updated) {
        const dir = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/upload');

        if(!fse.pathExistsSync(dir)) {
            return;
        }

        const files = await fse.readdir(dir);
        const fileNames = files.map(d => {
           return path.join(dir, d);
        });

        this.writeCerts(fileNames, 'sso', updated);
    }

    /**
     * Writes sso certificate key and cert into file as b64 string
     * @param {*} node 
     * @param {boolean} updated: whether update file
     */
    async writeHttpsCerts(node, updated) {
        const basePath = path.join(process.cwd());
        const cas = [], files = [];

        node.tlsOptions?.ca.forEach(k => {
            cas.push(path.join(basePath, k));
        });

        this.writeCerts(cas, 'ca', updated);

        if(node.https == null) return;

        if(node.https.pfx) {
            files.push(path.join(basePath, node.https.pfx));
        } else {
            for(let key of ['keys', 'certificates']) {
                node.https[key].forEach(k => {
                    files.push(path.join(basePath, k));
                })
            }
        }

        this.writeCerts(files, 'https', updated);
    }
    
    /**
     * 
     * @param {*} token 
     * @param {*} file 
     * @param {boolean} updated：whether update file
     * 
     */
    async writeFile(data, file, updated) {
        const configPath = path.join(this.autoscalePath, `${file}.json`);

        // if exist, do not save
        if(!this.overwriteMode && !updated && fse.pathExistsSync(configPath)) {
            return;
        }

        try {
            fse.ensureFileSync(configPath);
            fse.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
            this.logger.info(`Successed to write files: ${configPath}, data: ${JSON.stringify(data)}`);
        } catch(err) {
            this.logger.severe(`Failed to write files: ${file}`);
            console.error(err);
        }
    }

    /**
     * update specific config file
     * @param {*} token 
     * @param {*} name 
     */
    async updateFile(data, name) {
        const files = this.getFileName();
        this.writeFile(data, files[name] || name, true)

        if(name === 'server' || name === 'zlux') {
            this.writeHttpsCerts(data?.node, true);
        }

        if(name === 'sso') {
            this.writeSSOCerts(true);
        }
       
    }

    /**
     * Apply the configuration provided in specfic folder.
     */
    applyConfigurations() {
        try {
            const paths = this.getConfigPath();
            const configPath = path.join(this.autoscalePath);

            if(!fse.pathExistsSync(configPath)) {
                return;
            }

            const files = fse.readdirSync(configPath);
            this.logger.info(`Prepare to re-write files:  ${files.toString()}, path: ${configPath}`);
            const jsonFiles = [] // .json files
            const certFiles = [] // other files
            for (let file of files) {
                if (/\.json$/.test(file)) {
                    jsonFiles.push(file)
                } else {
                    certFiles.push(file)
                }
            }

            jsonFiles.forEach(d => { // Overwrites the configuration files.
                let file;
                const sourcePath = path.join(this.autoscalePath, d);
                this.logger.info(`sourcePath:  ${sourcePath}`);
                
                // handle config json files
                file = paths[d.replace(/\.json$/, '')];
                if(file == null) return;

                fse.ensureFileSync(file);
                fse.copySync(sourcePath, file);
                this.logger.info(`Completed writing target file :  ${file}`);
            });

            const certs = this.getCertPath(); // Collect certificate configurations after the configurations are written.
            
            certFiles.forEach(d => { // Overwrites the certificates configured in the configuration files.
                let file;
                const sourcePath = path.join(this.autoscalePath, d);
                this.logger.info(`sourcePath:  ${sourcePath}`);
                // handle cert files
                file = certs[d];

                if(file == null) return; // The file in autoscale folder is not in use.

                fse.ensureFileSync(file);
                fse.copySync(sourcePath, file);
                this.logger.info(`Completed writing target file :  ${file}`);
            });
        } catch(err) {
            this.logger.severe(`Failed to apply configurations`);
            console.error(err);
        }
    }

    /**
     * read config files in autoscale folder
     * @returns file path for each configuration.
     */
    getConfigPath() {
        const basePath = process.cwd();
        const configPath = path.join(zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/');
        const serverPath = path.join(basePath, zoweService.instanceDir, 'ZLUX/serverConfig');

        return {
            ldapServerConfig: path.join(basePath, configPath, 'authConfig/ldapServerConfig.json'), // auth config
            ssoServerConfig: path.join(basePath, configPath, 'authConfig/ssoServerConfig.json'),
            msSQLServerConfig: path.join(basePath, configPath, 'authConfig/msSQLServerConfig.json'),
            authentication: path.join(basePath, configPath, 'authConfig/authentication.json'),
            dataSourceSetting: path.join(basePath, configPath, 'configurations/dataSourceSetting.json'),
            adminConfig: path.join(basePath, zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzadm/configurations/adminConfig.json'),
            logging: path.join(serverPath, 'logging.json'),
            zluxserver: path.join(serverPath, 'zluxserver.json'),
            nodejsConfig: path.join(serverPath, 'nodejsConfig.json'),
            securityHeader: path.join(serverPath, 'securityHeader.json'),
            metaConfig: path.join(basePath, configPath, '_metadata/config/config.json')
        }
    }

    /**
     * distinguish between sso and https, add prefix for them
     * @returns file path object
     */
    getCertPath() {
        if(!fse.pathExistsSync(this.autoscalePath)) {
            return {};
        }
        fse.readdirSync(this.autoscalePath);
        const zluxServerFile = path.join(this.autoscalePath, 'zluxserver.json');
        const paths = {};

        if(fse.pathExistsSync(zluxServerFile)) {
            const data = zoweService.jsonUtils.parseJSONWithComments(zluxServerFile);
            
            if(data.node.https?.pfx) {
                const pfxPath = data.node.https.pfx.split('/').pop();
                paths[`https_${pfxPath}`] = path.join(process.cwd(), data.node.https.pfx);
                
            } else if(data.node.https) {
                const certPath = data.node.https.certificates[0].split('/').pop();
                paths[`https_${certPath}`] = path.join(process.cwd(), data.node.https.certificates[0]);
    
                const keyPath = data.node.https.keys[0].split('/').pop();
                paths[`https_${keyPath}`] = path.join(process.cwd(), data.node.https.keys[0]);
            }
            if(data.node.tlsOptions?.ca) {
                data.node.tlsOptions.ca.forEach(d => {
                    const caPath = d.split('/').pop();
                    paths[`ca_${caPath}`] = path.join(process.cwd(), d);
                })
            }
        }

        const authPath = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/authConfig');
        const authFile = path.join(authPath, 'authentication.json');

        if(fse.pathExistsSync(authFile)) {
            fse.readdirSync(authPath);
            const config = zoweService.jsonUtils.parseJSONWithComments(authFile);

            if(config.dataserviceAuthentication?.defaultAuthentication === 'sso') {
                const uploadPath = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/upload');
                const serverPath = path.join(process.cwd(), zoweService.instanceDir, 'ZLUX/pluginStorage/com.rs.bzshared/_db_store/authConfig');
                const dsfile = path.join(serverPath, 'ssoServerConfig.json');
                const ssoConfig = zoweService.jsonUtils.parseJSONWithComments(dsfile);
                
                paths[`sso_${ssoConfig.sp.certificate}`]= path.join(uploadPath, ssoConfig.sp.certificate);
                paths[`sso_${ssoConfig.sp.private_key}`] = path.join(uploadPath, ssoConfig.sp.private_key);
                paths[`sso_${ssoConfig.idp.certificates}`] = path.join(uploadPath, ssoConfig.idp.certificates);
            }
        }

        return paths;
    }

    /**
     * 
     * @returns sacved configuration file name in autoscale folder
     */
    getFileName() {
        return {
            ldap: 'ldapServerConfig', 
            sso: 'ssoServerConfig',
            mssql: 'msSQLServerConfig',
            authConfig: 'authentication',
            auth: 'authentication',
            datasource: 'dataSourceSetting',
            adminConfig: 'adminConfig',
            serverLogging:'logging',
            zluxserver: 'zluxserver',
            server: 'zluxserver',
            zlux: 'zluxserver',
            nodejsConfig: 'nodejsConfig',
            securityHeader: 'securityHeader',
            metaConfig: 'config'
        }
    }

    inEnvMode() {
        return process.env.RTEW_CLUSTER_CONFIG_INIT_WITH_ENV === 'true';
    }

    /**
     * Writes all date required by auto-scaling function.
     * @param {*} bzdb 
     */
    async writeAutoScalingData(bzdb) {
        if (this._clusterConfig.enabled === true && this._clusterConfig.autoScaling.enabled === true) {
                
                if ( this._clusterConfig.autoScaling.discovery === 'bootstrap' ) {
                    this.writeBootstrapToken(bzdb);
                }

                if(this.inEnvMode()) { // use enviroment vars to set init data
                    autoScalingEnvService.writeToken(bzdb);
                } else {
                    await this.writeConfigurations(bzdb);
                }
        }
    }

    /**
     * Apply the configurations provided by ENV vars
     */
    applyAutoScalingConfigs() {
        if (this._clusterConfig.enabled === true && this._clusterConfig.autoScaling.enabled === true) {
            if(this.inEnvMode()) {
                autoScalingEnvService.applyAutoScalingConfigs();
            } else {
                this.applyConfigurations();
            }
        }
    }

    async overwriteAutoScalingData(bzdb) {
        const overwriteMode = this.overwriteMode;

        this.overwriteMode = true;
        await this.writeAutoScalingData(bzdb);
        this.overwriteMode = overwriteMode; // reset overwriteMode
    }
}

const autoScalingService = new AutoScalingService();

module.exports = autoScalingService;