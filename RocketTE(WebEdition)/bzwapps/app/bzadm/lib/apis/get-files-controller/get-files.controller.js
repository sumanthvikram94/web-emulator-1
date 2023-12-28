'use strict';

/**
 * Name:      session-mode-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */

const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');

const GROUP_PATH = '/groups';
const SESSION_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessions';
const USER_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/users';
const SETTINGS_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';
const KEYBOARD_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings/keyboardmapping';
const KEYBOARDMAPPING = "/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings/keyboardMapping.json";
const SESSIONSETTINGSMAPPING = "/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings/sessionSettingMapping.json";
const GROUP_FILTER = 'group_';
const SESSION_FILTER = 'session_';
const USER_FILTER = 'userInfo_';
const DEFAULT_GROUP_FILTER = 'group_Default Group';
const KEYBOARD_FILTER = 'keyboard_';
const SETTINGS_FILTER = 'settings_';
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const BZA_DEFAULT_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/defaults';

class GetFilesRouter {


    constructor(context) {
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.productPath = this.context.plugin.server.config.user.productDir;
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

    getFilesRouter() {
        const logger = this.logger;
        const router = this.router;
        // const context = this.context;
        logger.info('Setup get files router');

        router.use(bodyParser.json({ type: 'application/json' }));
        router.use(oAuth.defaultOAuthChecker());

        /**
         * Request:     FolderFilesRouter for BlueZone Admin api. 
         * Description: Simply response a fixed text.
         * Authorize:   Any user???
         */
        router.get('/', (req, res) => {
            // this.syncApi();
            const dirs = this.getDir(req);
            const dir = this.instanceDir + dirs.dir;
            const filterName = dirs.filter;
            const type = req.query.path;

            res.setHeader("Content-Type", "text/typescript");

            //BZ-12476  //get BZDT profile
            if (type == 'bzd') {
                let filePath = path.join(dir, encodeURIComponent(filterName));
                if (!fs.existsSync(filePath)) {
                    res.status(404).send('File Not Found.');
                } else {
                    res.download(filePath);
                }
                return;
            }

            this.getData(dir, filterName).then(data => {
                let text = {};
                try {
                    text = this.isMappingData(filterName) ? JSON.parse(data) : data;
                    res.status(200).json({ 'text': text });
                    logger.info(`Get ${type} files from ${dir} successful`);
                    logger.debug(`Get ${type} file(s) successful: ${JSON.stringify(text)}`);
                } catch (err) {
                    logger.severe(`Get ${type} file(s) fail: ${data}`);
                    this.logger.severe('getData() occurs error: ' + err.stack);
                    res.status(500).json({ 'text': text });

                }
            })
                .catch(error => {
                    const message = error && error.message || 'Exception occurs';
                    logger.severe(`Get ${type} files from ${dir} failed: ${message}`)
                    
                    res.status(404).json({ 'text': `Get files failed!` });
                });
        });
        router.get('/defaultCiphers', async (req, res) => {
            try {
                const path =`${this.productPath}${BZA_DEFAULT_PATH}/defaultCipherList.json`;
                if (!fs.existsSync(path)) {
                    res.status(404).send('File Not Found.');
                }
                let data = await this.readFilePromise(path);
                res.status(200).json({ 'data': JSON.parse(data) });
                logger.info(`Get defaultCipherList.json files from ${path} successful`);
                logger.debug(`Get defaultCipherList.json file(s) successful: ${JSON.stringify(data)}`);
            } catch (err) {
                res.status(404).json({ 'text': `Get files failed!` });
                logger.severe(`Get defaultCipherList.json file(s) fail`);
            }
        });
    }

    getDir(req) {
        if (req.query.path === 'group') {
            return {
                dir: GROUP_PATH,
                filter: GROUP_FILTER
            }
        } else if (req.query.path === 'session') {
            return {
                dir: SESSION_PATH,
                filter: SESSION_FILTER
            }
        } else if (req.query.path === 'user') {
            return {
                dir: USER_PATH,
                filter: USER_FILTER
            }
        } else if (req.query.path === 'default_group') {
            return {
                dir: GROUP_PATH,
                filter: DEFAULT_GROUP_FILTER
            };
        } else if (req.query.path === 'keyboard') {
            let filter = req.query.filter ? req.query.filter : KEYBOARD_FILTER;
            return {
                dir: KEYBOARD_PATH,
                filter: filter
            };
        } else if (req.query.path === 'settings') {
            return {
                dir: SETTINGS_PATH,
                filter: SETTINGS_FILTER
            };
        } else if (req.query.path === 'bzd') {  //BZ-12476
            return {
                dir: SESSION_PATH,
                filter: req.query.filter
            }
        }

    }

    isMappingData(name) {
        return (['keyboard_', 'settings_'].indexOf(name) > -1)
    }

    async getData(dir, subName) {
        if (this.isMappingData(subName)) {
            const subType = subName.indexOf('keyboard') > -1 ? KEYBOARDMAPPING : SESSIONSETTINGSMAPPING;

            if(subName.indexOf('keyboard') > -1 || subName.indexOf('settings')>-1){  //move to BZDB
                const list = await bzdb.select(subName.indexOf('keyboard') > -1 ? 'keyboardMapping': 'sessionSettingMapping');
                return JSON.stringify(list.data || []);
            }else{
                if (!fs.existsSync(this.instanceDir + subType)) {
                    return JSON.stringify([]);
                }else{
                    return await this.readFilePromise(path.resolve(this.instanceDir + subType), 'utf8');
                }
            }
        }
        let dataArray = [];
        if(dir.indexOf('keyboardmapping') > -1 && subName){
            let result= await bzdb.select("keyboardMappingShared",{id:subName.substr(2)}); //K_BZAM0000001, change to BZAM0000001
            if(result.data.length>0){
                dataArray.push(result.data[0]);
            }
        }else{
            let files = this.getFiles(dir) || [];
            if (subName === DEFAULT_GROUP_FILTER) {
                files = files.filter(file => (subName.length && file === `${subName}.json`));
            } else {
                files = files.filter(file => (subName.length && file.indexOf(`${subName}`) > -1));
            }
            if (files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    try {
                        const filePath = path.resolve(`${dir}/${files[i]}`);
                        let dataText = await this.readFilePromise(filePath, 'utf8');
                        this.logger.debug('getData();file path is ' + filePath + '; dataText is ' + dataText);
                        let dataObj = JSON.parse(dataText);
                        if (!dataObj.timestamp) {
                            const stat = fs.statSync(filePath);
                            dataObj.timestamp = Date.parse(stat.mtime);
                        }
                        dataArray.push(dataObj);
                    } catch (err) {
                        this.logger.severe('Error: getData(); file path is ' + filePath + '; error is ' + err.stack);
                    }
                }
            }
        }


        return Promise.resolve(dataArray);
        // return await Promise.all(files
        //     .filter(file => (subName.length && file.indexOf(`${subName}`) > -1))
        //     .map(async (file) => {
        //     return await this.readFilePromise (path.resolve(`${dir}/${file}`), 'utf8')
        // }));
    }
    readFilePromise(path, opts = 'utf8') {
        return new Promise((resolve, reject) => {
            fs.readFile(path, opts, (err, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        });
    }
    getFiles(dir) {
        const dir1 = path.resolve(dir);

        if (fs.existsSync(dir1)) {
            return fs.readdirSync(dir1);
        }

        return [];
    }

    // async readFile(dir, file) {
    //    return await readFile(path.resolve(`${dir}/${file}`));
    // };
}


exports.getFilesRouter = (context) => {
    return new Promise(function (resolve, reject) {
        let controller = new GetFilesRouter(context);
        controller.getFilesRouter();
        resolve(controller.getRouter());
    });
};