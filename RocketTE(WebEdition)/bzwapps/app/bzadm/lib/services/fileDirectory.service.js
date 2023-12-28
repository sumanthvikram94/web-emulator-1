
const path = require('path');
const util = require('util');

const BZADMIN_Directory={
    groups:"groups",
    sessions:"sessions",
    sessionSettings:"sessionSettings",
    sessionSettingsFloders:{
        defaults:"defaults",
        hotspots:"hotspots",
        keyboardmapping:"keyboardmapping",
        launchpad:"launchpad",
        preference:"preference",
    },
    settings:"settings",
    users:"users",
}
const ZLUXDirectory={
    plugins:"plugins",
    pluginStorage:"pluginStorage",
    pluginStorageFolder:{
        BZADMIN_NAME  : 'com.rs.bzadm',
        BZADMIN_NAME_Floder:BZADMIN_Directory,
        BZWEB_NAME  : 'com.rs.bzw',
    },
    serverConfig:"serverConfig",
}
const DeployDirectory={
    InstanceName:"instance",
    InstanceBasePath:path.join(process.cwd(), '../',"deploy"),
    InstanceFloders:{
        Groups:"groups",
        Users:"users",
        ZLUX:"ZLUX",
        ZLUXChild:ZLUXDirectory
    },
    ProductBasePath:path.join(process.cwd(), '../',"deploy"),
    ProductName:"product",
    ProductFloders:{
        ZLUX:"ZLUX",
        ZLUXChild:ZLUXDirectory
    },
    SiteName:"site",
}

class FileDirectory {

    Get_BZAdmin_Instance_Path(){
        return path.join(DeployDirectory.InstanceBasePath,
            DeployDirectory.InstanceName,
            DeployDirectory.InstanceFloders.ZLUX,
            DeployDirectory.InstanceFloders.ZLUXChild.pluginStorage,
            DeployDirectory.InstanceFloders.ZLUXChild.pluginStorageFolder.BZADMIN_NAME
            )
    }
    Get_BZAadmin_Instance_SessionSetting_Path(){
        const bzaInstance=this.Get_BZAdmin_Instance_Path();
        return path.join(bzaInstance,
            DeployDirectory.InstanceFloders.ZLUXChild.pluginStorageFolder.BZADMIN_NAME_Floder.sessionSettings)
    }
    Get_BZAdmin_Product_Path(){
        return "";
    }

};

const fileDirectory = new FileDirectory();

module.exports = fileDirectory;
