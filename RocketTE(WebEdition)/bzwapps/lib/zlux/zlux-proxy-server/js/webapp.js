

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

'use strict';
const express = require('express');
const util = require('util');
const url = require('url');
const expressWs = require('express-ws');
const path = require('path');
const Promise = require('bluebird');
const http = require('http');
const bodyParser = require('body-parser');
const session = require('express-session');
const zluxUtil = require('./util');
const configService = require('../plugins/config/lib/configService.js');
const proxy = require('./proxy');
const zLuxUrl = require('./url');
const makeSwaggerCatalog = require('./swagger-catalog');
const UNP = require('./unp-constants');
const jsonUtils = require('./jsonUtils.js');
const querySetting = require('querystring');
const { ExpressOIDC } = require('@okta/oidc-middleware');
const UAParser = require('ua-parser-js');
const cors = require('cors')
const morgan = require('morgan'); //http request log
const BzwLogging = require('../../../server/bzwLogging');



const ACCESSMSG = {
  error: '403 Forbidden',
  message: 'Rocket TE Administration Console has been configured to restrict remote access.'
}


/**
 * Sets up an Express application to serve plugin data files and services  
 */

const DEFAULT_SESSION_TIMEOUT_MS = 60 /* min */ * 60 * 1000;

const SERVICE_TYPE_NODE = 0;
const SERVICE_TYPE_PROXY = 1;
const PROXY_SERVER_CONFIGJS_URL = '/plugins/com.rs.configjs/services/data/';
const CUSTOM_POST_DATA = 'custPostData';
//TODO: move this (and other consts) to a commonly accessible constants file when moving to typescript
const WEBSOCKET_CLOSE_INTERNAL_ERROR = 4999; 
const WEBSOCKET_CLOSE_BY_PROXY = 4998;
const WEBSOCKET_CLOSE_CODE_MINIMUM = 3000;
const DEFAULT_READBODY_LIMIT = process.env.ZLUX_DEFAULT_READBODY_LIMIT || 102400;//100kb

var contentLogger = zluxUtil.loggers.contentLogger;
var bootstrapLogger = zluxUtil.loggers.bootstrapLogger;
var installLog = zluxUtil.loggers.installLogger;
var utilLog = zluxUtil.loggers.utilLogger;
var requestLog = zluxUtil.loggers.requestLogger;

const jsonParser = bodyParser.json()
const urlencodedParser = bodyParser.urlencoded({ extended: false })
let webplugin;

const DEFAULT_MESSAGE = "The browser is no longer supported, please use Chrome, Firefox or Edge.";

function DataserviceContext(serviceDefinition, serviceConfiguration, 
    pluginContext) {
  this.serviceDefinition = serviceDefinition;
  this.serviceConfiguration = serviceConfiguration;
  this.plugin = pluginContext;
  webplugin = pluginContext;
  this.logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger(
    pluginContext.pluginDef.identifier + "." + serviceDefinition.name);
}
DataserviceContext.prototype = {
  makeSublogger(name) {
    return makeSubloggerFromDefinitions(this.plugin.pluginDef,
        this.serviceDefinition, name);
  },
  addBodyParseMiddleware(router) {
    router.use(bodyParser.json({type:'application/json'}));
    router.use(bodyParser.text({type:'text/plain'}));
    router.use(bodyParser.text({type:'text/html'}));
  }
};

function do404(URL, res, message) {
  contentLogger.debug("404: "+message+", url="+URL);
  res.statusMessage = message;
  res.status(404).send("<h1>"+message+"</h1>");
}

function sendAuthenticationFailure(res, authType) {
  res.status(401).json({
    'error':'unauthorized',
    'plugin':pluginDefinition.identifier,
    'service':serviceDefinition.name,
    'authenticationType':authType
  });
};
function sendAuthorizationFailure(res, authType, resource) {
  res.status(403).json({
    'error':'forbidden',
    'plugin':pluginDefinition.identifier,
    'service':serviceDefinition.name,
    'authenticationType':authType,
    'resource':resource
  });
};

const staticHandlers = {
  ng2TypeScript: function(ng2Ts) { 
    return function(req, res) {
      contentLogger.log(contentLogger.FINER,"generated ng2 module:\n"+util.inspect(ng2Ts));
      res.setHeader("Content-Type", "text/typescript");
      res.setHeader("Server", "jdmfws");
      res.status(200).send(ng2Ts);
    }
  },

  plugins: function(plugins) {
    return function(req, res) {
      let parsedRequest = url.parse(req.url, true);
      if (!parsedRequest.query) {
        do404(req.url, res, "A plugin query must be specified");
        return;
      }
      let type = parsedRequest.query["type"];
      /*
        Note: here, we query for installed plugins using a filter of either 'all' or a specific pluginType.
        But, some plugins do not have pluginTypes currently. People can forget to include that information.
        In our code, we've been assuming that plugins that do not declare a type are of type 'application',
        but this should be enforced somehow in the future.
      */
      if (!type) {
        do404(req.url, res, "A plugin type must be specified");
        return;
      }
      const pluginDefs = plugins.map(p => p.exportDef());
      const response = {
        //TODO type/version
        pluginDefinitions: null 
      };
      contentLogger.debug('Type requested ='+type);
      if (type == "all") {
        response.pluginDefinitions = pluginDefs;
      } else {
        response.pluginDefinitions = pluginDefs.filter(def => {
          if (def.pluginType != null) {
            contentLogger.debug('Returning true if type matches, type='
                + def.pluginType);
            return def.pluginType === type;
          } else if (type == 'application') {
            contentLogger.debug('Returning true because type is application');
            return true;
          } else {
            contentLogger.debug('Returning false because type did not match');
            return false;
          }
        });
      }
      res.json(response);
    }
  },
  
  //TODO unify '/plugins' and '/apiManagement/plugins'
  apiManagement(webApp) {
    const r = express.Router();
    r.post('/plugins', jsonParser, function api(req, res) {
      const pluginDef = req.body;
      Promise.resolve().then(() => webApp.options.newPluginHandler(pluginDef))
        .then(() => {
          res.status(200).send('plugin added');
        }, (err) => {
          res.status(400).send('failed to add the plugin: ' + err.message);
          console.warn(err);
        });
    });
    return r;
  }
};

