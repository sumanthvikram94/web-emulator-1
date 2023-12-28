
/**
 * Provides API functions for Navigation Recorder feature of Rocket TE Web.
 * Only available in Navigation Recorder version of Rocket TE Web.
 * <pre>
 * Please import the file "rocket-te-web-recorder-api.js", then "rocket-te-web-api.js". 
 * So when you instanciate RocketTeWebApi as rtewApi, this object of this class is usable by rtewApi.recorder
 * Please see the example below.
 * </pre>
 * @class
 * @example 
 * <script src="http://localhost:8543/ZLUX/plugins/com.rs.bzw/web/lib/js/rocket-te-web-recorder-api.js"></script>
 * <script src="http://localhost:8543/ZLUX/plugins/com.rs.bzw/web/lib/js/rocket-te-web-api.js"></script>
 * <script language="javascript">
 *  const parentElement = document.getElementById('parentDiv')
 *  const rtewapi = new RocketTEWeb('http://localhost:8543')
 *  await rtewapi.recorder.record(parentElement)
 * </script>
 */

class RocketTEWebRecorderApi {

    /**
     * No need to instantiate this class. It's automatically instantiated as RocketTeWebApi.recorder
     * @param {RocketTeWebApi} rtewApi The instance of RocketTeWebApi
     */
    constructor(rtewApi) {
        this.rtewApi = rtewApi
        this.options = undefined
    }

    /**
     * Open rocket TE Web component and create a new nav recorder project
     * @param {element} parentElement The parent DOM element in which you want to launch Rocket TE Web
     * @param {RtewConnection} [conn] Connection data used by Rocket TE web to connect to host. If conn is not provided, RTEW will prompt a window to ask for input for connection data. conn is required in case the navigation parameter is provide.
     * @param {Navigation} [navigation] If navigation is provided, the recorder will open the given navigation, and open the connection provied by "conn"
     * @returns {string} 'Rocket TE Web window is open' when page load ready
     * @throws Error when parameter data format is illegal or required parameter is not provided or connection failed.
     * @example
     * try {
     *    await rtewApi.recorder.record(parentElement, conn) // Launch the recorder and connect to host
     * } catch (e) {
     *    alert(e)
     * }
     */
    async record(parentElement, conn, navigation) {
        return new Promise(async (resolve, reject) => {
            try{
                if (!this.rtewApi.isLaunched) {
                    await this.rtewApi.launchAsWebComponent(parentElement, undefined, false, true, false, conn?.options?.preCheckEditableField || false)
                }
                await this.doConfig_()
                const request = {
                    type: 'recorder',
                    request: 'RECORD',
                    conn,
                    navigation
                }
                const result = await this.rtewApi.callRocketTEWeb_(request)
                resolve(result)
            } catch (e) {
              this.rtewApi.close()
              reject(e)
            }
        })
    }

    /**
     * @private
     */
    async doConfig_(){
      if (this.options){
        const request = {
            type: 'recorder',
            request: 'CONFIG',
            options: this.options
        }
        const result = await this.rtewApi.callRocketTEWeb_(request)
      }
    }

    /**
     * Customize recorder acitvities. Call this before the record() function.
     * @param {NavigationOptions} options 
     * @example
     * try {
     *    rtewApi.recorder.config({
     *      recorder:{
     *        hideProjectName: true,
     *        convertPassword: true,
     *        recordPassword: false
     *      }
     *    })
     *    await rtewApi.recorder.record(parentElement, conn) // Launch the recorder and connect to host
     * } catch (e) {
     *    alert(e)
     * }
     */
    config(options){
      this.options = options
    }

    /**
     * Retrieves the recorded data model from RTE Web
     * @returns {RtewConnection} The connection data
     */
    async getConnection() {
        return new Promise(async (resolve) => {
            if (this.rtewApi.isLaunched) {
                const request = {
                    type: 'recorder',
                    request: 'GETCONN'
                }
                const model = await this.rtewApi.callRocketTEWeb_(request)
                resolve(model)
            } else {
                resolve({ message: 'Rocket TE Web not launched yet' })
            }
        })
    }

