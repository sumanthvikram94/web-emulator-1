module.exports = {
  // default group privilige
  defaultPriv: {
    createSession: false,
    cloneSession: false,
    removeSession: false,
    editLU: true,                   // 8.1.1, not used by W2H
    sessionSettings: false,
    enableRecorder: false,
    enableUseEditor: false,
    enablePlayScript: false,
    enableEditSession: false,
    enableEditFontSize: true,
    enableEditColors: true,
    enableEditCursor: true,
    enableShowLaunchPadMenu: false,
    enableDisplayLaunchPadMenu: false,  // use powerpad
    enableEditLaunchPad: true,
    enableEditkeyboardMapping: true,
    enableEditHotSpots: true,
    enableEditLanguage: true,
    enableFTPTransferSetting: true, // 8.1.1
    // advanced setting      
    enableAdvAPISetting: true,      // 8.1.1
    enableAdvLicMg: true,           // 8.1.1
    //enableConProp: false,
    enableAdvToolbar: true,         // 8.1.1
    enableAdvEditProp: true,        // 8.1.1
    enableAdvStatusbar: true,       // 8.1.1
    enableAdvMacroSetting: true,    // 8.1.1
    enableAdvIND$FILE: true,        // 8.1.1
    enableAdvFileProp: true,        // 8.1.1
    enableAdvScriptSetting: true,   // 8.1.1
    enableAdvPrintScreen: true,     // 8.1.1
    enableAdvPrintQueue: true,      // 8.1.1
    // lock FTP commands
    lockFTPCommands: false,         // 8.1.1
    lockFTPCWD: true,               // 8.1.1
    lockFTPDELE: true,              // 8.1.1
    lockFTPMKD: true,               // 8.1.1
    lockFTPRETR: true,              // 8.1.1
    lockFTPRMD: true,               // 8.1.1
    lockFTPSITE: true,              // 8.1.1
    lockFTPSTOR: true               // 8.1.1
  },
  // the map from group privilige to Lock value in defualt.ini
  mapPriv2Lock: {
    lock: {
      // createSession: false,
      // cloneSession: false,
      // removeSession: false,
      // editLU: true,                   // 8.1.1, not used by W2H
      // sessionSettings: false,
      // enableRecorder: false,
      // enableUseEditor: false,
      // enablePlayScript: false,
      // enableEditSession: false,
      enableEditFontSize: 16,
      enableEditColors: 16,
      enableEditCursor: 16,
      // enableShowLaunchPadMenu: false,
      enableDisplayLaunchPadMenu: 2,
      enableEditLaunchPad: 2,
      enableEditkeyboardMapping: 8,
      enableEditHotSpots: 16,
      enableEditLanguage: 512,
      // enableFTPTransferSetting: true, // 8.1.1
      // advanced setting      
      enableAdvAPISetting: 4096,      // 8.1.1
      enableAdvLicMg: 32768,          // 8.1.1
      //enableConProp: 65536,
      enableAdvToolbar: 1,            // 8.1.1
      enableAdvEditProp: 256,         // 8.1.1
      enableAdvStatusbar: 4,          // 8.1.1
      enableAdvMacroSetting: 1024,    // 8.1.1
      enableAdvIND$FILE: 2048,        // 8.1.1
      enableAdvFileProp: 32,          // 8.1.1
      enableAdvScriptSetting: 8192,   // 8.1.1
      enableAdvPrintScreen: 128,      // 8.1.1
      enableAdvPrintQueue: 16384,     // 8.1.1
    },
    // lock FTP commands
    lockFTP: {
      // lockFTPCommands: false,         // 8.1.1
      lockFTPCWD: 1,                  // 8.1.1
      lockFTPDELE: 512,               // 8.1.1
      lockFTPMKD: 32,                 // 8.1.1
      lockFTPRETR: 4,                 // 8.1.1
      lockFTPRMD: 64,                 // 8.1.1
      lockFTPSITE: 16,                // 8.1.1
      lockFTPSTOR: 2                  // 8.1.1
    },
    lockFTPMax: 1024
  }
}
