// const pm2 = require('pm2');
const path = require('path');
const os = require('os');
const dns = require('dns');
// const { Resolver } = require('dns').promises;
class ServerRuntimeService {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(context){
        this.logger = context.logger;
        this.serverConfig = context.plugin?.server?.config; // watchFileMode in userReport only conains logger when definding it.
        this.pluginDef = context.plugin?.pluginDef;
        // this.resolver = new Resolver();
    }

    setLogLevel(data) {
        let logLevels = data.logLevels || {};
        Object.keys(logLevels).forEach(key => {
            global.COM_RS_COMMON_LOGGER.setLogLevelForComponentPattern(key,logLevels[key]);
        });
    }

    async getHostInfo(){
        const hostname = this.getHostName();
        const domain = await this.getHostDomain();
        let hostFullName = hostname;
        this.logger.debug("getHostUrl::hostname "+hostname)
        if (domain && domain.status && domain.data){
            this.logger.debug("getHostUrl::domain "+domain.data)
            const len=hostFullName.length-domain.data.length
            if(!(len>0 && hostFullName.lastIndexOf(domain.data)==len)){ //server name ended by the domain.data
                hostFullName = `${hostFullName}.${domain.data}`;
            } 
        }
        return {
            hostFullName: hostFullName,
            hostname: hostname,
            domain: domain,
            ip: this.getHostIP()
        }
    }

    getHostName(){
        return os.hostname();
    }

    getHostIP(){
        try{
            const netInt = os.networkInterfaces();
            if (!netInt){
                this.logger.warn('Get host IP failed. No valid net infterface data.');
                return null;
            }
            const netTypes = Object.keys(netInt);
            for (const netType of netTypes){
                const netData = netInt[netType];
                if (Array.isArray(netData)){
                    for (let i = 0; i < netData.length; i++){
                        if (netData[i]['internal'] !== true && (netData[i]['family'] === 'IPv4' || netData[i]['family'] === 4)){
                            return netData[i]['address'];
                        }
                    }
                }
            }
            this.logger.warn('Get host IP failed. Net infterface data: ' + JSON.stringify(netInt));
            return null;
        }catch (err){
            this.logger.warn('Get host IP failed with error: ' + err.stack? err.stack : err.message);
            return null;
        }
    }

    getHostDomain(){
        return new Promise((resolve, reject) => {
            dns.reverse(this.getHostIP(), (err, domains) => {
                if (err) {
                    this.logger.warn('Get host domain failed: ' + err.message);
                    resolve({status: false, message: 'Get host domain failed'});
                }
                if ( domains && domains[0]){
                    resolve({status: true, data: domains[0].split('.').slice(1).join('.')});
                }else{
                    resolve({status: false, message: 'No domain returned'});
                }
            })
        });
    }

    /**
     * PM2 or windows service will start the server automatically after shutdown.
     */
    shutDown() {
        this.logger.warn('Server shutdown is triggered');
        // process.exit(0);
        throw 'Server shutdown is triggered'; // To shutdown gently, here throws exception instead of process.exit
    }

}

module.exports = ServerRuntimeService;