    /**
     * Retrieves the recorded navigation data from RTE Web
     * @returns {Navigation} The recorded navigation data
     */
    async getNavigation() {
        return new Promise(async (resolve) => {
            if (this.rtewApi.isLaunched) {
                const request = {
                    type: 'recorder',
                    request: 'GETMODEL'
                }
                const model = await this.rtewApi.callRocketTEWeb_(request)
                resolve(model)
            } else {
                resolve({ message: 'Rocket TE Web not launched yet' })
            }
        })
    }

    /**
     * Retrieves the recorded screenshots from RTE Web
     * @returns {Screenshots} The recorded screenshots
     */
    async getScreenshots() {
        return new Promise(async (resolve) => {
            if (this.rtewApi.isLaunched) {
                const request = {
                    type: 'recorder',
                    request: 'GETSCREENSHOTS'
                }
                const model = await this.rtewApi.callRocketTEWeb_(request)
                resolve(model)
            } else {
                resolve({ message: 'Rocket TE Web not launched yet' })
            }
        })
    }

}

/**
 * The NavigationOptions Data Type
 * @typedef {Object} NavigationOptions
 * @property {RecorderOptions} [recorder] - Options for recorder
 * @property {RunnerOptions} [runner] - Options for runner
 */

/**
 * The RecorderOptions Data Type
 * @typedef {Object} RecorderOptions
 * @property {boolean} [hideProjectName] - True to hide the project name from recorder UI
 * @property {boolean} [convertPassword] - True to record putPassword action as inputParameter automatically
 * @property {boolean} [recordPassword] - True to record password into the navigation data as plain text
 */

/**
 * The RunnerOptions Data Type
 * @typedef {Object} RunnerOptions
 * @property {boolean} [doKeepWindowOnEnd] - True to keep the window open after running ends successfully or with exception, false to close the window automatically on end.
 * @property {boolean} [isFullScreen] - True to run the navigation in full screen mode.
 */


/**
 * The RtewConnection Data Type
 * @typedef {Object} RtewConnection
 * @property {string} name Connection name. E.g. 'test conn 1'
 * @property {string} host The host name. E.g. 'myhost.mycompany.com'
 * @property {string} port The host port. E.g. '23'
 * @property {string} type The protocol type. Legal values: '3270Model2', '3270Model3', '3270Model4', '3270Model5', '3270dynamic', '5250Model3179-2', '5250Model3180-2', '5250Model3196-A1', '5250Model3477-FC', '5250Model3477-FG', '5250Model5251-11', '5250Model5291-1', '5250Model5292-2'
 * @property {string} protocol: "TN3270", "TN5250"
 * @property {string} securityType The security type. Legal values: 'Telnet', 'TLS', 'SSH' (VT only, not supported yet)
 * @property {string} codePage The code page support:'CP-290','CP-420','CP-424','CP-918','CP-931','CP-933','CP-935','CP-937','CP-1097','CP-1112','CP-1140','CP-1141','CP-1142','CP-1143','CP-1144','CP-1145','CP-1146','CP-1147','CP-1148','CP-1153','CP-1154','CP-1155','CP-1160','CP-1137','CP-4971','CP-5026','CP-5035'.
 * @property {object} options?: connection options. E.g. '{preCheckEditableField : true}'
 * @example
{ // 3270, Telnet
  "name": "temp",
  "host": "rs73.rocketsoftware.com",
  "port": "23",
  "protocol": "TN3270",
  "type": "3270Model2",
  "securityType": "Telnet",
  "codePage": "CP-1142",
  "options": {
    "preCheckEditableField": true // pre-check editable field when typing characters with script.
  }
}

{ // 3270, TLS
  "name": "temp",
  "host": "rs74.rocketsoftware.com",
  "port": "992",
  "protocol": "TN3270",
  "type": "3270Model2",
  "securityType": "TLS"
}

{ // 5250, Telnet
  "name": "temp",
  "host": "BZTST73A.rocketsoftware.com",
  "port": "23",
  "protocol": "TN5250",
  "type": "5250Model3179-2",
  "securityType": "Telnet"
}

{ // 5250, TLS
  "name": "temp",
  "host": "BZTST73A.rocketsoftware.com",
  "port": "992",
  "protocol": "TN5250",
  "type": "5250Model3179-2",
  "securityType": "TLS"
}

 */

