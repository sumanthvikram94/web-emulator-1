"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mssqlHelper = void 0;
///
/// mssql
///
const mssql = require("mssql"); //https://www.npmjs.com/package/mssql
class mssqlHelper {
    constructor(msSQLServerConfig) {
        this.logger = global['COM_RS_COMMON_LOGGER'].makeComponentLogger("bzw.auth.mssql");
        this.config = {
            server: msSQLServerConfig.hostName,
            port: msSQLServerConfig.hostPort,
            database: msSQLServerConfig.database,
            user: msSQLServerConfig.userName,
            password: msSQLServerConfig.password,
            options: {
                encrypt: false // Use this if you're on Windows Azure
            },
            pool: {
                min: 0,
                max: 10,
                idleTimeoutMillis: 3000
            }
        };
        this.encryptionFiled = "salt";
    }
    async testConnection() {
        let db;
        try {
            db = await new mssql.ConnectionPool(this.config).connect();
        }
        catch (err) {
            this.logger.severe('Authorization Failed : Conncet MSSQL occurs error: ' + err.message);
            throw (err);
        }
        try {
            console.info("Connected");
            const testStatement = 'select 1 as test;';
            const ps = new mssql.PreparedStatement(db);
            await ps.prepare(testStatement);
            const recordsets = await ps.execute({});
            await ps.unprepare();
            if (recordsets.recordset[0]) {
                return { success: true };
            }
            else {
                return { success: false };
            }
        }
        catch (e) {
            throw (e);
        }
    }
    async authenticate(table, userfield, passwordField, username, password) {
        let db;
        try {
            db = await new mssql.ConnectionPool(this.config).connect();
        }
        catch (err) {
            this.logger.severe('Authorization Failed : Conncet MSSQL occurs error: ' + err.message);
            throw (err);
        }
        try {
            const ps = new mssql.PreparedStatement(db);
            ps.input('param1', mssql.VarChar);
            ps.input('param2', mssql.VarChar);
            const strSQL = "SELECT * FROM " + table + " WHERE " + userfield + "=@param1 AND " + passwordField + "=@param2;";
            await ps.prepare(strSQL);
            const recordset = await ps.execute({
                param1: username,
                param2: password,
            });
            await ps.unprepare();
            if (recordset.recordset[0]) {
                return { success: true };
            }
            else {
                return { success: false };
            }
        }
        catch (e) {
            throw (e);
        }
    }
    async getUserInfo(usertable, userIdField, userPasswordField, username, passwordEncryptor) {
        let db;
        const EMPTYPASSWORD = '';
        let userInfo = {
            userId: "",
            iv: "",
            salt: "",
            password: EMPTYPASSWORD
        };
        try {
            db = await new mssql.ConnectionPool(this.config).connect();
        }
        catch (err) {
            this.logger.severe('Authorization Failed : Conncet MSSQL occurs error: ' + err.message);
            throw (err);
        }
        try {
            const ps = new mssql.PreparedStatement(db);
            const existEncryptionField = await this.existField(usertable, this.encryptionFiled);
            ps.input('userId', mssql.VarChar);
            let strSQL = "SELECT"
                + " " + userIdField + " AS userId"
                + "," + userPasswordField + " AS password";
            if (existEncryptionField) { //exist password encryption releated field
                strSQL += "," + "iv AS iv"
                    + "," + "salt AS salt";
            }
            else {
                strSQL += "," + "'' AS iv"
                    + "," + "'' AS salt";
            }
            strSQL += " FROM " + usertable
                + " WHERE " + userIdField + "=@userId";
            await ps.prepare(strSQL);
            const recordset = await ps.execute({
                userId: username,
            });
            await ps.unprepare();
            if (recordset && recordset.recordset.length > 0) {
                Object.assign(userInfo, recordset.recordset[0]);
            }
            return Promise.resolve(userInfo);
        }
        catch (err) {
            this.logger.severe('Authorization Failed : Conncet MSSQL occurs error: ' + err.message);
            throw (err);
        }
    }
    ///
    ///   strSQL=SELECT * FROM bzwUsers WHERE username=@username and groupName=@groupName
    ///   params={["userId"]:username,["groupName"]:groupName};
    ///
    async execSql(strSQL, params) {
        let db;
        try {
            db = await new mssql.ConnectionPool(this.config).connect();
        }
        catch (err) {
            this.logger.severe('Authorization Failed : Conncet MSSQL occurs error: ' + err.message);
        }
        try {
            const ps = new mssql.PreparedStatement(db);
            if (params != "") {
                for (var index in params) {
                    if (typeof params[index] == "number") {
                        ps.input(index, mssql.Int);
                    }
                    else if (typeof params[index] == "string") {
                        ps.input(index, mssql.NVarChar);
                    }
                }
            }
            await ps.prepare(strSQL);
            const recordset = await ps.execute(params);
            await ps.unprepare();
            return recordset;
        }
        catch (err) {
            throw (err);
        }
    }
    async getColumnNames(tableName) {
        const strSQL = "SELECT COLUMN_NAME FROM information_schema.COLUMNS where table_name =@table_name";
        const param = { ["table_name"]: tableName };
        let columnNames = [];
        this.logger.info('getColumnNames() sql statement: ' + strSQL);
        try {
            let recordset = await this.execSql(strSQL, param);
            if (recordset && recordset.recordset.length > 0) {
                recordset.recordset.forEach(record => {
                    columnNames.push(record.COLUMN_NAME);
                });
            }
        }
        catch (err) {
            this.logger.severe('getColumnNames() occurs error: ' + err.message + "; Error name:" + err.name + "; Error code:" + err.code);
        }
        this.logger.info('getColumnNames(); specify table columnNames is: ' + columnNames.join(","));
        return columnNames;
    }
    async existField(tableName, fieldName) {
        let columnNames = [];
        columnNames = await this.getColumnNames(tableName);
        if (columnNames.length > 0) {
            return columnNames.filter(item => item.toLowerCase() === fieldName.toLowerCase()).length > 0 ? true : false;
        }
        else {
            return true;
        }
    }
}
exports.mssqlHelper = mssqlHelper;
