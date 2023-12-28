const path = require('path');
const request = require('request');
const fs = require('fs-extra');
const Bzw2hUtils = require('../bzw2h-utils');
const ini = require('ini');
const oAuth = require('../../../../bzshared/lib/services/oauth.service');

const API_BZA_SESSION_UPLOAD = 'com.rs.bzadm/services/session/upload?type=importSite';
const SESSION_ACTION_IGNORE = 'ignore';
const SESSION_ACTION_IMPORT = 'import';
const SESSION_ACTION_SKIP = 'skip';
const SESSION_ACTION_OVERWRITE = 'overwrite';

class Session {
    constructor(file, logger, context, override = null) {
        this.file = file;
        this.logger = logger;
        this.context = context;
        this.override = override;
        this.profileName = path.basename(file);
        this.orgName = this.profileName.replace(/\.[^/\\.]+$/, "");
        this.name = Bzw2hUtils.generateSessionNameFromProfileName(this.profileName);
        this.overrideDesc = override ? override.Description : '';
        this.type = this.profileName.split('.').pop();
        this.isBzaSupport = Bzw2hUtils.isBzaSupportedProfile(this.profileName);
        this.isBinaryFormat = this.isBinaryProfile();
        this.folderImportOpts = [];
        this.scopeIds = []; // BZ-19900
        this.baseUrl = Bzw2hUtils.getBaseUrlFromContext(context);
        this.out = {  // update after import
            id: '',
            name: this.name,
            action: SESSION_ACTION_IGNORE,  // "import", "skip", "overwrite" for import summary
            error: ''
        };
        if (!this.isBzaSupport) {
            this.out.error = `session type '.${this.type}' is not supported`;
        } else if (this.isBinaryFormat) {
            this.out.error = 'session profile is binary format or does not exist'; // BZ-19884
        }
    }

    addFolderImportOpt(opt) {
        this.folderImportOpts.push(opt);
    }

    setSessionId(id) {
        this.out.id = id;
    }

    setGroupScope(gids) {
        this.scopeIds = gids; // BZ-19900
    }

    checkGroupScope(gid) { // BZ-19900
        return this.scopeIds.length > 0 ? this.scopeIds.includes(gid) : true;
    }
    
    isBinaryProfile() {
        const logPrefix = '[session::isBinaryProfile]';
        if (fs.existsSync(this.file)) {
            try {
                const data = fs.readFileSync(this.file, 'utf8');
                const isBinary = (0 === data.slice(0, 5).search(/BZMD|BZMP|BZAD|BZAP|BZVT|BZ65|BFTP|BZLPD|BZUTS|BZT27|BZICL|BZALC/));
                if (isBinary) {
                    this.logger.warn(`${logPrefix} profile '${this.profileName}' is binary format.`);
                }
                return isBinary;
            } catch(e) {
                // set to binary format if failed to read file
                this.logger.warn(`${logPrefix} failed to read profile '${this.profileName}', ${e}`);
                return true;
            }
        } else {
            // set to binary format if profile does not exist.
            this.logger.warn(`${logPrefix} file path '${this.file}' does not exist.`);
            return true;
        }
    }

