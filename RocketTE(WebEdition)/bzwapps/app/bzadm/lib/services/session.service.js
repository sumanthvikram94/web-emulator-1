const fs = require('fs-extra');
const Bzw2hUtils = require('./bzw2h-utils');

const DataEntities = require('../model/data-entities.config');
const w2h_const = require('../../../bzshared/lib/model/w2h-const'); // BZ-20034, update version to 10.2.0

class SessionService {
    constructor(context) {
        this.context = context;
		this.logger = context.logger;
    }

    convertBzw2Session(data, name, sessions, overwrite) {
        const bzw2hSession = this.getData(data, name);

        if (this.isVT(name) || this.is6530(name) || this.isFTP(name)) {
            return this.getVTSession(bzw2hSession, name, sessions, data, overwrite);
        }

        return this.getSession(bzw2hSession, name, sessions, data, overwrite);
    }

    isVT(name) {
        return name.search(/\.zvt$/i) > -1;
    }

    is6530(name) {
        return name.search(/\.z65$/i) > -1;
    }

    isFTP(name) {
        return name.search(/\.zft$/i) > -1;
    }

    is3270(name) {
        return name.search(/\.zmd$/i) > -1;
    }

    is3270p(name) {
        return name.search(/\.zmp$/i) > -1;
    }


    is5250(name) {
        return name.search(/\.zad$/i) > -1;
    }

    is5250p(name) {
        return name.search(/\.zap$/i) > -1;
    }

    getVTSession(data, name, sessions, session, overwrite) {
        if(!data) return {};
        
        const date = new Date();
        const security = DataEntities.bzw2h.security;
        // BZ-13890, use profile name as session name
        const out = this.getName(name, sessions, overwrite);

        if(!out.name) return {};

        // BZ-13851
        const deviceType = this.getType(name, data, session);

        const bzaSession = {
            "name": out.name,
            "typeName":"",
            "columns": data.Cols || 80,
            "rows": data.Rows || 24,
            "host": data.Address,
            "port": parseInt(data.Port, 16),
            "sessionMaxSize": false,
            "securityType": data["Connection Type"] || 0,
            "connectionType": "Telnet",
            "type": deviceType,  // BZ-13851
            "terminalID": data.TerminalID, // BZ-14607
            "invalidCertificateHandling":"0",
            "id": out.id || "",
            "action": out.action || "add",
            "keyboardMapping":"",
            "sessionSettings":"",
            "luName":"",
            "security":{
                "type": this.isFTP(name)?(security.types_ftp[data["Enable SSL"]] || 'none'):(security.types[data["Enable SSL"]] || 'none'),
                "version": security.vtVersions[data["SSL Client Version"]] || 'v1.0',
                "cipher": security.ciphers[data["Cipher Suite"]] || 'strong',
                "invalidCertAction": security.invalidCerts[data["Invalid Cert Action"]] || 'accept',
                "revocationCheck": security.certificates[data["Check Certificate Revocation"]] || 'server',
                "altPrincipalName": data["Principal"] || '',
                "remoteCommand": data["Remote Command"] || '',
                "clearControlChannel": this.isFTP? (data["Clear"] === '1') : false,
                "clearDataChannel": this.isFTP? (data["Clear Data"] === '1') : false
            },
            "timestamp": date.getTime(),
            "bzd": {
                "profile": encodeURIComponent(out.name + name.slice(-4)),
                "oriFileName":name,
                "deviceType": this.isFTP(name)? (data.Type):(data.Terminal),
                "initDeviceType": deviceType  // BZ-13851
            }
       }
       if (this.isFTP(name)) {
            const keepAlive = parseInt(data["Keep Alive"] || '0', 16);
            bzaSession["keepAlive"] = {
                "timerOptions": keepAlive > 0 ? '1' : 0,
                "timerValue": keepAlive > 0 ? keepAlive : 1
            }
       }

       return bzaSession;

    }

    getSession(data, name, sessions, session, overwrite) {
        if(!data) return {};

        const date = new Date();
        const security = DataEntities.bzw2h.security;
        // BZ-13890, use profile name as session name
        const out = this.getName(name, sessions, overwrite);
        const modelType2Cols = [80,80,80,132,160];
        const modelType2Rows = [24,32,43,27,62];

        if(!out.name) return {};
        
        let sessionDetail = null;
        if(this.is3270(name) || this.is3270p(name)){
            sessionDetail = session.TN3270E;
        }else if(this.is5250(name) || this.is5250p(name)){
            sessionDetail = session.TN5250E;
        }

        // BZ-13851
        const deviceType = this.getType(name, data, session);

        return {
            "name": out.name, //max length
            "typeName": "",
            "columns": (deviceType.startsWith("3270dynamic") && session.Session['Default Model Type'] < 5 )? modelType2Cols[session.Session['Default Model Type']]: (session.Session['Custom Columns'] || 80),
            "rows": (deviceType.startsWith("3270dynamic") && session.Session['Default Model Type'] < 5 )? modelType2Rows[session.Session['Default Model Type']] : (session.Session['Custom Rows'] || 24),
            "defcolumns": session.Session['Custom Default Columns'] || 80,
            "defrows":  session.Session['Custom Default Rows'] || 24,
            "host": data["Host Address"],
            "port": parseInt(data["TCP Port"], 16),
            "sessionMaxSize": false,
            "securityType":  session.Session['Connection Type'] || 2,
            "connectionType": "TLS",
            "type": deviceType,  // BZ-13851
            "invalidCertificateHandling": "0",
            "id": out.id || "",
            "action": out.action || "add",
            "keyboardMapping":"",
            "sessionSettings":"",
            "luName": data["LU Name"] || '',
            "security":{
                "type": security.types[data["Enable SSL"]] || 'none',
                "version": security.versions[data["SSL Client Version"]] || 'v1.0',
                "cipher": security.ciphers[data["Cipher Suite"]] || 'strong',
                "invalidCertAction": security.invalidCerts[data["Invalid Cert Action"]] || 'ask',
                "revocationCheck": security.certificates[data["Check Certificate Revocation"]] || 'not',
                "altPrincipalName": data["Alternate Principal Name"] || ''
            },
            "timestamp":date.getTime(),
            "bzd": {
                "profile": encodeURIComponent(out.name + name.slice(-4)),
                "oriFileName":name,
                "deviceType": data["Device Type"],
                "initDeviceType": deviceType  // BZ-13851
            },
            "keepAlive": {
                "timerOptions":  parseInt(sessionDetail["Keep Alive Type"] || '0', 16) === 0 ? 0:(parseInt(sessionDetail["Keep Alive Type"] || '0', 16) - 1),
                "timerValue":    parseInt(sessionDetail["Keep Alive Time"] || '0', 16)
            }
        }

    }

