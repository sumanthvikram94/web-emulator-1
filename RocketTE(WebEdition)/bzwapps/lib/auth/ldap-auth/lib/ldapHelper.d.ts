export declare class ldapHelper {
    private ldapServerConfig;
    private client;
    private ldapHostUrl;
    private options;
    private logger;
    constructor(ldapServerConfig: any);
    ldapBind(username: any, password: any, isDNBind?: any): Promise<object>;
    ldapAdminBind(): Promise<object>;
    ldapAdminSearch(username: any, retureAttr: any): Promise<object>;
    ldapDoubleBind(username: any, password: any): Promise<object>;
    ldapClientBind(username: any, password: any): Promise<object>;
    getRootDN(): Promise<unknown>;
    ldapSearch(username: any, password: any, retureAttr: any): Promise<object>;
    ldapBindSearch(username: any, password: any, retureAttr: any): Promise<object>;
    ldapSettingTest(username: any, password: any, returnAttr: any): Promise<object>;
    getUserFullName(userName: any): any;
    getUserShortName(userName: any): any;
    unBind(): void;
}
