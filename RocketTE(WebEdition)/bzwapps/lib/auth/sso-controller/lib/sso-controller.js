'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const saml2 = require("saml2-js");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const bzdb = require('../../../../app/bzshared/lib/services/bzdb.service');
const constants = require('../../../../app/bzshared/lib/services/constants.service');
const authConfigSvc = require('../../../../app/bzshared/lib/services/authConfigService');
const UserVarSvc = require('../../../../app/bzshared/lib/dist/user-var-service');
const CUSTOM_POST_DATA = 'custPostData';
let tmpXML = '';
let proxyServerHome = '../../../../zlux-proxy-server/';
if (process.env.APP_MODE && process.env.APP_MODE === 'STANDALONE')
    proxyServerHome = '../../../../lib/zlux/zlux-proxy-server/';
const encryption = require(proxyServerHome + 'js/encryption');
// import SamlHelper from '../../SamlHelper';
const errorRes = `
<div style="
    /* margin-top: 100px; */
    /* vertical-align: middle; */
    margin: auto;
    width: 50%;
    border: 3px solid #ff5722ba;
    padding: 10px;
    color: white;
    font-size: large;
    position: relative;
    margin-top: 100px;
    background-color: gray;
    ">
  <font style="font-size: x-large;">Error on server side: </font> </br>
  #ERRORFONT#
</div>`;
class Saml2jsSsoAuthController {
    constructor(context) {
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.key = {};
        const user = this.context.plugin.server.config.user;
        const urlPrefix = user.node.urlPrefix || '';
        this.redirectUrl = urlPrefix + (this.context.plugin.server.config.user.bzw2hMode ? '/ZLUX/plugins/com.rs.bzw2h/web/' : '/ZLUX/plugins/com.rs.bzw/web/');
        let productDir = user.productDir;
        let instanceDir = user.instanceDir;
        let productCode = user.productCode;
        let configDir = 'pluginStorage/com.rs.ssoAuth/_internal/plugin/ssoServerConfig.json';
        const configFile = `${instanceDir}/${productCode}/${configDir}`;
        this.mapCustomData = new Map();
        this.userVarSvc = UserVarSvc.init(context); // BZ-19424, script variable
        // if (fs.existsSync(configFile)) {
        //   this.authConfig = jsonUtils.parseJSONWithComments(configFile);
        // }
        bzdb.select("authConfig", constants.metaDataBackupPath.sso).then(result => {
            if (result.data && Array.isArray(result.data)) {
                this.authConfig = result.data[0];
                this.createProvider(this.authConfig).then(data => {
                    this.sp = data.sp;
                    this.idp = data.idp;
                });
            }
        });
    }
    purgeMapCustomData() {
        const maxAge = 10 * 60 * 1000;
        const now = Date.now();
        this.mapCustomData.forEach((value, key, map) => {
            if ((now - value.ts) > maxAge) {
                map.delete(key);
            }
        });
    }
    getCustomDataFromSamlResponse(samlRes) {
        let rtn = {
            ts: 0,
            custData: {},
            query: ''
        };
        const resId = samlRes.response_header ? samlRes.response_header.in_response_to : '';
        if (resId) {
            const obj = this.mapCustomData.get(resId);
            if (obj) {
                rtn = obj; // BZ-21116, support ?groupName=xxx for other auth
                this.mapCustomData.delete(resId);
            }
        }
        return rtn;
    }
    async createProvider(authConfig) {
        if (!authConfig)
            return {};
        const handleFilePath = (fileName) => (fileName.includes('/') ? path.resolve(`${fileName}`) : path.resolve(`${serverConfigDir}/${fileName}`));
        const user = this.context.plugin.server.config.user;
        const productDir = user.productDir;
        const productCode = user.productCode;
        const serverConfigDir = `${productDir}/${productCode}/serverConfig`;
        this.login_id = authConfig.login_user_id;
        const sp = authConfig.sp;
        let sp_options = {
            entity_id: authConfig.sp.entity_id,
            // private_key: this.authConfig.sp.private_key ? fs.readFileSync("" + this.authConfig.sp.private_key).toString() : '',
            // certificate: this.authConfig.sp.certificate ? fs.readFileSync("" + this.authConfig.sp.certificate).toString() : '', 
            //private_key: authConfig.sp.private_key ? fs.readFileSync(handleFilePath(sp.private_key)).toString() : '',
            //certificate: authConfig.sp.certificate ? fs.readFileSync(handleFilePath(sp.certificate)).toString() : '',
            private_key: await this.getFileContent(sp.private_key),
            certificate: await this.getFileContent(sp.certificate),
            assert_endpoint: authConfig.sp.assert_endpoint,
            notbefore_skew: parseInt(authConfig.sp.notbefore_skew, 10),
            allow_unencrypted_assertion: authConfig.allow_unencrypted_assertion,
            force_authn: authConfig.force_authn,
            sign_get_request: authConfig.sign_get_request
        };
        if (sp.audience) {
            sp_options['audience'] = sp.audience;
        }
        if (sp.nameid_format) {
            sp_options['nameid_format'] = sp.nameid_format;
        }
        if (sp.alt_private_keys && sp.alt_private_keys.length > 0) {
            sp_options['alt_private_keys'] = [];
            sp.alt_private_keys.forEach(async (pKey) => {
                let str = await this.getFileContent(pKey);
                sp_options['alt_private_keys'].push(str);
            });
            //sp_options['alt_private_keys'] = sp.alt_private_keys.map(async pKey => await this.getFileContent(pKey))
        }
        if (sp.alt_certs && sp.alt_certs.length > 0) {
            sp_options['alt_certs'] = [];
            sp.alt_certs.forEach(async (cert) => {
                let str = await this.getFileContent(cert);
                sp_options['alt_certs'].push(str);
            });
        }
        // Create identity provider
        const idp_options = {
            sso_login_url: authConfig.idp.sso_login_url,
            sso_logout_url: authConfig.idp.sso_logout_url,
            // certificates: this.authConfig.idp.certificates ? [fs.readFileSync(path.resolve("" + this.authConfig.idp.certificates)).toString()] : '',
            //certificates: authConfig.idp.certificates ? [fs.readFileSync(handleFilePath(authConfig.idp.certificates)).toString()] : [''],
            certificates: await this.getFileContent(authConfig.idp.certificates),
            auth_context: authConfig.idp.auth_context,
            allow_unencrypted_assertion: authConfig.allow_unencrypted_assertion,
            force_authn: authConfig.force_authn,
            sign_get_request: authConfig.sign_get_request
        };
        return {
            sp: new saml2.ServiceProvider(sp_options),
            idp: new saml2.IdentityProvider(idp_options)
        };
    }
    printContext() {
        this.logger.info(JSON.stringify(this.context));
    }
    /**
      * Gettor of the router
      */
    getRouter() {
        return this.router;
    }
    ;
    setupAcctRouter() {
        const logger = this.logger;
        const router = this.router;
        const context = this.context;
        logger.info('Setup session mode router');
        router.use(bodyParser.urlencoded({ extended: false }));
        router.use(bodyParser.json({ type: 'application/json' }));
        router.use(bodyParser.text({ type: 'text/plain' }));
        // router.use(session({
        //   secret: this.key,
        //   cookie: { maxAge: 60000 },
        //   resave: true,
        //   saveUninitialized: true
        // }));
        router.get('/metadata.xml', (req, res) => {
            res.type('application/xml');
            res.send(this.sp.create_metadata());
        });
        router.post('/metadata', async (req, res) => {
            res.set('Content-Type', 'text/xml');
            const data = await this.createProvider(req.body);
            tmpXML = data.sp.create_metadata();
            const result = data.sp == null ? { status: 'error', data: "no Service Provider" } : { status: 'success', data: data.sp.create_metadata() };
            res.send(result);
        });
        router.get('/metadata', (req, res) => {
            res.set('Content-Type', 'text/xml');
            res.send(tmpXML);
        });
        // Starting point for login
        router.get("/login", (req, res) => {
            const that = this;
            try {
                this.sp.create_login_request_url(this.idp, {}, (err, login_url, request_id) => {
                    if (err != null) {
                        return res.send(500);
                    }
                    const obj = {
                        ts: Date.now(),
                        custData: {},
                        query: ''
                    };
                    if (req.session && req.session[CUSTOM_POST_DATA]) { // BZ-20526, Support custom post data, Nissan North America Inc
                        obj.custData = req.session[CUSTOM_POST_DATA];
                    }
                    if (req._parsedUrl.search) { // BZ-21116, support ?groupName=xxx for other auth
                        obj.query = req._parsedUrl.search;
                    }
                    that.purgeMapCustomData();
                    that.mapCustomData.set(request_id, obj);
                    res.redirect(login_url);
                });
            }
            catch (err) {
                return res.send(500).send(err);
            }
        });
        // Assert endpoint for when login completes
        router.post("/assert", (req, res) => {
            var options = { request_body: req.body };
            const that = this;
            this.sp.post_assert(this.idp, options, async (err, saml_response) => {
                if (err != null) {
                    const errMsg = err.stack ? err.stack : err.message ? err.message : err;
                    that.logger.severe('Error encountered while SAML assertion!');
                    that.logger.severe(errMsg);
                    let errfont = `<font style="margin-top:5px;">${errMsg}</font>`;
                    if (err.stack) {
                        errfont = errfont.replace(/    at/g, '<br>    at');
                    }
                    return res.status(500).send(errorRes.replace('#ERRORFONT#', errfont));
                }
                else {
                    // Save name_id and session_index for logout
                    // Note:  In practice these should be saved in the user session, not globally.
                    that.logger.log(that.logger.FINEST, 'SAML response: ' + JSON.stringify(saml_response));
                    if (saml_response.type !== 'authn_response') //BZ-19628 Ignore logout_request & logout_response
                     {
                        that.logger.info('Skip SAML response type: ' + saml_response.type);
                        return res.status(200);
                    }
                    let user_id = saml_response.user ? saml_response.user[this.login_id] : null;
                    // sometimes, the login id is saved in saml_response.user.attributes
                    if (!user_id && saml_response.user && saml_response.user.attributes && saml_response.user.attributes[this.login_id]) {
                        const attributes_id = saml_response.user.attributes[this.login_id];
                        user_id = Array.isArray(attributes_id) ? attributes_id[0] : attributes_id;
                    }
                    if (!user_id) {
                        that.logger.warn(`SSO didn't return expected field. Expected field: ${this.login_id}, SSO response: ${JSON.stringify(saml_response)}`);
                        const errfont = `<font style="margin-top:5px;">The expected response field \"${this.login_id}\" not exist in SSO data. Please contact your administrator to fix SSO configuration.</font>`;
                        return res.status(500).send(errorRes.replace('#ERRORFONT#', errfont));
                    }
                    user_id = user_id.toLowerCase();
                    const authentication = encryption.encryptWithKeyAndIV(user_id, encryption.rKey, encryption.rIV);
                    if (!authentication)
                        return;
                    that.name = saml_response.user.name;
                    that.name_id = saml_response.user.name_id;
                    that.session_index = saml_response.user.session_index;
                    let ssoAttr = '';
                    const data = authConfigSvc.setSsoAttrs(req, res, saml_response.user.attributes, user_id);
                    if (data.attrLen > 1) {
                        this.logger.warn(`The user's attributes in sso are too long to save, more than 2048. attr length after stringify is ${data.attrLen}`);
                    }
                    else if (data.attrLen === 1) {
                        this.logger.warn(`There is something wrong in encryption, the data is  ${JSON.stringify(saml_response.user.attributes)}`);
                    }
                    else {
                        ssoAttr = data.attr;
                    }
                    authConfigSvc.setSsoAssert(req, res, authentication); //save assert
                    that.key = { user_id: user_id };
                    const samlCookie = JSON.stringify(that.key);
                    const ssoObj = that.getCustomDataFromSamlResponse(saml_response); // BZ-21116, support ?groupName=xxx for other auth
                    await that.userVarSvc.setVars4Saml(user_id, ssoObj.custData, saml_response); // BZ-19424, script variable
                    if (req.secure) { // https
                        res.cookie('saml', samlCookie, { sameSite: 'none', secure: true });
                        res.redirect(this.redirectUrl + ssoObj.query); // BZ-21116, support ?groupName=xxx for other auth
                    }
                    else if (!this.authConfig.allow_iframe) { // http + not iframe
                        res.cookie('saml', samlCookie);
                        res.redirect(this.redirectUrl + ssoObj.query); // BZ-21116, support ?groupName=xxx for other auth
                    }
                    else { // http + iframe
                        res.send(`<script> document.cookie = "saml=${encodeURIComponent(samlCookie)};path=/";
              document.cookie = "rte.cluster.sso.attr=${encodeURIComponent(ssoAttr)};path=/";
              document.cookie = "rte.cluster.sso.auth=${encodeURIComponent(authentication)};path=/";</script>`);
                    }
                    // ssoService.assertSso(req, result);
                    // res.render(redirectPage, {title: 'SAML Authentication Success', status: 'Success'});
                    // res.send();
                    // });
                }
            });
        });
        router.get("/assert", (req, res) => {
            var options = { request_body: req.query };
            const that = this;
            this.sp.redirect_assert(this.idp, options, async (err, saml_response) => {
                if (err != null) {
                    const errMsg = err.stack ? err.stack : err.message ? err.message : err;
                    that.logger.severe('Error encountered while SAML assertion!');
                    that.logger.severe(errMsg);
                    let errfont = `<font style="margin-top:5px;">${errMsg}</font>`;
                    if (err.stack) {
                        errfont = errfont.replace(/    at/g, '<br>    at');
                    }
                    return res.status(500).send(errorRes.replace('#ERRORFONT#', errfont));
                }
                else {
                    // Save name_id and session_index for logout
                    // Note:  In practice these should be saved in the user session, not globally.
                    that.logger.log(that.logger.FINEST, 'SAML response: ' + JSON.stringify(saml_response));
                    if (saml_response.type !== 'authn_response') //BZ-19628 Ignore logout_request & logout_response
                     {
                        that.logger.info('Skip SAML response type: ' + saml_response.type);
                        return res.status(200);
                    }
                    let user_id = saml_response.user ? saml_response.user[this.login_id] : null;
                    // sometimes, the login id is saved in saml_response.user.attributes
                    if (!user_id && saml_response.user && saml_response.user.attributes && saml_response.user.attributes[this.login_id]) {
                        const attributes_id = saml_response.user.attributes[this.login_id];
                        user_id = Array.isArray(attributes_id) ? attributes_id[0] : attributes_id;
                    }
                    if (!user_id) {
                        that.logger.warn(`SSO didn't return expected field. Expected field: ${this.login_id}, SSO response: ${JSON.stringify(saml_response)}`);
                        const errfont = `<font style="margin-top:5px;">The expected response field \"${this.login_id}\" not exist in SSO data. Please contact your administrator to fix SSO configuration.</font>`;
                        return res.status(500).send(errorRes.replace('#ERRORFONT#', errfont));
                    }
                    user_id = user_id.toLowerCase();
                    const authentication = encryption.encryptWithKeyAndIV(user_id, encryption.rKey, encryption.rIV);
                    // that._addIVAndAuthToObject(object, user_id, async (result) => {
                    if (!authentication)
                        return;
                    authConfigSvc.setSsoAssert(req, res, authentication); //save assert
                    that.name = saml_response.user.name;
                    that.name_id = saml_response.user.name_id;
                    that.session_index = saml_response.user.session_index;
                    that.key = { user_id: user_id };
                    authConfigSvc.setSsoAssert(req, res, authentication);
                    const samlCookie = JSON.stringify(that.key);
                    const ssoObj = that.getCustomDataFromSamlResponse(saml_response); // BZ-21116, support ?groupName=xxx for other auth
                    await that.userVarSvc.setVars4Saml(user_id, ssoObj.custData, saml_response); // BZ-19424, script variable
                    if (req.secure) { // https
                        res.cookie('saml', samlCookie, { sameSite: 'none', secure: true });
                    }
                    else if (!this.authConfig.allow_iframe) { // http + not iframe
                        res.cookie('saml', samlCookie);
                    }
                    else { // http + iframe
                        res.send(`<script> document.cookie = "saml=${encodeURIComponent(samlCookie)};path=/" </script>`);
                    }
                    // ssoService.assertSso(req, result);
                    // res.render(redirectPage, {title: 'SAML Authentication Success', status: 'Success'});
                    // res.send();
                    // });
                }
            });
        });
        // Starting point for logout
        router.get("/logout", (req, res) => {
            var options = {
                name_id: this.name_id,
                session_index: this.session_index
            };
            this.sp.create_logout_request_url(this.idp, options, (err, logout_url) => {
                if (err != null)
                    return res.send(500);
                res.redirect(logout_url);
            });
        });
        // logout from OKTA.
        router.post("/logout", (req, res) => {
            this.logger.log('Logout from OKTA.' + res);
        });
    }
    // _addIVAndAuthToObject (input, value ,callback) {
    //   var saltBytes = new Array(16);
    //   for (let i = 0; i < 16; i++) {
    //     var num = rString.charCodeAt(Math.round(Math.random() * 62));
    //     var randChar = value.charCodeAt(Math.round(Math.random() * value.length));
    //     saltBytes[i] = (num > randChar) ? num : randChar;
    //   }
    //   var salt = String.fromCharCode.apply(null,saltBytes);
    //   var ivBytes = new Array(16);
    //   for (let i = 0; i < 16; i++) {    
    //     ivBytes[i] = rString.charCodeAt(Math.round(Math.random() * 62));
    //   }
    //   var iv = String.fromCharCode.apply(null,ivBytes);
    //   encryption.getKeyFromPassword(value,salt,32,(key)=>{
    //     try {
    //       input.authentication = encryption.encryptWithKeyAndIV(value,key,iv);
    //       input.iv = encryption.encryptWithKeyAndIV(iv,rKey,rIV);
    //       input.salt = encryption.encryptWithKeyAndIV(salt,rKey,rIV);
    //       this.logger.log(this.logger.FINEST, 'SAML user id object: ' + JSON.stringify(input));
    //       callback(input);
    //     }
    //     catch (e) {
    //       callback(null);
    //     }
    //   });
    // };
    async getFileContent(fileName) {
        let fileStr = "";
        try {
            if (fileName.includes('/')) {
                fileName = fileName.substring(fileName.lastIndexOf("/") + 1);
            }
            let obj = await bzdb.select('upload', { "fileName": fileName });
            if (obj.data.length > 0)
                fileStr = Buffer.from(JSON.parse(obj.data[0].data), 'utf8').toString(); // JSTE-13730
        }
        catch (err) {
            this.logger.severe('Error read file ' + fileName);
        }
        return fileStr;
    }
}
exports.ssoAuthRouter = (context) => {
    return new Promise(function (resolve, reject) {
        let controller = new Saml2jsSsoAuthController(context);
        controller.setupAcctRouter();
        resolve(controller.getRouter());
    });
};
//# sourceMappingURL=sso-controller.js.map