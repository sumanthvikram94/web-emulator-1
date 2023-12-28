
/**
 * Provides API functions for Navigation Running feature of Rocket TE Web.
 * Only available in Navigation Runner version of Rocket TE Web.
 * <pre>
 * Please import the file "rocket-te-web-runner-api.js", then "rocket-te-web-api.js". 
 * So when you instanciate RocketTeWebApi as rtewApi, this object of this class is usable by rtewApi.runner
 * Please see the example below.
 * </pre>
 * @example 
 * <script src="http://localhost:8543/ZLUX/plugins/com.rs.bzw/web/lib/js/rocket-te-web-runner-api.js"></script>
 * <script src="http://localhost:8543/ZLUX/plugins/com.rs.bzw/web/lib/js/rocket-te-web-api.js"></script>
 * <script language="javascript">
 *  const parentElement = document.getElementById('parentDiv')
 *  const rtewapi = new RocketTEWeb('http://localhost:8543')
 *  const navigation = {...}
 *  const conn = {...}
 *  const inputs = {...}
    try {
        const result = await rtewapi.runner.execute(parentElement, navigation, conn, inputs)
        alert(result)
    } catch (e) {
        alert(e)
    }


 *  
 * </script>
 */

class RocketTEWebRunnerApi {

    /**
     * No need to instantiate this class. It's automatically instantiated as RocketTeWebApi.runner
     * @param {RocketTeWebApi} rtewApi The instance of RocketTeWebApi
     */
    constructor(rtewApi) {
        this.rtewApi = rtewApi
        this.options = {
            runner: {
                doKeepWindowOnEnd: false,
                isFullScreen: true
            }
        }
    }

    /**
     * Execute the given navigation from beginning to the end
     * @param {element} parentElement The parent div in which to launch RTEW
     * @param {Navigation} navigation The navigation data to run
     * @param {RtewConnection} conn The connection data
     * @param {object} [inputs] The input parameters. e.g. {"password":"mypassword"}
     * @param {boolean} [isSilent = true] True to execute the navigation in a hidden RTEW. 
     * @param {Function} [onload] The function to execute when RTEW is shown. Not applicable for silent mode. Complete loading could be invoked here.
     * @returns {ExecResult} the execution result
     * @throws Error when data validation fails
     */
    async execute(parentElement, navigation, conn, inputs, isSilent = true, onload) {
        return new Promise(async (resolve, reject) => {
            try{
                if (!this.rtewApi.isLaunched) {
                    await this.rtewApi.launchAsWebComponent(parentElement, undefined, isSilent, true, this.options.runner.isFullScreen, conn?.options?.preCheckEditableField || false)
                    if (!isSilent && onload) {
                        onload()
                    }
                }
                await this.doConfig_()
                const request = {
                    type: 'recorder',
                    request: 'EXECUTE',
                    navigation,
                    conn,
                    inputs,
                    isSilent
                }
                const result = await this.rtewApi.callRocketTEWeb_(request)
                resolve(result)
                if ((this.options && this.options.runner && this.options.runner.doKeepWindowOnEnd === false) || isSilent){
                    this.rtewApi.close()
                }
            } catch(e) {
                if ((this.options && this.options.runner && this.options.runner.doKeepWindowOnEnd === false) || isSilent){
                    this.rtewApi.close()
                }
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
     * Customize runner acitvities. Call this before the execute() function.
     * @param {NavigationOptions} options 
     * @throws Exception when the options value is invalid
     * @example
     * try {
     *    rtewApi.runner.config({
     *      runner:{
     *        doKeepWindowOnEnd: false,
     *        isFullScreen: true
     *      }
     *    })
     *    await rtewApi.runner.execute(parentElement, navigation, conn, inputs)
     * } catch (e) {
     *    alert(e)
     * }
     */
    config(options){
        if (options){
            let optJson
            if (typeof(options) === 'string'){
                optJson = JSON.parse(options)
            } else if (typeof(options) === 'object'){
                optJson = options
            } else {
                throw 'Options value is invalid'
            }
            if (optJson.runner && optJson.runner.doKeepWindowOnEnd !== undefined && typeof(optJson.runner.doKeepWindowOnEnd) === 'boolean'){
                this.options.runner.doKeepWindowOnEnd = optJson.runner.doKeepWindowOnEnd
            }
            if (optJson.runner && optJson.runner.isFullScreen !== undefined && typeof(optJson.runner.isFullScreen) === 'boolean'){
                this.options.runner.isFullScreen = optJson.runner.isFullScreen
            }
        } else {
            throw 'Options value is invalid'
        }
    }

    /**
     * @todo Design not finalized yet. Could be deleted.
     * Open the given navigation and get ready for execution.
     * @returns {string} Resolves the execution context after the given action is done.
     * @private
     */
     async open() {
        // TBD
        return new Promise(async (resolve) => {
            const request = {
                type: 'recorder',
                request: 'EXECUTE',
                conn,
                model,
                inputVars
            }
            const result = await this.callRocketTEWeb_(request)
            resolve(result)
        })
    }
    /**
     * @todo Design not finalized yet. Could be deleted.
     * Run next step (Action)
     * @private
     * @returns {string} Resolves the execution context after the given action is done.
     */
    async runStep() {
        // TBD
        return new Promise(async (resolve) => {
            const request = {
                type: 'recorder',
                request: 'EXECUTE',
                conn,
                model,
                inputVars
            }
            const result = await this.callRocketTEWeb_(request)
            resolve(result)
        })
    }

    /**
     * @todo Design not finalized yet. Could be deleted.
     * Retrieves the navigation execution context. It includes the current status of the variables, screen, process etc.
     * @private
     * @returns {string}
     */
    async getExecutionContext() {
        // TBD
        return new Promise(async (resolve) => {
            const request = {
                type: 'recorder',
                request: 'EXECUTE',
                conn,
                model,
                inputVars
            }
            const result = await this.rtewApi.callRocketTEWeb_(request)
            resolve(result)
        })
    }
}


/**
 * Result of navigation executing
 * @typedef {Object} ExecResult
 * @property {string} status - Success/Error/Warning
 * @property {string} message - Returned message
 * @property {object} outputs - The output parameters defined in the navigation
 */