/**
 * The Navigation Data Type
 * @typedef {Object} Navigation
 * @property {Object} process The process object, it includes interactions and actions
 * @property {Object} screens The screens object, it includes all the screen data related to the process
 * @example
{
  "process": {
    "name": "NEW PROCESS",
    "startInteractions": [
      "INTERACT0001"
    ],
    "interactions": {
      "INTERACT0001": {
        "id": "INTERACT0001",
        "name": "SCREEN0001",
        "actions": [
          {
            "type": "putText",
            "text": {
              "stringValue": "logon ts6299"
            },
            "field": "FLD24002"
          },
          {
            "type": "sendKey",
            "key": {
              "stringValue": "Enter"
            },
            "async": true
          }
        ],
        "screen": "SCREEN0001"
      },
      "INTERACT0002": {
        "id": "INTERACT0002",
        "name": "SCREEN0002",
        "actions": [],
        "screen": "SCREEN0002"
      }
    },
    "variables": {}
  },
  "screens": {
    "SCREEN0001": {
      "name": "SCREEN0001",
      "rows": 24,
      "columns": 80,
      "expressions": {
        "value": ""
      },
      "fields": {
        "FLD24002": {
          "name": "FLD24002",
          "position": {
            "startRow": 24,
            "startColumn": 2,
            "endRow": 24,
            "endColumn": 80,
            "span": "multi_line"
          }
        }
      },
      "identifiers": {
        "Default": {
          "name": "Default",
          "position": {
            "startRow": 1,
            "startColumn": 20,
            "endRow": 1,
            "endColumn": 63,
            "span": "single_line"
          },
          "operator": "equal",
          "expectedContents": " *                                          "
        }
      }
    },
    "SCREEN0002": {
      "name": "SCREEN0002",
      "rows": 24,
      "columns": 80,
      "expressions": {
        "value": ""
      },
      "fields": {},
      "identifiers": {
        "Default": {
          "name": "Default",
          "position": {
            "startRow": 1,
            "startColumn": 20,
            "endRow": 1,
            "endColumn": 63,
            "span": "single_line"
          },
          "operator": "equal",
          "expectedContents": "                                            "
        }
      }
    }
  }
}
 */


/**
 * The Screenshots Data Type
 * @typedef {Object.<string, Screenshot>} Screenshots
 * @example
{
  "SCREEN0001": {
    "name": "...",
    "size": {...},
    "cursor": {...},
    "fields": {...},
  },
  "SCREEN0002": {
    "name": "...",
    "size": {...},
    "cursor": {...},
    "fields": {...},
  },
  ...
}
*/