/**
 *  This is passed to every other service of the plugin, so that 
 *  the service can be called by other services under the plugin
 */
function WebServiceHandle(urlPrefix, port) {
  this.urlPrefix = urlPrefix;
  this.port = port;
}
WebServiceHandle.prototype = {
  constructor: WebServiceHandle,
  //This is currently suboptimal: it makes an HTTP call
  //to localhost for every service call. We could instead just call
  //the corresponding router directly with mock request and
  //response objects, but that's tricky, so let's do that
  //later.

  //  router: null,
  port: 0,
  urlPrefix: null,

  call(path, options, originalRequest) {
    return new Promise((resolve, reject) => {
      if (typeof path === "object") {
        options = path;
        path = "";
      }
      options = options || {};
      let url = this.urlPrefix;
      if (path) {
        url += '/' + path;
      }
      const requestOptions = {
        hostname: "localhost",
        port: this.port,
        method: options.method || "GET",
        protocol: 'http:',
        path: url,
        auth: options.auth
      };
      const headers = {};
      if (originalRequest) {
        var cookie = originalRequest.get('cookie');
        if (cookie) {
          headers["Cookie"] = cookie;
        }
      }
      Object.assign(headers, options.headers);
      if (options.body) {
        if (typeof options.body === "string") {
          if (options.contentType) {
            headers["Content-Type"] = options.contentType;
          } else {
            headers["Content-Type"] = "application/json";
          }
          headers["Content-Length"] = Buffer.from(options.body).length;
        } else {
          headers["Content-Type"] = "application/json";
          const json = JSON.stringify(options.body)
          headers["Content-Length"] = Buffer.from(json).length;
          options.body = json;
        }
      }
      //console.log("headers: ", headers)
      if (Object.getOwnPropertyNames(headers).length > 0) {
        requestOptions.headers = headers;
      }
      //console.log('http request', requestOptions);
      const request = http.request(requestOptions, (response) => {
        var chunks = [];
        response.on('data',(chunk)=> {
          utilLog.debug('Callservice: Data received');
          chunks.push(chunk);
        });
        response.on('end',() => {
          utilLog.debug('Callservice: Service call completed.');
          response.body = Buffer.concat(chunks).toString();
          resolve(response);
        });
      }
      );
      request.on('error', (e) => {
        utilLog.warn('Callservice: Service call failed.');
        reject(e);
      });
      if (options.body) {
        request.write(options.body);
      }
      utilLog.debug('Callservice: Issuing request to service');
      request.end();
    }
    );
  }
};


const commonMiddleware = {
  /**
   * Initializes the req.mvdData (or whatever the name of the project at the moment is)
   *
   * The request object is cached in the closure scope here, so that a service
   * making a call to another service doesn't have to bother about passing the  
   * authentication data on: we'll do that
   */
  
  addAppSpecificDataToRequest(globalAppData) {
    return function addAppSpecificData(req, res, next) {
      const appData = Object.create(globalAppData);
      if (!req[`${UNP.APP_NAME}Data`]) {
        req[`${UNP.APP_NAME}Data`] = appData; 
      }
      if (!appData.webApp) {
        appData.webApp = {};
      } else {
      	appData.webApp = Object.create(appData.webApp);
      }
      appData.webApp.callRootService = function callRootService(name, url, 
          options) {
        return this.rootServices[name].call(url, options, req);
      }
      if (!appData.plugin) {
        appData.plugin = {};
      } else {
      	appData.plugin = Object.create(appData.plugin);
      }
      appData.plugin.callService = function callService(name, url, options) {
        try {
          return this.services[name].call(url, options, req);
        } catch (e) {
          return Promise.reject(e);
        }
      }
      if (!appData.service) {
        appData.service = {};
      } else {
        appData.service = Object.create(appData.service);
      }
      next();
    }
  },
  
  injectPluginDef(pluginDef) {
    return function(req, res, next) {
      req[`${UNP.APP_NAME}Data`].plugin.def = pluginDef;
      next();
    }
  },
  
  injectServiceDef(serviceDef) {
    return function _injectServiceDef(req, res, next) {
      req[`${UNP.APP_NAME}Data`].service.def = serviceDef;
      next();
    }
  },


  /**
   * Injects the service handles to the request so that a service can
   * call other serivces - root services or services created or imported
   * by the plugin, by reading 
   *   req.mvdData.plugin.services[serviceName] 
   * or
   *   req.mvdData.webApp.rootServices[serviceName] 
   *
   * It's context-sensitive, the behaviour depends on the plugin
   */
  injectServiceHandles(serviceHandles, isRoot) {
    if (isRoot) {
      return function injectRoot(req, res, next) {
        //console.log('injecting services: ', Object.keys(serviceHandles))
        req[`${UNP.APP_NAME}Data`].webApp.rootServices = serviceHandles;
        next();
      }
    } else {
      return function inject(req, res, next) {
       // console.log('injecting services: ', Object.keys(serviceHandles))
        req[`${UNP.APP_NAME}Data`].plugin.services = serviceHandles;
        next();
      }
    }
  },
  
  /**
   * A pretty crude  request body reader
   */
  readBody() {
    return function readBody(req, res, next) {
      if (req.body) {
        next()
        return;
      }
      var bodyLen = 0;
      const body = [];
      const contentType = req.get('Content-Type');
      if ((req.method != 'POST') && (req.method != 'PUT')) {
        next();
        return;
      }
      var onData = function(chunk) {
        body.push(chunk);
        bodyLen += chunk.length;
        if (bodyLen > DEFAULT_READBODY_LIMIT) {
          req.removeListener('data', onData); 
          req.removeListener('end', onEnd);
          res.send(413, 'content too large');
        }
      };
      var onEnd = function() {
        req.body = Buffer.concat(body).toString();
        next();
        return;
      };
      req.on('data', onData).on('end', onEnd);
    }
  },

  //need to pass 'this' as a para rather than using .bind(this) which will also change the morgan and caused issue.
  injectHttpTransactionLog(_this) {
    const bzwLogger=new BzwLogging('httpRequest');

    //morgan.token('ip', (req) => req.headers['x-forwarded-for'] || req.connection.remoteAddress);
    morgan.token('clientIp', (req, res)=> {
          return _this.getNormalizeIP(req["_remoteAddress"])
     })
    morgan.token('date-componentName', ()=> {
      return _this.formatDate()+" "+ requestLog.componentName
    })
    
    morgan.token('user', (req, res)=> {
      //one options is get from cookies
      const authObj=req.session?(req.session["com.rs.ldapAuth"] 
      || req.session["com.rs.internalAuth"] 
      || req.session["com.rs.mssqlAuth"] 
      || req.session["com.rs.ssoAuth"]
      ||  req.session["com.rs.oAuth"]):'' 
      if(authObj){
        return authObj.userName  || '-'
      }else{
        return req.headers?.username || '-'
      }
      
    })


    const format='[:date-componentName] :clientIp :user :method :url - HTTP/:http-version :user-agent :status :response-time[digits]ms '
    //https://github.com/expressjs/morgan
    return morgan(format,{stream:bzwLogger.rotateLogStream()})
  }

}


