

const bzdb = require('./bzdb.service');
const zoweService = require('./zowe.service');
const encryption = zoweService.encryption;
const logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger("com.rs.bzshared.OauthService");
class OauthService {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        this.defaultToken = 'QAqoi#asA$LSlaslXMz.mowLXOWE@234!USAD2234T';
    }

    verifyBearerHeader(req, token){
        const authHeader = req.headers.authorization;
        if (!authHeader || typeof(authHeader) !== 'string' || authHeader.indexOf('Bearer ') == -1){
            return false;
        }
        const reqToken = Buffer.from(authHeader.substring(7), 'base64').toString('ascii');
        const verifyToken = token? token : this.defaultToken;
        return reqToken === verifyToken;
    }

    async verifyAPIHeader(req){
        try {
            if(!req.headers['rte-api-token']) return false;

            const result = await bzdb.select('apiToken');

            if(result.rowCount === 0) {
                return false;
            }

            const allowed = result.data.findIndex(data => {
                const token = encryption.decryptWithKeyConstIV(data.token, data.key);
                const { expireTime, expire, ranges, allows} = data || {};
                const allowURLs = allows.split(',');
        
                let isMatched = allowURLs.findIndex(d => (d || '').toLowerCase().trim() === req.headers.referer.toLowerCase()) > -1;
                let isDimMatched = false;
               
                if(!isMatched) {
                    const isDims = allowURLs.filter(d => d.indexOf('*') > -1);
                    const protol = req.headers.referer.split('//')[0];
                    const domain = req.headers.referer.split('.');
                    const newURL = `${protol}//*.${domain[1]}.${domain[2]}`
                    isDimMatched = isDims.findIndex(d => newURL.toLowerCase() === d.toLowerCase()) > -1;
                }
    
                if (req.headers['rte-api-token'] === token && (isMatched || isDimMatched)){
                    const valid = expire === 'never' ? true : new Date(expireTime).getTime() - new Date().getTime() > 0;
                    const allowedAPI = ranges === 'ur' ? req.baseUrl === '/ZLUX/plugins/com.rs.bzshared/services/userReport' : true;
    
                    return allowedAPI && valid;
                } else {
                    return false;
                }
            }) > -1;

            return allowed;
        } catch(err) {

            return false;
        }
        
    }

    getDefaultToken(){
        return this.defaultToken;
    }

    getDefaultTokenBase64(){
        const tokenBaseStr = Buffer.from(this.defaultToken).toString('base64');
        return `Bearer ${tokenBaseStr}`;
    }

    getTokenBase64(token){
        const tokenBaseStr = Buffer.from(token).toString('base64');
        return `Bearer ${tokenBaseStr}`;
    }

    defaultOAuthChecker(){
        return async (req,res,next) => {
            const token = this.getDefaultToken();
            const apiHeader = await this.verifyAPIHeader(req);

            if (this.verifyHttpSession(req) || this.verifyBearerHeader(req, token) || apiHeader) {
                next();
            }else{
                logger.warn(`Unauthorized request   ${req.originalUrl || req.baseUrl},    ${req.ip}`);
                res.status(401).send('Unauthorized');
            }
        }
    }

    verifyHttpSession(req){
        if (req && req.session){
            const sesProperties = Object.keys(req.session);
            for (let key of sesProperties){
                if (!key.includes('com.rs.')){
                    continue;
                }
                const property = req.session[key];
                if (property['authenticated'] === true){
                    return true;
                }
            }
            return false;
        }else{
            return false;
        }
    }

    appendDfltBearToken2Opt(option){
        if (option && option.headers && typeof(option.headers) === 'object'){
            option.headers['authorization'] = this.getDefaultTokenBase64();
        }
        return option;
    }
    
    appendDfltBearToken2Header(headers){
        if (headers && typeof(headers) === 'object'){
            headers['authorization'] = this.getDefaultTokenBase64();
        }
        return headers;
    }
}

const oAuth = new OauthService();

module.exports = oAuth;
