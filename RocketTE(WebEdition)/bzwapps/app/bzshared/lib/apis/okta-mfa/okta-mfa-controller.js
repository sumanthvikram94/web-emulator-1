'use strict';

const express = require('express');
const request = require('request');
const { ExpressOIDC } = require('@okta/oidc-middleware');

class OktaMfaController {
    constructor(context) {
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.userConfig = context.plugin.server.config.user;
        const authConfig = this.userConfig.dataserviceAuthentication.twoFactorAuthentication;
        const oktaEnabled = authConfig && authConfig.enabled && authConfig.defaultType === 'okta'; // JSTE-16597, twoFactorAuthentication could be undefined.
        const oktaConfig = authConfig && authConfig.okta && authConfig.okta.config;
        try {
            if (oktaEnabled && oktaConfig) {
                const baseUrl = (oktaConfig.loginCallback || '').replace('/authorization-code/callback', '');
                this.oidcOptions = {
                    issuer: `${oktaConfig.org_url}/oauth2/default` || '{yourOktaDomain}',
                    client_id: oktaConfig.client_id || '{client_id}',
                    client_secret: oktaConfig.client_secret || '{clientSecret}',
                    appBaseUrl: baseUrl || '{appBaseUrl}',
                    redirect_uri: baseUrl || '{redirectUri}',
                    scope: 'openid profile',
                    routes: {
                      login: {
                        path: '/okta'
                      }
                    }
                };
                this.oidcMiddleware = new ExpressOIDC(this.oidcOptions)
                .on('error', (err) => {
                    this.logger.warn(`Okta MFA configuration error. Message=${err.message}`);
                    this.logger.warn(`Okta MFA configuration error details:\n${err.stack}`);
                  });
            }
        }
        catch(err) {
            this.logger.warn(`Okta MFA configuration error. Message=${err.message}`);
            this.logger.warn(`Okta MFA configuration error details:\n${err.stack}`);
        }

    }

    printContext() {
        this.logger.info(JSON.stringify(this.context));
    }

    /**
     * Gettor of the router
     */
    getRouter() {
        return this.router;
    };

    setupOktaMfaRouter() {
        const logger = this.logger;
        const router = this.router;
        logger.info('Setup okta mfa router');

        // get appBaseUrl and redirect_uri from request
        // router.use('/', (req, res, next) => {
        //     const currentUrl = this.getCurrentUrl(req);
        //     if (!this.oidcMiddleware || this.oidcOptions.appBaseUrl !== currentUrl) {
        //         this.oidcOptions.appBaseUrl = currentUrl;
        //         this.oidcOptions.redirect_uri = currentUrl;
        //         this.oidcMiddleware = new ExpressOIDC(this.oidcOptions);
        //     }
        //     next();
        // }, (req, res, next) => {
        //     if (this.oidcMiddleware) {
        //         (this.oidcMiddleware.ensureAuthenticated())(req, res, next);
        //     } else {
        //         next();
        //     }
        // });

        router.use('/', (req, res, next) => {
            if (this.oidcMiddleware) {
                (this.oidcMiddleware.ensureAuthenticated())(req, res, next);
            } else {
                next();
            }
        });

        router.get('/', (req, res) => {
            try {
                // const baseUrl = this.getCurrentUrl(req);
                const requestOpts = {
                    method: 'POST',
                    // url: `${baseUrl}/auth`,
                    url: `${this.oidcOptions.redirect_uri}/auth`,
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Cookie: req.headers.cookie
                    },
                    body: JSON.stringify({
                        oktapassed: true,
                        userId: req.query.username
                    })
                }
                if (req.protocol.toLocaleLowerCase().indexOf('https') > -1) {
                    Object.assign(requestOpts, { "agentOptions": { "rejectUnauthorized": false } });  //todo, use this to https error CERT_HAS_EXPIRED   
                }
                request(requestOpts, (err, response, body) => {
                    if (err) {
                        this.logger.severe('okta mfa failed: ' + err.stack ? err.stack : (err.message ? err.message : err));
                        return res.status(500).json({ status: false, message: 'Failed to set login status' });
                    }
                    console.log(res.req.session.cookie);
                    const redirectUrl = this.context.plugin.server.config.user.bzw2hMode ? '/ZLUX/plugins/com.rs.bzw2h/web/' : '/ZLUX/plugins/com.rs.bzw/web/';
                    res.redirect(redirectUrl);
                })
            } catch (err) {
                this.logger.severe('okta mfa failed: ' + err.stack ? err.stack : (err.message ? err.message : err));
                return res.status(500).json({ status: false, message: err.stack ? err.stack : (err.message ? err.message : err) });
            }
        });
    }

    // getCurrentUrl(req) {
    //     const protocol = req.protocol;
    //     const host = req.hostname || req.host;
    //     const port = req.headers.port ? req.headers.port : this.userConfig.node[protocol].port;
    //     return `${protocol}://${host}:${port}`;
    // }
}

exports.oktaMfaRouter = (context) => {
    return new Promise(function (resolve, reject) {
        let controller = new OktaMfaController(context);
        controller.setupOktaMfaRouter();
        resolve(controller.getRouter());
    });
};