function makeSubloggerFromDefinitions(pluginDefinition, serviceDefinition, name) {
  return global.COM_RS_COMMON_LOGGER.makeComponentLogger(pluginDefinition.identifier
      + "." + serviceDefinition.name + ':' + name);
}

const defaultOptions = {
  httpPort: 0,
  productCode: null,
  productDir: null,
  proxiedHost: null,
  proxiedPort: 0,
  oldRootRedirectURL: null,
  rootRedirectURL: null,
  rootServices: null,
  staticPlugins: null,
  newPluginHandler: null
};

function WebApp(options){
  this.expressApp = express();
  this.parser = new UAParser();
  let sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS;

  if(options.serverConfig?.adminConfig?.node) {
    Object.assign(options, options.serverConfig.adminConfig.node);
  }
  
  if (options.sessionTimeoutMs) {
    sessionTimeoutMs = options.sessionTimeoutMs;
  }
  const type = options.httpsPort ? 'https.' : 'http.';

  this.expressApp.use(session({
    //TODO properly generate this secret
    secret: process.env.expressSessionSecret ? process.env.expressSessionSecret : 'whatever',
    //secret: require('crypto').randomBytes(48).toString('hex'),
    store: require("./sessionStore").sessionStore,
    resave: true, saveUninitialized: false,
    name: 'session.bluezone.' + type +  (options.httpsPort || options.httpPort),
    cookie: {
      maxAge: sessionTimeoutMs,
      sameSite:'lax',
      httpOnly: true,
      secure:options.httpsPort?true:false
    }
  }));
  this.options = zluxUtil.makeOptionsObject(defaultOptions, options);
  this.auth = options.auth;
  expressWs(this.expressApp);
  this.expressApp.serverInstanceUID = Date.now(); // hack
  this.pluginRouter = express.Router();
  this.routers = {};
  this.appData = {
    webApp: {
      proxiedHost: options.proxiedHost,
    }, 
    plugin: {

    }
    //more stuff can be added
  };
  this.plugins = [];
  //hack for pseudo-SSO
  this.authServiceHandleMaps = {};
}
WebApp.prototype = {
  constructor: WebApp,
  options: null,
  expressApp: null,
  routers: null,
  appData: null,
  //hack for pseudo-SSO
  authServiceHandleMaps: null,

  toString() {
    return `[WebApp product: ${this.options.productCode}]`
  },
  
  makeProxy(urlPrefix, noAuth) {
    const r = express.Router();
    r.use(proxy.makeSimpleProxy(this.options.proxiedHost, this.options.proxiedPort, 
    {
      urlPrefix, 
      isHttps: false, 
      addProxyAuthorizations: (noAuth? null : this.auth.addProxyAuthorizations) 
    }));
    r.ws('/', proxy.makeWsProxy(this.options.proxiedHost, this.options.proxiedPort, 
        urlPrefix, false))
    return r;
  },
  
  makeExternalProxy(host, port, urlPrefix, isHttps, noAuth) {
    const r = express.Router();
    installLog.info(`Setting up proxy to ${host}:${port}/${urlPrefix}`);
    r.use(proxy.makeSimpleProxy(host, port, {
      urlPrefix, 
      isHttps, 
      addProxyAuthorizations: (noAuth? null : this.auth.addProxyAuthorizations),
      allowInvalidTLSProxy: this.options.allowInvalidTLSProxy
    }));
    return r;
  },
  
  installStaticHanders() {
    const bzdb = require('../../../../app/bzshared/lib/services/bzdb.service');
    const constants = require('../../../../app/bzshared/lib/services/constants.service');
    this.expressApp.get(
      `/${this.options.productCode}/plugins/com.rs.mvd/services/com.rs.mvd.ng2.module.ts`,
      staticHandlers.ng2TypeScript(this.options.staticPlugins.ng2));
    const webdir = path.join(path.join(this.options.productDir,
      this.options.productCode), 'web');
    const urlPrefix = this.options.serverConfig.node.urlPrefix || '' 
    const rootPage = this.options.rootRedirectURL? urlPrefix + this.options.rootRedirectURL : '/';
    // const rootPage = this.options.rootRedirectURL? this.options.rootRedirectURL : '/';
    const bzadmPage = this.options.bzadmRedirectURL;
    const that = this;
    if(!this.options.serverConfig.bzw2hMode){  // BZ-19070
      this.expressApp.options('*', cors()) // Enalbe cross origin preflight
    }

    this.expressApp.use(this.redirectToHttps.bind(this));

    if (rootPage != '/') {
      this.expressApp.post('/', urlencodedParser, (req, res) => { // BZ-20526, Support custom post data, Nissan North America Inc
        contentLogger.log(contentLogger.INFO, `installStaticHanders::post('/'), req.body is ${JSON.stringify(req.body)}`);
        if (req.session) {
          req.session[CUSTOM_POST_DATA] = req.body;
        }
        res.redirect('/');
      });
      //run into this only when URL is like http://localhost:8543
      this.expressApp.get('/', async(req, res) => {
        const dataserviceAuthentication=that.options.serverConfig && that.options.serverConfig.dataserviceAuthentication
        //currently, it supports auth type of 'internal and LDAP'
        const isHttpHeaderAuth = dataserviceAuthentication && dataserviceAuthentication.isHttpHeader;
        //only set this cookies when http header auth mode, if not , it will be always undefined
        if(isHttpHeaderAuth && req.headers['authorization']){
          res.cookie('http_auth_token', req.headers['authorization']);
        }
        let isEnableIframe=false;
        const isSso = dataserviceAuthentication && dataserviceAuthentication.defaultAuthentication === 'sso';
          if(isSso){
            const result=await bzdb.select("authConfig",constants.metaDataBackupPath.sso)
            if(result.data && Array.isArray(result.data) && result.data.length>0){
              const data= result.data[0];
              isEnableIframe= data && data.allow_iframe;
            }
          }
          // const isEnableIframe = () => {
          //   let ssoPath = path.join(process.cwd(), that.options.ssoConfigPath);
          //   if (fs.existsSync(ssoPath)) {
          //     const data = JSON.parse(fs.readFileSync(ssoPath));
          //     return data && data.allow_iframe;
          //   }
          //   return false;
          // };
        if (!isSso || isEnableIframe) {
          let tempUrl = url.parse(rootPage);
          tempUrl.query = Object.assign(querySetting.parse(url.parse(req.originalUrl).query), querySetting.parse(tempUrl.query));
          delete tempUrl.search;
          if(req.headers['authorization']){
            res.set({'authorization':req.headers['authorization']})
          }
          res.redirect(url.format(tempUrl));
        } else {
          const queryStr = req._parsedUrl.search ? req._parsedUrl.search : ''; // BZ-21116
          res.redirect(urlPrefix + that.options.ssoRedirectURL + queryStr);
        }
      });
      this.expressApp.get('/bzadmin', function(req,res) {
        const paths = req.url.split('?');
        let url = bzadmPage;
        if(paths.length > 1) {
          url += '?' + paths[1];
        }
        
        res.redirect(url);
      });
      
    }
    this.expressApp.use(rootPage, express.static(webdir));
  },

 

  installCommonMiddleware() {
    // if not,req["_remoteAddress"] will show the proxy IP, 
    // to get the real client IP, set this to ture.
    // also nginx need header of 'X-Forwarded-For'
    this.expressApp.set('trust proxy', true)

    this.expressApp.use(commonMiddleware.addAppSpecificDataToRequest(
      this.appData));

    // http request logging
    //don't bind this, or it will cause morgan does not work
    this.expressApp.use(commonMiddleware.injectHttpTransactionLog(this)); 
  
 

    //add security header first then go to checkAccessPermission, and then browserRestricion. 
    this.expressApp.use(this.setSecurityHeader.bind(this));
    
    if (this.inRestrictAccessMode()) {
      this.expressApp.use(this.checkAccessPermission.bind(this));
    }
    this.expressApp.use(this.browserRestricion.bind(this));


  },

  installRootServices() {
    const serviceHandleMap = {};
    for (const proxiedRootService of this.options.rootServices || []) {
      const name = proxiedRootService.name || proxiedRootService.url.replace("/", "");
      installLog.info(`installing root service proxy at ${proxiedRootService.url}`);
      //note that it has to be explicitly false. other falsy values like undefined
      //are treated as default, which is true
      if (proxiedRootService.requiresAuth === false) {
        const proxyRouter = this.makeProxy(proxiedRootService.url, true);
        this.expressApp.use(proxiedRootService.url,
            proxyRouter);
      } else {
        const proxyRouter = this.makeProxy(proxiedRootService.url);
        this.expressApp.use(proxiedRootService.url,
            this.auth.middleware,
            proxyRouter);
      }
      serviceHandleMap[name] = new WebServiceHandle(proxiedRootService.url, 
          this.options.httpPort);
    }
    this.expressApp.use(commonMiddleware.injectServiceHandles(serviceHandleMap,
        true));

    this.installOidcRouter();
    
    this.expressApp.post('/auth',
        jsonParser,
        (req, res, next) => {
          //hack for pseudo-SSO
          req[`${UNP.APP_NAME}Data`].webApp.authServiceHandleMaps = 
            this.authServiceHandleMaps;
          next();
        },
        this.auth.doLogin); 
    this.expressApp.get('/auth',
        jsonParser,
        (req, res, next) => {
          //hack for pseudo-SSO
          req[`${UNP.APP_NAME}Data`].webApp.authServiceHandleMaps = 
            this.authServiceHandleMaps;
          next();
        },
        this.auth.getStatus); 
    this.expressApp.get('/auth/types',
        jsonParser,
        (req, res, next) => {
          //hack for pseudo-SSO
          req[`${UNP.APP_NAME}Data`].webApp.authServiceHandleMaps = 
            this.authServiceHandleMaps;
          next();
        },
        this.auth.getAuthStatus);
    this.expressApp.post('/auth-logout',
        jsonParser,
        (req, res, next) => {
          //hack for pseudo-SSO
          req[`${UNP.APP_NAME}Data`].webApp.authServiceHandleMaps = 
            this.authServiceHandleMaps;
          next();
        },
        this.auth.doLogout); 
    // this.expressApp.get('/auth-logout',
    //     jsonParser,
    //     (req, res, next) => {
    //       //hack for pseudo-SSO
    //       req[`${UNP.APP_NAME}Data`].webApp.authServiceHandleMaps = 
    //         this.authServiceHandleMaps;
    //       next();
    //     },
    //     this.auth.doLogout); 
    serviceHandleMap['auth'] = new WebServiceHandle('/auth', 
        this.options.httpPort);
    this.expressApp.get('/plugins', 
        //this.auth.middleware, 
        staticHandlers.plugins(this.plugins));
    serviceHandleMap['plugins'] = new WebServiceHandle('/plugins', 
        this.options.httpPort);
    this.expressApp.get('/echo/*', 
      this.auth.middleware, 
      (req, res) =>{
        contentLogger.log(contentLogger.INFO, 'echo\n' + util.inspect(req));
        res.json(req.params);
      });
    serviceHandleMap['echo'] = new WebServiceHandle('/echo', 
        this.options.httpPort);
    this.expressApp.get('/echo/*',  
      this.auth.middleware, 
      (req, res) =>{
        contentLogger.log(contentLogger.INFO, 'echo\n' + util.inspect(req));
        res.json(req.params);
      });
    serviceHandleMap['echo'] = new WebServiceHandle('/echo', 
        this.options.httpPort);
    this.expressApp.use('/apiManagement/', 
        this.auth.middleware, 
        staticHandlers.apiManagement(this));
    serviceHandleMap['apiManagement'] = new WebServiceHandle('/apiManagement', 
        this.options.httpPort);
  },

  installOidcRouter() {
    const serverConfig = this.options.serverConfig;
    const twoFactor = serverConfig && serverConfig.dataserviceAuthentication && serverConfig.dataserviceAuthentication.twoFactorAuthentication;
    const isOktaMfa = twoFactor && twoFactor.enabled && twoFactor.defaultType === 'okta';
    if (isOktaMfa) {
      const config = twoFactor['okta'].config;
      const baseUrl = (config.loginCallback || '').replace('/authorization-code/callback', '');
      try {
        const oidcMiddleware = new ExpressOIDC({
          issuer: `${config.org_url}/oauth2/default`,
          client_id: config.client_id,
          client_secret: config.client_secret,
          appBaseUrl: baseUrl,
          redirect_uri: baseUrl,
          scope: 'openid profile',
          routes: {
            login: {
              path: '/okta'
            }
          }
        }).on('error', (err) => {
          utilLog.warn(`Okta MFA configuration error. Message=${err.message}`);
          utilLog.warn(`Okta MFA configuration error details:\n${err.stack}`);
        });
        this.expressApp.use(oidcMiddleware.router);
      }
      catch(err) {
        utilLog.warn(`Okta MFA configuration error. Message=${err.message}`);
        utilLog.warn(`Okta MFA configuration error details:\n${err.stack}`);
      }
    }
  },

  // Restrict Access Mode: specified IP could access RTE.
  inRestrictAccessMode() {
    const adminConfig = this.options.serverConfig.adminConfig;

    return adminConfig && adminConfig.restrictRemoteAddress;
  },

  // check which request has permission to access RTE
  checkAccessPermission(request, response, next) {
    const isAllowAccess = this.allowAccess(request, response);
    
    if(!isAllowAccess) {
      return;
    }

    next();
  },

  
  /**
   * 
   * @param {*} ips
   * @returns ip: string
   */
  getNormalizeIP(ips) {
    contentLogger.debug(`restrictRemoteAddress mode: client ip is ${ips}`);
    let ip = ips;
    if (ips.indexOf('::ffff:') === 0) {
        ip = ips.substring(7);
    }
    // for localhost
    if (ips === '::1') {
        ip = '127.0.0.1'
    }

    /**
     * X-Forwarded-For: client, proxy1, proxy2
     * the left-most is the original client
    */
    ip = ip.includes(',') ? ip.split(',')[0] : ip;

    /**
    * For some users, ip contains port, such as 10.0.0.1:8543, 
    * Check if port is included in ip: IPV4 has 2 parts and IPV6 has 9 parts.
    * if include port,  truncate to get ip
    */
    const ipParts = ip.split(':');
    if(ipParts.length == 2 || ipParts.length == 9) {
      ip = ip.substring(0, ip.lastIndexOf(':')); 
    }

    return ip;

  },


  formatDate(){
    var d = new Date();
    var msOffset = d.getTimezoneOffset()*60000;
    d.setTime(d.getTime()-msOffset);
    var dateString = d.toISOString();
    dateString = dateString.substring(0,dateString.length-1).replace('T',' ');
    return dateString;
  },

  
  /**
   * restrict remote address:
   *   1. restrictRemoteAddress: if it is true then go to this mode
   *   2. IPWhiteList: 
   *       if it is empty array, only allow localhost and 127.0.0.1
   *       if not empty, allow localhost, 127.0.0.1 and specific ips. 
   */
   allowAccess(request, response) {
    const adminConfig = this.options.serverConfig.adminConfig;
    const isBZAPath = request.url.includes('ZLUX/plugins/com.rs.bzadm/') || request.url.includes('/bzadmin')

    if(adminConfig && adminConfig.restrictRemoteAddress && isBZAPath) {
      const hostname = request.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      let ip = this.getNormalizeIP(request.headers['x-forwarded-for'] || request.ip);
      const isAllowedIP = adminConfig.IPWhiteList.length > 0 ? adminConfig.IPWhiteList.indexOf(ip) > -1 : false;

      if(!isLocalhost && !isAllowedIP) {
        response.status(403).send(`<html><body><h1> ${ACCESSMSG.error} </h1> <p>${ACCESSMSG.message}</p></body></html>`);
        return false; 
      }
    }

    return true
  },

  async redirectToHttps(request, response, next){
    if (request.originalUrl === this.options.oldRootRedirectURL){ // redirect the old RTEW url to new one.
      response.redirect(this.options.rootRedirectURL);
      return;
    }
    //build URL with urlPrefix
    let urlPrefix = this.options.serverConfig.node.urlPrefix
    if (urlPrefix && urlPrefix.length > 0 && request.url.startsWith(urlPrefix)){
      let newUrl = request.url.substring(urlPrefix.length)
      newUrl = newUrl.length === 0? '/': newUrl
      request.url = newUrl
    }
 
    if (request.secure) { //https request
      next();
    }else if(this.options.httpsPort){ //http request but https avalibale
      response.redirect(302,'https://'+request.hostname + ':' + this.options.httpsPort + request.url);
    }else{ // http
      next();
    }
  },

  browserRestricion(request, response, next){
    if (request.url.includes('ZLUX/plugins/com.rs.mvd/web/') || request.url.includes('ZLUX/plugins/com.rs.bzw/web/') || request.url.includes('ZLUX/plugins/com.rs.bzadm/web/')) {
      if (!request.url.includes('assets')) {
        const supportBrowser = ['Chrome', 'Firefox', 'Edge', 'Safari'];
        const broswer = this.getBrowserInformation(request);
        if (!supportBrowser.includes(broswer)) {
          let message = this.options.serverConfig.browserMessage ? this.options.serverConfig.browserMessage['message'] : DEFAULT_MESSAGE;
          response.send(message);
          return;
        }
      }
    }
    next();
  },

  async setSecurityHeader(request,response, next){
    if(this.options.serverConfig.securityHeader){ //enable HSTS  status=307
      const securityHeaderContent = this.options.serverConfig.securityHeader;
      response.set(securityHeaderContent);  
    }
    next();
  },

   /**
    * Get current broswer information
    * @param {*} request 
    */
    getBrowserInformation(request) {
     let ua = request.headers['user-agent'];
     let browserName = this.parser.setUA(ua).getBrowser().name
     browserName=browserName?browserName.toLowerCase():'';
     //let fullBrowserVersion = this.parser.setUA(ua).getBrowser().version;
     //let browserVersion = fullBrowserVersion.split(".", 1).toString();
     //let browserVersionNumber = Number(browserVersion);

     if (browserName.indexOf('ie') > -1)
       return 'IE';
     else if (browserName.indexOf('firefox') > -1 || browserName.indexOf('mozilla') > -1)
       return 'Firefox';
     else if (browserName.indexOf('chrome') > -1 || browserName.indexOf('chromium') > -1)
       return 'Chrome';
     else if (browserName.indexOf('edge') > -1)
       return 'Edge';
     else if (browserName.indexOf('safari') > -1)
       return 'Safari';
     else
       return 'Others';
   },

  _makeRouterForLegacyService(pluginContext, service) {
    const plugin = pluginContext.pluginDef;
    const subUrl = zLuxUrl.makeServiceSubURL(service);
    installLog.debug(plugin.identifier + ": service " + subUrl);
    const constructor = service.nodeModule[service.handlerInstaller];
    const router = express.Router();
    const urlSpec = "/" + this.options.productCode + "/plugins/" 
      + plugin.identifier + "/services/" + service.name + "/";
    const manager = {
      serverConfig:pluginContext.server.config.user,
      plugins:pluginContext.server.state.pluginMap,
      productCode:this.options.productCode
    };
    const handleWebsocketException = function(e, ws) {
      logException(e);
      try {
        ws.close(WEBSOCKET_CLOSE_INTERNAL_ERROR,JSON.stringify({ 
          error: 'Internal Server Error'
        }));
      } catch (closeEx) {
        logException(closeEx);
      }
    };
    const logException = function(e) {
      utilLog.warn(toString()+' Exception caught. Message='+e.message);
      utilLog.warn("Stack trace follows\n"+e.stack);
    };
    const toString = function() {
      return '[Service URL: '+urlSpec+']';
    };
    const legacyDataserviceAttributes = {
      logger: global.COM_RS_COMMON_LOGGER.makeComponentLogger(plugin.identifier
          + "." + service.name),
      toString: toString,
      urlSpec: urlSpec,
      makeSublogger(name) {
        return makeSubloggerFromDefinitions(plugin,service,name);
      },
      pluginDefinition: plugin,
      serviceDefinition: service,
      manager: manager
    };
    const handler = new constructor(service, service.methods, manager,
      legacyDataserviceAttributes);
    for (const methodUC of service.methods || []) {
      const method = methodUC.toLowerCase();
      if (!/^(get|post|put|delete|ws)$/.exec(method)) {
        installLog.warn(plugin.identifier + ": invalid method " + method);
        continue;
      }
      if (method === 'ws') {
        installLog.info(plugin.identifier + ": installing websocket service");
        router.ws('/',(ws,req) => {
          var session;
          try {
            session = handler.createSession(req);
          } catch (e) {
            handleWebsocketException(e,ws);
          }
          ws.on('message', function(msg) {
            try {
              session.handleWebsocketMessage(msg,ws);
            } catch (e) {
              handleWebsocketException(e,ws);
            }
          });
          
          ws.on('close', function(code, reason) {
            try {
              session.handleWebsocketClosed(ws, code, reason);
            } catch (e) {
              handleWebsocketException(e,ws);            
            }
          });
          
          if (session.handleWebsocketConnect) {
            session.handleWebsocketConnect(ws);
          }
        });
      } else {
        for (const route of [router.route('/'), router.route('/*')]) {
          if (method === "post" || method === "put") {
            route[method](commonMiddleware.readBody());
          }
          installLog.debug(`${plugin.identifier}: ${method} ${route.path} `
                           +` handled by ${service.handlerInstaller}`);
          route[method]((req, res) => {
            handler.handleRequest(req, res, req.body, req.path.substring(1));
          });
        }
      }
    }
    return router;
  },

  _installDataServices: function*(pluginContext, urlBase) {
    const plugin = pluginContext.pluginDef;
    if (!plugin.dataServicesGrouped) {
      return;
    }
    const serviceHandleMap = {};
    for (const service of plugin.dataServices) {
      const name = (service.type === "import")? service.localName : service.name;
      const handle = new WebServiceHandle(urlBase + "/services/" + name,
        this.options.httpPort);
      serviceHandleMap[name] = handle;
    }
    if (plugin.pluginType === 'nodeAuthentication') {
      //hack for pseudo-SSO
      this.authServiceHandleMaps[plugin.identifier] = serviceHandleMap;
    }
    const pluginChain = [
      commonMiddleware.injectPluginDef(plugin),
      commonMiddleware.injectServiceHandles(serviceHandleMap),
    ];
    let pluginRouters = this.routers[plugin.identifier];
    if (!pluginRouters) {
      pluginRouters = this.routers[plugin.identifier] = {};
    }
    if (plugin.dataServicesGrouped.proxy.length > 0) {
      for (const proxiedService of plugin.dataServicesGrouped.proxy) {
        const subUrl = urlBase + zLuxUrl.makeServiceSubURL(proxiedService);
        const proxyRouter = this.makeProxy(subUrl);
        const serviceRouterWithMiddleware = pluginChain.slice();
        serviceRouterWithMiddleware.push(commonMiddleware.injectServiceDef(
            proxiedService));
        serviceRouterWithMiddleware.push(this.auth.middleware);
        serviceRouterWithMiddleware.push(proxyRouter);
        installLog.info(`${plugin.identifier}: installing proxy at ${subUrl}`);
        this.pluginRouter.use(subUrl, serviceRouterWithMiddleware);
        pluginRouters[proxiedService.name] = serviceRouterWithMiddleware;
        //console.log(`service: ${plugin.identifier}[${proxiedService.name}]`);
      }
    }
    if (plugin.dataServicesGrouped.router.length > 0) {
      for (const routerService of plugin.dataServicesGrouped.router) {
        const subUrl = urlBase + zLuxUrl.makeServiceSubURL(routerService);
        const serviceConfiguration = configService.getServiceConfiguration(
          plugin.identifier,  routerService.name, 
          pluginContext.server.config.app, this.options.productCode);
        let router;
        let dataserviceContext = new DataserviceContext(routerService, 
            serviceConfiguration, pluginContext);
        if (typeof  routerService.nodeModule === "function") {
          router = yield routerService.nodeModule(dataserviceContext);
          installLog.info("Loaded Router for plugin=" + plugin.identifier 
              + ", service="+routerService.name + ". Router="+router);          
        } else {
          router = 
            yield routerService.nodeModule[routerService.routerFactory](
              dataserviceContext);
          installLog.info("Loaded Router from factory for plugin=" 
                          + plugin.identifier + ", service=" + routerService.name
                          + ". Factory="+routerService.routerFactory);
        }
        const serviceRouterWithMiddleware = pluginChain.slice();
        serviceRouterWithMiddleware.push(commonMiddleware.injectServiceDef(
            routerService));
        serviceRouterWithMiddleware.push(this.auth.middleware);
        serviceRouterWithMiddleware.push(router);
        installLog.info(`${plugin.identifier}: installing node router at ${subUrl}`);
        this.pluginRouter.use(subUrl, serviceRouterWithMiddleware);
        pluginRouters[routerService.name] = serviceRouterWithMiddleware;
        //console.log(`service: ${plugin.identifier}[${routerService.name}]`);
      }
    }
    if (plugin.dataServicesGrouped.node.length > 0) {
      for (const legacyService of plugin.dataServicesGrouped.node) {
        const subUrl = urlBase + zLuxUrl.makeServiceSubURL(legacyService);
        const serviceConfiguration = configService.getServiceConfiguration(
          plugin.identifier,  legacyService.name, 
          pluginContext.server.config.app, this.options.productCode);
        const serviceRouterWithMiddleware = pluginChain.slice();
        serviceRouterWithMiddleware.push(commonMiddleware.injectServiceDef(
            legacyService));
        serviceRouterWithMiddleware.push(this.auth.middleware);
        serviceRouterWithMiddleware.push(this._makeRouterForLegacyService(
            pluginContext, legacyService));
        installLog.info(
          `${plugin.identifier}: installing legacy service router at ${subUrl}`);
        this.pluginRouter.use(subUrl, serviceRouterWithMiddleware);
        pluginRouters[legacyService.name] = serviceRouterWithMiddleware;
       // console.log(`service: ${plugin.identifier}[${legacyService.name}]`);
      }
    }
    if (plugin.dataServicesGrouped.external.length > 0) {
      for (const externalService of plugin.dataServicesGrouped.external) {
        const subUrl = urlBase + zLuxUrl.makeServiceSubURL(externalService);
        const serviceRouterWithMiddleware = pluginChain.slice();
        serviceRouterWithMiddleware.push(commonMiddleware.injectServiceDef(
            externalService));
        serviceRouterWithMiddleware.push(this.auth.middleware);
        serviceRouterWithMiddleware.push(this.makeExternalProxy(
            externalService.host, externalService.port,
            externalService.urlPrefix, externalService.isHttps));
        installLog.info(`${plugin.identifier}: installing proxy at ${subUrl}`);
        this.pluginRouter.use(subUrl, serviceRouterWithMiddleware);
        pluginRouters[externalService.name] = serviceRouterWithMiddleware;
        //console.log(`service: ${plugin.identifier}[${externalService.name}]`);
      }
    }
  },

  /*
    Order of plugins given is expected to be in order of dependency, so a loop is not run on import resolution
   */
  resolveAllImports(pluginDefs) {
    let unresolvedPlugins = [];
    installLog.info(`Resolving imports for ${pluginDefs.length} remaining plugins`);
    pluginDefs.forEach((plugin) => {
      installLog.debug(
        `${plugin.identifier}: ${plugin.dataServicesGrouped? 'has' : 'does not have'}`
          + ' services')
      const urlBase = zLuxUrl.makePluginURL(this.options.productCode, 
                                            plugin.identifier);
      try {
        this._resolveImports(plugin, urlBase);
      } catch (e) {
        unresolvedPlugins.push(plugin);
      }
    });
    if (unresolvedPlugins.length === 0) {
      installLog.info(`All imports resolved for all plugins.`);
      return true;
    } else {
      installLog.info(`Unable to resolve imports for ${unresolvedPlugins.length} plugins.`);
      unresolvedPlugins.forEach((plugin)=> {
        installLog.info(`${plugin.identifier} has unresolved imports.`);
      });
      return false;
    }
  },

  _resolveImports(plugin, urlBase) {
    if (plugin.dataServicesGrouped  
        && plugin.dataServicesGrouped.import.length > 0) {
      for (const importedService of plugin.dataServicesGrouped.import) {
        const subUrl = urlBase 
          + zLuxUrl.makeServiceSubURL(importedService);
        const importedRouter = this.routers[importedService.sourcePlugin]
          [importedService.sourceName];
        if (!importedRouter) {
          throw new Error(
            `Import ${importedService.sourcePlugin}:${importedService.sourceName}`
            + " can't be satisfied");
        }
        installLog.info(`${plugin.identifier}: installing import`
           + ` ${importedService.sourcePlugin}:${importedService.sourceName} at ${subUrl}`);
        this.pluginRouter.use(subUrl, importedRouter);
        let pluginRouters = this.routers[plugin.identifier];
        if (!pluginRouters) {
          pluginRouters = this.routers[plugin.identifier] = {};
        }
        pluginRouters[importedService.sourceName] = importedRouter;
      }
    }
  },

  _installPluginStaticHandlers(plugin, urlBase) {
    installLog.info(`${plugin.identifier}: installing static file handlers...`);
    if (plugin.webContent && plugin.webContent.path) {
      let url = `${urlBase}/web`;
      installLog.info(`${plugin.identifier}: serving static files at ${url}`);
      //console.log(url, plugin.webContent.path);
      this.pluginRouter.use(url, express.static(plugin.webContent.path));
    }
    if (plugin.pluginType === "library") {
      let url = `/lib/${plugin.identifier}/${plugin.libraryVersion}`;
      installLog.info(`${plugin.identifier}: serving library files at ${url}`);
      this.pluginRouter.use(url, express.static(plugin.location));
    }
  },
  
  _installSwaggerCatalog(plugin, urlBase) {
    const router = makeSwaggerCatalog(plugin, 
        this.options.productCode);
    this.pluginRouter.use(zLuxUrl.join(urlBase, '/catalogs/swagger'),
        router);
  },

  injectPluginRouter() {
    this.expressApp.use(this.pluginRouter);
  },
  
  installPlugin: Promise.coroutine(function*(pluginContext) {
    const plugin = pluginContext.pluginDef;
    installLog.debug(
      `${plugin.identifier}: ${plugin.dataServicesGrouped? 'has' : 'does not have'}`
      + ' services')
    const urlBase = zLuxUrl.makePluginURL(this.options.productCode, 
        plugin.identifier);
    this._installSwaggerCatalog(plugin, urlBase);
    this._installPluginStaticHandlers(plugin, urlBase);
    try {
      yield *this._installDataServices(pluginContext, urlBase);
    } catch (e) {
      installLog.warn(e.stack);
    }
    //import resolution will be postponed until all non-import plugins are loaded
    this.plugins.push(plugin);
  }),

  installErrorHanders() {
    this.expressApp.use((req, res, next) => {
      do404(req.url, res, this.options.productCode
          + ": unknown resource requested");
    });
//      if (!next) {
//        // TODO how was this tested? I'd say it never happens: `next` is always 
//        // there - it's Express's wrapper, not literally the next user middleware
//        // piece, as one might think (note that you call it without params, not like
//        // next(req, res, ...))
//
//      } else {
//        return next();
//      }
  }
};

module.exports.makeWebApp = function (options) {
  const webApp = new WebApp(options);
  webApp.installCommonMiddleware();
  webApp.installStaticHanders();
  webApp.installRootServices();
  webApp.injectPluginRouter();
  webApp.installErrorHanders();
  return webApp;
};

/*
  This program and the accompanying materials are
  made available under the terms of the Eclipse Public License v2.0 which accompanies
  this distribution, and is available at https://www.eclipse.org/legal/epl-v20.html
  
  SPDX-License-Identifier: EPL-2.0
  
  Copyright Contributors to the Zowe Project.
*/