    async doImport(req, isOverwrite = false) {
        const logPrefix = `[session::doImport]`;
        const isExisted = this.out.id ? true : false;
        this.logger.info(`${logPrefix} profile: '${this.profileName}', isExisted?: ${isExisted}, isOverwrite: ${isOverwrite}`);
        let session = this;
        return new Promise(async function(rs, rj) {
            if (!session.isBzaSupport || session.isBinaryFormat) {
                session.logger.info(`${logPrefix} ignore session '${session.profileName}', support? ${session.isBzaSupport}, binary? ${session.isBinaryFormat}`);
                return rs(true);
            }

            let filedata = null;
            if (fs.existsSync(session.file)) {
                try {
                    filedata = fs.readFileSync(session.file).toString();
                } catch(e) {
                    session.logger.warn(`${logPrefix} failed to read session profile '${session.profileName}', ${e}`);
                    session.out.error = 'failed to read session profile';
                    return rs(false);
                }
            } else {
                session.logger.warn(`${logPrefix} file path '${this.file}' does not exist.`);
                session.out.error = 'session profile does not exist';
                return rs(false);
            }

            //add override fields if exist
            if(session.override) {
                const data = ini.encode(session.override);
                filedata = `${filedata}\r\n[override]\r\n${data}`;
            }
            
            // let isOverwrite = false;
            if (0 === session.folderImportOpts.length) {
                // this session does not belong to any launch folder
                session.logger.info(`${logPrefix} skip due to no launch folder includes this session`);
                return rs(true);
            } else {
                if (isExisted) {                
                    // this session belongs to some launch folders
                    if (isOverwrite && session.folderImportOpts.some(o => (o.isImport))) {
                        session.logger.info(`${logPrefix} ==overwrite==`);
                        session.out.action = SESSION_ACTION_OVERWRITE;
                    } else {
                        session.logger.info(`${logPrefix} ==skip(existing)==`);
                        session.out.action = SESSION_ACTION_SKIP;
                        session.out.error = '';
                        return rs(true);
                    }
                } else {
                    if (!session.folderImportOpts.some(o => (o.isImport))) {
                        session.logger.info(`${logPrefix} ==skip(not use)==`);
                        return rs(true)
                    } else {
                        session.logger.info(`${logPrefix} ==import==`);
                        session.out.action = SESSION_ACTION_IMPORT;
                    }
                }
            }

            try {
                session.logger.info(`${logPrefix} start to import profile '${session.profileName}', baseUrl: '${session.baseUrl}'`);
                let option = {
                    url: `${session.baseUrl}${API_BZA_SESSION_UPLOAD}`,
                    json: true,
                    body: {
                        data: filedata,
                        name: `${session.name}.${session.type}`,
                        orgProfile: session.profileName,
                        overwrite: isOverwrite  // BZ-13894, import site multiple times
                    },
                    headers: {} //{ cookie: req.headers.cookie }
                };
                Bzw2hUtils.setHttpsOption(option);
                oAuth.appendDfltBearToken2Opt(option);

                request.post(option, (err, response, body) => {
                    if (err) {
                        session.logger.severe(`${logPrefix} failed to call request.post, ${err}`);
                        session.out.error = 'failed to create session';
                        return rs(false);
                    }
                    if (response.statusCode === 200 && body.status) {
                        session.out.id = body.data.id;
                        session.out.name = body.data.name;
                        session.out.error = '';
                        session.logger.info(`${logPrefix} completed to import session '${session.profileName}' => {name: ${session.out.name}, id: ${session.out.id}}`);
                        return rs(true);
                    } else {
                        session.out.error = body.text ? body.text : body.message;
                        session.logger.severe(`${logPrefix} failed to import session '${session.profileName}', ${session.out.error}`);
                        return rs(false);
                    }
                });
            } catch(e) {
                session.logger.severe(`${logPrefix} failed to import session profile '${session.profileName}', ${e}`);
                session.out.error = 'unknown error';
                return rs(false);                
            }
        });

    }
    async deleteSession(req) {
        var id = this.sessionId;
        return new Promise(async function(rs,rj) {
            if (!id) {
                return rs('resolved');
            } else {
                try {
                    const option = {
                        url: `${req.protocol}://${req.headers.host}/ZLUX/plugins/com.rs.bzadm/services/session/?path=session&&name=${encodeURIComponent(id)}`,
                        headers: {} //{cookie: req.headers.cookie}
                    };
                    Bzw2hUtils.setHttpsOption(option);
                    oAuth.appendDfltBearToken2Opt(option);
                    request.delete(option, (err, response, body) => {
                        if (err) {
                           return rj(err);
                        } else {
                            return rs('resolved');
                        }
                    });
                }
                catch(error) {
                    return rj(error);                    
                }
            }
        });        
    }

    static isSuccessfulImport(action) {
        return (action === SESSION_ACTION_IMPORT) || (action === SESSION_ACTION_OVERWRITE);
    }
}

module.exports = Session;