    getData(data, name) {
        let index = 0;
        if (this.isVT(name) || this.is6530(name) || this.isFTP(name)) {
            index = parseInt((data.Session || {})['Active Connection'], 16);
            return data[`Connection ${index}`]
        };

        if (this.is3270(name) || this.is3270p(name)) {
            index = parseInt((data['TN3270E'] || {})['Active Connection'], 16);
            return data[`TN3270E\\Connection ${index}`];
        }

        if (this.is5250(name) || this.is5250p(name)) {
            index = parseInt((data['TN5250E'] || {})['Active Connection'], 16);
            return data[`TN5250E\\Connection ${index}`];
        }
        
        return {};
    }

    getName(profileName, sessions, overwrite) {
        const out = {
            name: '',
            id: '',
            action: 'add'
        }
        if (!profileName) return out;

        // name = name.length <= 16 ? name : name.slice(0, 16);
        // name = name.replace(/\/|\\|\*|\&|\%|\#|\?|\~|\+|\`|\"/g, '-'); // /\*&%#?~+`"
        let name = Bzw2hUtils.generateSessionNameFromProfileName(profileName);
        const find = sessions.find(s => (s.name.toLowerCase() === name.toLowerCase()));
        if (!find) {
            out.name = name;
            return out;
        } else if (overwrite) {
            out.name = name;
            out.id = find.id;
            out.action = 'overwrite';
            return out;
        }
        
        if (name.length === w2h_const.MAX_SESSION_NAME_LENGTH) {
            name = name.slice(0, w2h_const.MAX_SESSION_NAME_LENGTH - 3);
        }

        let newname = '';
        for(let n = 1; n < 100; n++) {
            newname =  name + '_' + n;
            if (!sessions.find(s => (s.name.toLowerCase() === newname.toLowerCase())))
                break;
        }
        out.name = newname;

        return out;

    }

    getType(name, data, session) {
        if (this.is3270(name)) {
            return DataEntities.bzw2h.types['3270'][data["Device Type"]+ (parseInt(data["Device Index"])? "_3279":"")] || '3270Model2';
        } else if (this.is3270p(name)) {
            return DataEntities.bzw2h.types['p3270'][data["Device Type"]] || '3287Model2';
        } else if (this.is5250(name)) {
            return DataEntities.bzw2h.types['5250'][session.Session['Default Model Type']] || '5250Model3179-2';
        } else if (this.is5250p(name)) {
            return DataEntities.bzw2h.types['p5250'][session.Session['Default Model Type']] || '3812Model1';
        } else if (this.isVT(name)){
            return DataEntities.bzw2h.types.vt[data.Terminal] || 'VT320';
        } else if (this.is6530(name)){
            return DataEntities.bzw2h.types['6530'][data.Terminal] || 'TANDEM';
        } else if (this.isFTP(name)){
            return DataEntities.bzw2h.types['FTP'][data.Type] || 'FTP_Auto_Detect';
        }
        
    }

    fileIsBinary(data) {
        return data.slice(0, 4).search(/BZMD|BZMP|BZAD|BZAP|BZVT|BZ65|BFTP/) > -1;
    }

    copyFile(profile, values, basePath) {
        const originFile = `${basePath}/${encodeURIComponent(profile)}`;

        if (!fs.existsSync(originFile)) {
            this.logger.warn(`failed to copy bzd profile file: ${values.name}`);
            return;
        }

        fs.copyFile(originFile, `${basePath}/${encodeURIComponent(values.bzd.profile)}`, (err) => {
            if (err) throw err;
            this.logger.info(`successfully to copy bzd profile file: ${values.name}`);
          });
    }

    renameFile(profile, values, basePath) {
        const originFile = `${basePath}/${encodeURIComponent(profile)}`;

        if (!fs.existsSync(originFile)) {
            this.logger.warn(`failed to rename bzd profile file: ${values.name}`);
            return;
        }

        fs.rename(originFile, `${basePath}/${encodeURIComponent(values.bzd.profile)}`, (err) => {
            if (err) {
                this.logger.severe(`failed to rename bzd profile file: ${values.name}`);
            } else {
                this.logger.info(`successfully to rename bzd profile file: ${values.name}`);
            }
        })
    }


}

module.exports = {
    init(context) {
		return new SessionService(context);
	}
};
