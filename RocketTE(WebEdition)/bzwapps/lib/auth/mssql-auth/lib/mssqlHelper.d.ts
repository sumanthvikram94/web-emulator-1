import * as mssql from 'mssql';
export declare class mssqlHelper {
    private config;
    private logger;
    private encryptionFiled;
    constructor(msSQLServerConfig: any);
    testConnection(): Promise<{
        success: boolean;
    }>;
    authenticate(table: string, userfield: string, passwordField: string, username: string, password: string): Promise<{
        success: boolean;
    }>;
    getUserInfo(usertable: string, userIdField: string, userPasswordField: string, username: string, passwordEncryptor: string): Promise<{
        userId: string;
        iv: string;
        salt: string;
        password: string;
    }>;
    execSql(strSQL: any, params: any): Promise<mssql.IProcedureResult<any>>;
    getColumnNames(tableName: any): Promise<string[]>;
    existField(tableName: any, fieldName: any): Promise<boolean>;
}
