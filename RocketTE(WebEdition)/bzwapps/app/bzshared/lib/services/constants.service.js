 class Constants {
    // since from 10.1.1, we support HA and move data into new locations under 'share' folder, 
    // but we still need  compatibility to  read  data from old directory to make sure the appliction can start before doing data upgrade. 
    constructor(){
        this.metaDataBackupPath = {
            auth: {
                fileName: 'authentication.json',
                backupFilePaths: [
                ],
            },
            ldap: {
                fileName: 'ldapServerConfig.json',
                backupFilePaths: [
                    '../../../../../instance/ZLUX/pluginStorage/com.rs.ldapAuth/_internal/plugin',
                    '../../../../../product/ZLUX/pluginStorage/com.rs.ldapAuth/_internal/plugin'
                ],
            },
            mssql: {
                fileName: 'msSQLServerConfig.json',
                backupFilePaths: [
                    '../../../../../instance/ZLUX/pluginStorage/com.rs.mssqlAuth/_internal/plugin',
                    '../../../../../product/ZLUX/pluginStorage/com.rs.mssqlAuth/_internal/plugin'
                ],
            },
            sso: {
                fileName: 'ssoServerConfig.json',
                backupFilePaths: [
                    '../../../../../instance/ZLUX/pluginStorage/com.rs.ssoAuth/_internal/plugin',
                    '../../../../../product/ZLUX/pluginStorage/com.rs.ssoAuth/_internal/plugin'
                ],
            },
            datasource: {
                fileName: 'dataSourceSetting.json',
                backupFilePaths: [
                    '../../../../../instance/ZLUX/pluginStorage/com.rs.bzadm/configurations',
                    '../../../../../instance/ZLUX/pluginStorage/com.rs.bzw/configurations',
                    '../../../../../product/ZLUX/pluginStorage/com.rs.bzadm/configurations',
                    '../../../../../product/ZLUX/pluginStorage/com.rs.bzw/configurations'
                ],
            },
            config: {
                fileName: 'serverSettings.json',
                backupFilePaths: [
                    '../../../../../instance/ZLUX/pluginStorage/com.rs.bzadm/configurations',
                    '../../../../../instance/ZLUX/pluginStorage/com.rs.bzw/configurations',
                    '../../../../../product/ZLUX/pluginStorage/com.rs.bzadm/configurations',
                    '../../../../../product/ZLUX/pluginStorage/com.rs.bzw/configurations',
                    '../../../../../extensions/rocket-te-web/bzw/config/storageDefaults/configurations'
                ],
            },
            w2hServerSettings: {
                fileName: 'web2hServerSettings.json',
                backupFilePaths: [
                ],
            }
        }
    }  
}
module.exports = new Constants();