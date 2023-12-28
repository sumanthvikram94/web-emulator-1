/**
    Authentication and Authorization handler which manage the user accounts with json files.
*/
export declare abstract class authSuper {
  serverConfiguration: any;
  protected authConfig: any;
  protected logger: any;
  protected userNameAnonymous: string;
  private isAAA: boolean;
  public isMfaEnabled: boolean;
  public mfaType: string;
  constructor(pluginDef: any, pluginConf: any, serverConf: any);
  abstract authenticate(request: any, sessionState: any, response: any): Promise<object>;
  getStatus(sessionState: any): {
      authenticated: boolean;
      username: string;
  };
  authorized(request: any, sessionState: any): Promise<any>;
  getResourceAccess(request: any, resourceConfigs: any): any;
  isMfaRequest(request: any): boolean;
  mfaAuthenticate(request: any, sessionState: any): Promise<any>;
  duoAuthenticate(request: any, sessionState: any): Promise<any>;
  oktaAuthenticate(request: any, sessionState: any): Promise<any>;
  superAdminAuthenticate(request: any, sessionState: any, response: any): Promise<any>;
  setSessionState(sessionState: any, username: string);
  setSlaveSessionState(username: string); // deprecated
  getAuth(request: any): {username: string, password: string};
  checkPassword(userLoginData,password);
  getMFAConfig(username: string,): Promise<any>;
  authenticateTheCluster(req: any, res:any): Promise<any>;
}