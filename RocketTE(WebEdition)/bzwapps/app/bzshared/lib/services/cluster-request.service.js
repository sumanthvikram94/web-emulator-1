
const request = require('request');
// const oAuth = require('./oauth.service');
// const Utils = require('./utils.service');
const ServerRuntimeService = require('./server-runtime.service');
// const cache = require('../services/inmem-cache.service');
const bzdb = require('./bzdb.service');
const connUtils = require('./conn-utils');
const ReportSv = require('../dist/report-service');
// const CACHE_CATEGORY = 'SLAVE_USER_STATE';
// const CLEAR_CACHE_URLS = ['/logoutCluster'];

class ClusterRequestService {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        this.logger = context.logger;
        // this.serverConfig = context.plugin.server.config;
        // this.pluginDef = context.plugin.pluginDef;
        this.context = context;
        this.reportSv = ReportSv;
        // this.utils = Utils.init(this.logger);
        this.serverRuntime = new ServerRuntimeService(context);
        // this.cache = cache;
    }
    
    /**
     * Updates local node url on server startup
     */
    async updatePeers() {
        const node = await this.getServerNode();
        const metaPeers = await this.reportSv.select('meta_peers');
        if (metaPeers.rowCount === 0){ // Cluster is not enalbed.
            return;
        }
        const metaNode = await this.reportSv.select('meta_node');
        if (this.reportSv.shareFS.status){ // ignore it in watchFileMode.
            return;
        }
        const id = metaNode.data[0].id;
        const data = metaPeers.data.find(d => d.id === id) || {};
        if (node.serverURL && node.serverURL !== data.serverURL) { // there shouldn't be an update if it's not changed.
            Object.assign(data, node, { localIp: connUtils.getLocalIp() });
            await this.reportSv.updateOrInsert('meta_peers', data);
        }
    }

    /**
     * 
     * @returns serverUrl of local node.
     */
    async getServerNode() {
        let url = '', serverName = '';
        const protocols = Object.keys(this.context.plugin.server.config.user.node);
        const isHttps = protocols.findIndex(d => d.toLowerCase() === 'https') > -1;
        const isHttp = protocols.findIndex(d => d.toLowerCase() === 'http') > -1;
        if (protocols.length > 1 && isHttps && isHttp){
            this.logger.warn('Both http and https are configured. We have to rely on the http request to identify the actuall protocol. This could cause issues when reverse proxy or load balancer uses different protocol.');
        }
        const protocol = isHttps ? 'https': 'http';
        let port = this.context.plugin.server.config.user.node[protocol].port;
        try{
            serverName = this.serverRuntime.getHostName();
            this.logger.debug("getHostUrl::serverName "+serverName)
            const domain = await this.serverRuntime.getHostDomain();
            if (domain && domain.status && domain.data) {
                this.logger.debug("getHostUrl::domain "+domain.data)
                const len=serverName.length-domain.data.length
                if(!(len>0 && serverName.lastIndexOf(domain.data)==len)){ //server name ended by the domain.data
                    serverName = `${serverName}.${domain.data}`;
                } 
            }else {
                this.logger.warn('Failed to get server domain. Will use hostname only. This will have problem when http requests are cross domain.');
            }
            url = `${protocol}://${serverName}:${port}`;
        }catch (err) {
            this.logger.warn('Failed to get server fullname. Using the url get from request.');
            this.logger.severe(err.stack? err.stack: err.message);
        }
        return {
            serverURL: url
        };
    }

    redirectToConfigjsRequest(req,res,configUrl, context){
        const headers = {};
        const reqBody = JSON.stringify(req.body);
        Object.assign(headers, req.headers);
        headers['content-length'] = Buffer.from(reqBody).length;
        const protocol = req.protocol;
        const port = context.plugin.server.config.user.node[protocol].port;
        // const host = req.headers['master-node']? req.headers['master-node'] : (protocol + '://' + (req.hostname || req.host)+ ':' + port);
        const host = protocol + '://' + this.serverRuntime.getHostName() + ':' + port;
        let options = {
            url: host + configUrl,
            method: req.method,
            headers: headers,
            body: reqBody
        };
        options=this.httpsOption(options);
        request(options, (err, response, body) => {
            if (!err && response && response.statusCode ) {
                return res.status(response.statusCode).send(body);
            }else if (err && response && response.statusCode){
                this.logger.severe('redirectToConfigjsRequest(), error is '+err.message+',statusCode is' +response.statusCode+ 'data is '+ JSON.stringify(options))
                return res.status(response.statusCode).send(err.message);
            }else if (err) {
                this.logger.severe('redirectToConfigjsRequest(), error is '+err.message+', data is '+ JSON.stringify(options))
                return res.status(500).send(err.message);
            }else {
                this.logger.warn('redirectToConfigjsRequest(),Unknown Internal Error, data is '+ JSON.stringify(options));
                return res.status(500).send('Unknown Internal Error');
            }
        });
    }

    requestUserResource(req, configUrl, data){
        return new Promise((resolve, reject) => {
            const headers = {};
            Object.assign(headers, req.headers);
            let reqBody = data? data:'{}';
            if (data && typeof(reqBody) == 'object'){
                reqBody = JSON.stringify(data);
            }
            headers['content-length'] = Buffer.from(reqBody).length;
            const host = this.utils.getURL(req, this.context);
            headers['master-node'] = host;
            headers['cluster-auth-token'] = oAuth.getDefaultTokenBase64();
            let options = {
                url: host + configUrl,
                method: req.method,
                headers: headers,
                body: reqBody
            };
            options=this.httpsOption(options);
            request(options, (err, response, body) => {
                if (!err && response && response.statusCode ) {
                    if (response.statusCode == 401){
                        return reject({status: false, message: '401 Unauthorized'});
                    }
                    if (response.statusCode == 404){
                        //TBD, log when file doesn't exist, "unknown resource requested"
                    }
                    return resolve({status: true});
                }else if (err) {
                    this.logger.severe('requestUserResource(), error is '+err.message+', data is '+ JSON.stringify(options));
                    return reject({status: false, message: err.message});
                }else {
                    this.logger.warn('requestUserResource(),Unknown Internal Error, data is '+ JSON.stringify(options));
                    return reject({status: false, message: 'Unknown Internal Error'});
                }
            });
        });
    }
    
    httpsOption(requestOptions){
        const isHttps=requestOptions.url.toLowerCase().indexOf("https")===0?true:false;
        if(isHttps){
            Object.assign(requestOptions,{"agentOptions":{"rejectUnauthorized":false}});  //todo, use this to https error CERT_HAS_EXPIRED   
        }
        return requestOptions;
    }

    // Deprecated
    // clearCache(req){
    //     const url = req.url;
    //     if (url && CLEAR_CACHE_URLS.includes(url)){
    //         const username = req.headers.username;
    //         this.cache.destroySubject(CACHE_CATEGORY, username);
    //     }
    // }

    // Deprecated
    // redirectSlaveRequest(req,res,next){
    //     if (this.serverConfig.user.bzwCluster && this.serverConfig.user.bzwCluster.nodeType === 'slave' && this.serverConfig.user.bzwCluster.masterOrigin){
    //         this.clearCache(req);
    //         const headers = {};
    //         const reqBody = JSON.stringify(req.body);
    //         Object.assign(headers, req.headers);
    //         headers['content-length'] = Buffer.from(reqBody).length;
    //         headers['master-node'] = this.serverConfig.user.bzwCluster.masterOrigin;
    //         headers['cluster-auth-token'] = oAuth.getDefaultTokenBase64();
    //         let options = {
    //             url: this.serverConfig.user.bzwCluster.masterOrigin + req.originalUrl,
    //             method: req.method,
    //             headers: headers,
    //             body: reqBody
    //         };
    //         options=this.httpsOption(options);
    //         request(options, (err, response, body) => {
    //             if (!err && response && response.statusCode ) {
    //                 return res.status(response.statusCode).send(body);
    //             // }else if (err && response && response.statusCode){
    //             //     return res.status(response.statusCode).send(err.message);
    //             }else if (err) {
    //                 this.logger.severe('redirectSlaveRequest(), primary node not reachable, data is '+ JSON.stringify(options));
 
    //                 return res.status(500).send({
    //                     type: 'cluster',
    //                     description: 'primary node site can not be reached',
    //                     info: 'refused to connect.',
    //                     message: err.message
    //                   });
    //             }else {
    //                 this.logger.warn('redirectSlaveRequest(),Unknown Internal Error, data is '+ JSON.stringify(options));
    //                 return res.status(500).send('Unknown Internal Error');
    //             }
    //         });
    //     }else{
    //         next();
    //     }
    // }


    // Deprecated
    // redirectToUserResourceRequest(req, configUrl, data){
    //     const headers = {};
    //     const reqBody = JSON.stringify(req.body);
    //     Object.assign(headers, req.headers);
    //     headers['content-length'] = Buffer.from(reqBody).length;
    //     const protocol = req.protocol;
    //     const port = context.plugin.server.config.user.node[protocol].port;
    //     const host = req.headers['master-node']? req.headers['master-node'] : (protocol + '://' + (req.hostname || req.host) + ':' + port);
    //     let options = {
    //         url: host + configUrl,
    //         method: req.method,
    //         headers: headers,
    //         body: reqBody
    //     };
    //     options=this.httpsOption(options);
    //     request(options, (err, response, body) => {
    //         if (!err && response && response.statusCode ) {
    //             return res.status(response.statusCode).send(body);
    //         }else if (err && response && response.statusCode){
    //             this.logger.severe('redirectToConfigjsRequest(), error is '+err.message+',statusCode is' +response.statusCode+ 'data is '+ JSON.stringify(options))
    //             return res.status(response.statusCode).send(err.message);
    //         }else if (err) {
    //             this.logger.severe('redirectToConfigjsRequest(), error is '+err.message+', data is '+ JSON.stringify(options))
    //             return res.status(500).send(err.message);
    //         }else {
    //             this.logger.warn('redirectToConfigjsRequest(),Unknown Internal Error, data is '+ JSON.stringify(options));
    //             return res.status(500).send('Unknown Internal Error');
    //         }
    //     });
    // }

    // Deprecated
    // recordUserStateOnMaster(username){
    //     return new Promise((resolve, reject) => {
    //         if (this.serverConfig.bzwCluster && this.serverConfig.bzwCluster.nodeType === 'slave' && this.serverConfig.bzwCluster.masterOrigin){
    //             const headers = {};
    //             const reqBody = '{}';
    //             // Object.assign(headers, req.headers);
    //             headers['Content-Type'] = 'application/json';
    //             headers['content-length'] = Buffer.from(reqBody).length;
    //             headers['master-node'] = this.serverConfig.bzwCluster.masterOrigin;
    //             headers['authorization'] = oAuth.getDefaultTokenBase64();
    //             headers['username'] = username;
    //             let options = {
    //                 url: this.serverConfig.bzwCluster.masterOrigin + '/ZLUX/plugins/com.rs.bzw/services/cluster/recordUserState',
    //                 method: 'POST',
    //                 headers: headers,
    //                 body: reqBody
    //             };
    //             options=this.httpsOption(options);
    //             request(options, (err, response, body) => {
    //                 if (!err && response && response.body ) {
    //                     resolve( response.body );
    //                 }else if (err) {
    //                     reject( {status: false, message: err.message });
    //                 }else {
    //                     reject( {status: false, message: 'Unknown Error' });
    //                 }
    //             });
    //         }else{
    //             reject( {status: false, message: 'No valid primary node data'} );
    //         }
    //     });
    // }

    // Deprecated
    // verifyUserStateOnMaster(username){
    //     return new Promise((resolve, reject) => {
    //         if (this.serverConfig.bzwCluster && this.serverConfig.bzwCluster.nodeType === 'slave' && this.serverConfig.bzwCluster.masterOrigin){
    //             if (this.cache.readSubject(CACHE_CATEGORY,username)){
    //                 resolve('{"status": true, "message": "User state validate"}');
    //                 return;
    //             }
    //             const headers = {};
    //             const reqBody = '{}';
    //             // Object.assign(headers, req.headers);
    //             headers['Content-Type'] = 'application/json';
    //             headers['content-length'] = Buffer.from(reqBody).length;
    //             headers['master-node'] = this.serverConfig.bzwCluster.masterOrigin;
    //             headers['authorization'] = oAuth.getDefaultTokenBase64();
    //             headers['username'] = username;
    //             let options = {
    //                 url: this.serverConfig.bzwCluster.masterOrigin + '/ZLUX/plugins/com.rs.bzw/services/cluster/verifyUserState',
    //                 method: 'POST',
    //                 headers: headers,
    //                 body: reqBody
    //             };
    //             options=this.httpsOption(options);
    //             request(options, (err, response, body) => {
    //                 if (!err && response && response.body ) {
    //                     if (JSON.parse(response.body).status) {
    //                         this.cache.add(CACHE_CATEGORY, username, true);
    //                     }
    //                     resolve( response.body );
    //                 }else if (err) {
    //                     reject( {status: false, message: err.message });
    //                 }else {
    //                     reject( {status: false, message: 'Unknown Error' });
    //                 }
    //             });
    //         }else{
    //             reject( {status: false, message: 'No valid primary node data'} );
    //         }
    //     });
    // }

    // Deprecated
    // deleteUserStateOnMaster(req, context){
    //     return new Promise((resolve, reject) => {
    //         const username = req.headers.username;
    //         const headers = {};
    //         const reqBody = '{}';
    //         // Object.assign(headers, req.headers);
    //         headers['Content-Type'] = 'application/json';
    //         headers['content-length'] = Buffer.from(reqBody).length;
    //         // headers['master-node'] = this.serverConfig.user.bzwCluster.masterOrigin;
    //         headers['authorization'] = oAuth.getDefaultTokenBase64();
    //         headers['username'] = username;
    //         // let url = this.utils.getURL(req, context);
    //         let url = req.headers['master-node'] || '';
    //         if (this.serverConfig.user.bzwCluster && this.serverConfig.user.bzwCluster.nodeType === 'slave' && this.serverConfig.user.bzwCluster.masterOrigin){
    //             url = this.serverConfig.user.bzwCluster.masterOrigin;
    //         }
    //         let options = {
    //             url: url + '/ZLUX/plugins/com.rs.bzw/services/cluster/deleteUserState',
    //             method: 'POST',
    //             headers: headers,
    //             body: reqBody
    //         };
    //         options=this.httpsOption(options);
    //         request(options, (err, response, body) => {
    //             if (!err && response && response.body ) {
    //                 resolve( response.body );
    //             }else if (err) {
    //                 reject( {status: false, message: err.message });
    //             }else {
    //                 reject( {status: false, message: 'Unknown Error' });
    //             }
    //         });
            
    //     });
    // }
    
}

module.exports = ClusterRequestService;