/**
 * The Screenshot Data Type
 * @typedef {Object} Screenshot
 * @property {string} name
 * @property {string} screenName
 * @property {ScreenSize} size - {"widgth": 80, "height": 24}
 * @property {CursorPos} cursor - {"x": 24, "y": 2}
 * @property {ScreenColor} defaultColor - {"foreground": "0xf4e842", "background": "0x000000"}
 * @property {Object} partitions - {"0": {"amode": false, "size": 1920}}
 * @property {Object.<string, ScreenField>} [fields] - Exists in case the screen is formatted.
 * @property {ScreenElement[]} [elements] - Only exist in case there is character attributes set for character
 * @property {boolean} isFormatted
 * @example
{
  "SCREEN0001": {
    "name": "SCREENSHOT0001",
    "screenName": "SCREEN0001",
    "size": {
      "width": 80,
      "height": 24
    },
    "cursor": {
      "x": 24,
      "y": 2
    },
    "defaultColor": {
      "foreground": "0xf4e842",
      "background": "0x000000"
    },
    "partitions": {
      "0": {
        "amode": false,
        "size": 1920
      }
    },
    "fields": {
      "FLD24002": {
        "length": 79,
        "position": {
          "startRow": 24,
          "startColumn": 2,
          "endRow": 24,
          "endColumn": 80,
          "span": "single_line"
        },
        "isEditable": true,
        "isModified": 0,
        "isNoDisplay": false,
        "hasOutLine": false,
        "color": {
          "backgound": "0x000000",
          "foreground": "0x00ff00"
        },
        "text": "                                                                               ",
        "isNumeric": false,
        "name": "FLD24002"
      },
      ...
    },
    "elements": [
      {
        "position": 3,
        "displayChar": 77,
        "isGraphicEscape": false,
        "isUnderscore": true,
        "isNoDisplay": false,
        "color": {
          "background": "0x000000",
          "foreground": "0xffffff"
        }
      },
      {
        "position": 9,
        "displayChar": 85,
        "isGraphicEscape": false,
        "isUnderscore": true,
        "isNoDisplay": false,
        "color": {
          "background": "0x000000",
          "foreground": "0xffffff"
        }
      },
      ...
    ],
    "isFormatted": true
  }
}

*/

/**
 * The ScreenSize Data Type
 * @typedef {Object} ScreenSize
 * @property {number} widgth
 * @property {number} height
 */


/**
 * The CursorPos Data Type
 * @typedef {Object} CursorPos
 * @property {number} x
 * @property {number} y
 */


/**
 * The ScreenColor Data Type
 * @typedef {Object} ScreenColor
 * @property {string} foreground
 * @property {string} background
 * @example
 * {"foreground": "0xf4e842", "background": "0x000000"}
 */

 
 
/**
 * The ScreenField Data Type
 * @typedef {Object} ScreenField
 * @property {string} name
 * @property {number} length
 * @property {ScreenPosition} position
 * @property {boolean} isEditable
 * @property {boolean} isModified
 * @property {boolean} isNoDisplay
 * @property {boolean} hasOutLine
 * @property {boolean} isNumeric
 * @property {ScreenColor} color
 * @property {string} text
 * @example
{
  "length": 79,
  "position": {
    "startRow": 24,
    "startColumn": 2,
    "endRow": 24,
    "endColumn": 80,
    "span": "single_line"
  },
  "isEditable": true,
  "isModified": 0,
  "isNoDisplay": false,
  "hasOutLine": false,
  "color": {
    "backgound": "0x000000",
    "foreground": "0x00ff00"
  },
  "text": "                                                                               ",
  "isNumeric": false,
  "name": "FLD24002"
}
 */

/**
 * The ScreenPosition Data Type
 * @typedef {Object} ScreenPosition
 * @property {number} startRow
 * @property {number} startColumn
 * @property {number} endRow
 * @property {number} endColumn
 * @property {Enumerator<string>} span - "single_line"/"multi_line"/"rectangle"
 * @example
  "position": {
    "startRow": 24,
    "startColumn": 2,
    "endRow": 24,
    "endColumn": 80,
    "span": "single_line"
  },
 */

/**
 * The ScreenElement Data Type
 * @typedef {Object} ScreenElement
 * @property {number} position
 * @property {number} displayChar
 * @property {boolean} isGraphicEscape
 * @property {boolean} isUnderscore
 * @property {boolean} isNoDisplay
 * @property {ScreenColor} color
 * @example
{
  "position": 3,
  "displayChar": 77,
  "isGraphicEscape": false,
  "isUnderscore": true,
  "isNoDisplay": false,
  "color": {
    "background": "0x000000",
    "foreground": "0xffffff"
  }
}
 */