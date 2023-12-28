/**
 * The wrapper class of Rocket TE Web API.
 * Referring to naming conventions of Google: {@link https://google.github.io/styleguide/jsguide.html#naming-method-names}
 */


class RocketTeWebApi {

    /**
     * @constructor
     * @param {string} serverUrl URL of the Rocket TE Web server. E.g. 'http://localhost:8543'
     */
    constructor(serverUrl) {
        if (!serverUrl) throw 'The URL to Rocket TE Web server is required!'
        this.parseUrl_(serverUrl)
        this.isLaunched = false
        this.isNewWindowOpen = false // JSTE-15841, flag for new window API, whether the new window is loaded. Especially for cross-domain.
        this.clientType = undefined
        this.hostElement = null
        this.parentElement = null
        this.inspector = () => { }
        this.doInspectSendBack = true
        this.dependElements = []
        this.intervals = new Map() // JSTE-15841, store the setIntervals here, so they can be cleared later.
        this.realMsgListener = this.receiveMessage_.bind(this) // each time when .bind is called, it will create a new function. this will make the event listner removable
        if (typeof (RocketTEWebRecorderApi) !== 'undefined') {
            this.recorder = new RocketTEWebRecorderApi(this) // Usable for navigation recorder version only
        } else {
            this.recorder = undefined
        }
        if (typeof (RocketTEWebRunnerApi) !== 'undefined') {
            this.runner = new RocketTEWebRunnerApi(this) // Usable for navigation runner version only
        } else {
            this.runner = undefined
        }
    }

    /**
     * @private
     * @param {string} serverUrl 
     */
    parseUrl_(serverUrl){
        const inputUrl = new URL(serverUrl)
        const origin = inputUrl.origin
        let pathname = inputUrl.pathname
        if (pathname.endsWith('/ZLUX/plugins/com.rs.bzw/web')){ // it's long url, http://localhost:8543/ZLUX/plugins/com.rs.bzw/web
            this.rtewUrl = origin + pathname + '/'
        } else if (pathname.endsWith('/ZLUX/plugins/com.rs.bzw/web/')){ // it's long url, http://localhost:8543/ZLUX/plugins/com.rs.bzw/web/
            this.rtewUrl = origin + pathname
        } else if (pathname.endsWith('/')){ // it's short url, http://localhost:8543/rtew/
            this.rtewUrl = origin + pathname + 'ZLUX/plugins/com.rs.bzw/web/'
        } else { // it's short url, http://localhost:8543/rtew
            this.rtewUrl = origin + pathname + 'ZLUX/plugins/com.rs.bzw/web/'
        }
        let search = inputUrl.search || '' // It should be safe, search is '' if no search. But anyway, just make it even more safe.
        if (search.length > 0){
            this.fullUrl = this.rtewUrl + search + '&isFromApi=1'
        } else {
            this.fullUrl = this.rtewUrl + '?isFromApi=1'
        }
    }

    /**
     * Creates the custom element of RTEW client inside the DOM element provided
     * @param {Element} parentElement The parent DOM element in which you want to launch Rocket TE Web
     * @param {string} [sessionName] Name of the session to open automatically
     * @param {boolean} [isHidden=false] True to hide the Rocket TE Web window even the web component is launched
     * @param {boolean} [isPreCheckField=true] Check whether field is editable before typing when running script.
     * @returns {string} Will return 'loadReady' when Rocket TE Web window is loaded
     */
    async launchAsWebComponent(parentElement, sessionName, isHidden = false, isNavRecorder = false, isFullScreen = false, isPreCheckField = true) {
        this.sessionName = sessionName
        return new Promise(async (resolve, reject) => {
            this.validateLaunch_()
            this.clientType = 'wc' // web component
            await this.appendDependency_()
            this.parentElement = parentElement ? parentElement : document.body
            this.hostElement = document.createElement('rocket-te-web')
            this.hostElement.id = 'rocket-te-web-host-element'
            this.hostElement.rteRootHref = this.rtewUrl
            this.hostElement.hidden = isHidden // Hides the element, this is the style of html element
            this.hostElement.isSilent = isHidden // Pass isSilent into bzw-root.component. There is the same @input in bzw-root.component.
            this.hostElement.isNavRecorder = isNavRecorder
            this.hostElement.isFullScreen = isFullScreen
            this.hostElement.isPreCheckField = isPreCheckField;
            if (this.sessionName) {
                this.hostElement.sessionName = this.sessionName
            }
            this.parentElement.appendChild(this.hostElement)
            window.customElements.whenDefined('rocket-te-web').then(() => {
                this.rteWebApi = this.hostElement.getRteWebApi() // get the api object when web component is upgraded.
                // Listen to the loadReady event of bzw-root.component.ts
                this.hostElement.addEventListener('jsLoadReady', (event) => {
                    console.log(event.detail)
                    this.rteWebApi.ensureApiAgent()  // The apiAgent object is created by terminal.js. When loadReady, the apiAgent should exist.
                }, true)
                
                this.hostElement.addEventListener('loadReady', (event) => {
                    resolve('loadReady') // JSTE-15129. Resolve when RTEW dashboard is load ready (ngAfterViewInit)
                }, true)

                this.hostElement.addEventListener('onClose', (event) => {
                    setTimeout(() => {
                        this.close()
                        reject(event?.detail || 'close')
                    }, 6000)
                }, true)

                // Listen to the keyStroke event of bzw-root.component.ts
                this.hostElement.addEventListener('keyStroke', (event) => {
                    const keyValue = event.detail
                    this.handleKeyStroke_(keyValue)
                })
                this.innerClose = this.hostElement.closeNavRecorder
            })
        })
    }

    /**
     * Set the base href to window global scope
     * @private
     * @param {*} href 
     */
    setRTEWBaseHref_(href){
        if (!window.rteScope){
            window.rteScope = {}
        }
        window.rteScope.baseHref = href
    }

    /**
     * Appends the elements required by Rocket TE web component
     * @private
     */
    async appendDependency_() {
        if (this.dependElements.length > 0) return // The dependencies are already added, do nothing
        // <script type="text/javascript" src=""></script>
        this.setRTEWBaseHref_(this.rtewUrl) // Sets the baseHref global var before the polyfills, so that the value can be used by bzw.module.ts
        await this.loadScript_('assets/web-streams-polyfill/ponyfill.min.js', true)
        // <script src="./lib/js/require.js" defer></script>
        await this.loadScript_('lib/js/require.js', true, false, false, 'text/javascript', () => {
            window.require.config({waitSeconds:0}); // Check it by executing requirejs.s.contexts._.config in web browser console.
        })
        /**
         * Angular dependencies
         * <script src="runtime.js" defer></script>
         * <script src="polyfills-es5.js" nomodule defer></script>
         * <script src="polyfills.js" defer></script>
         * <script src="styles.js" defer></script> // This file doesn't exist now.
         * <script src="vendor.js" defer></script>
         * <script src="main.js" defer></script>
         */
        await this.loadScript_('runtime.js', true)
        await this.loadScript_('polyfills-es5.js', true, false, true)
        await this.loadScript_('polyfills.js', true)
        await this.loadScript_('vendor.js', true)
        await this.loadScript_('main.js', true)
    }

    /**
     * Loads the given script to web page.
     * @private 
     */
    loadScript_(scriptName, isDefer = false, isAsync = false, isNoModule = false, type = 'text/javascript', onload = ()=>{}){
		return new Promise((resolve) => {
			const headEle = document.head
			const scriptEle = document.createElement('script')
			scriptEle.type = type
            scriptEle.src = this.rtewUrl + scriptName
            scriptEle.defer = isDefer
            scriptEle.async = isAsync
			if (isNoModule) {
				scriptEle.noModule = isNoModule
				resolve(true)
			} else {
				scriptEle.addEventListener('load', ()=>{
					onload()
					resolve(true)
				}, {once: true})
			}
            headEle.appendChild(scriptEle)
            this.dependElements.push(scriptEle)
		})
		
	}

    /**
     * Create an iframe in the given parent element, and open Rocket TE Web client in the iframe.
     * @param {Element} parentElement Name of a div to append the iframe
     * @param {string} iframeName Name of the iframe to open RTEW client in
     * @param {number} [height = 500] Height of the iframe window
     * @param {number} [width = 800] Width of the iframe window
     * @param {string} [sessionName] Name of the session to open automatically
     * @returns {string} Will return 'loadReady' when Rocket TE Web window is loaded
     */
    async launchAsIframe(parentElement, iframeName, height = 500, width = 800, sessionName) {
        this.sessionName = sessionName
        const sesNameUrl = this.sessionName? '&bzwSessionName=' + this.sessionName : ''
        this.url = this.fullUrl + sesNameUrl
        this.validateLaunch_()
        this.parentElement = parentElement ? parentElement : document.body
        this.clientType = 'iframe'
        this.addEventListener_()
        return new Promise((resolve) => {
            const myIframe = document.createElement('iframe')
            myIframe.onload = () => {
                this.setMsgCallback_()
                resolve('loadReady')
            }
            myIframe.id = 'rocket-te-web-host-element'
            myIframe.name = iframeName
            myIframe.height = height
            myIframe.width = width
            myIframe.src = this.url
            this.parentElement.appendChild(myIframe)
            this.cSessWin = myIframe.contentWindow // this line must be below above line
        })
    }

    /**
     * Open Rocket TE Web client in a new window.
     * <pre>
     * Notes: there is a known bug of chrome. When chrome is on a second monitor, the left offset of new window doesn't work.
     * Till this function was developed, the bug was not fixed yet. Please refer to {@link https://bugs.chromium.org/p/chromium/issues/detail?id=137681}.
     * </pre>
     * @param {number} [height = 500] Height of the new window
     * @param {number} [width = 800] Width of the new window
     * @param {number} [left = 200] Left offset of the new window position
     * @param {number} [top = 100] Top offset of the new window position
     * @param {string} [sessionName] Name of the session to open automatically
     * @returns {string} Will return 'loadReady' when Rocket TE Web window is loaded
     */
    async launchAsNewWindow(height = 500, width = 800, left = 200, top = 100, sessionName) {
        this.sessionName = sessionName
        const sesNameUrl = this.sessionName? '&bzwSessionName=' + this.sessionName : ''
        this.url = this.fullUrl + sesNameUrl
        this.validateLaunch_()
        this.clientType = 'newwindow' // web component
        return new Promise(async (resolve, reject) => {
            // this.myResolve = resolve
            this.addEventListener_()
            this.cSessWin = window.open(this.url, '_blank', 'left=' + left + ',top=' + top + ',width=' + width + ',height=' + height);
            const timer = this.registerInterval_(() => { // this.cSessWin.onbeforeunload doesn't work???
                if (this.cSessWin.closed) {
                    this.clearInterval_(timer)
                    this.close()
                }
            }, 1000)
            try {
                await this.setMsgCallbackOnLoad_() // Keep sending msg to new window, and wait for reply
                resolve(true)
            } catch (e) {
                reject(e)
                this.close()
            }
        })
    }

    /**
     * Close the RTE Web window and clear the status. Not applicable for "New Window".
     */
    async close() {
        if (this.isLaunched) {
            this.clearAllIntervals_() // Clear all alive intervals
            if (this.innerClose) {
                this.innerClose()
            }
            this.sessionName = undefined
            if (this.hostElement) {
                this.hostElement.removeEventListener('loadReady', () => { })
                this.hostElement.removeEventListener('keyStroke', () => { })
                this.hostElement.remove()
                this.hostElement = undefined
            }
            // this.dependElements.forEach((ele) => { // do not remove the dependencies, so that it doesn't download the js files when reopen.
            //     ele.remove()
            // })
            this.clientType = undefined
            if (this.parentElement) { // as web component or as iframe
                if (this.cSessWin) {
                    this.cSessWin = undefined
                    const rtewElement = document.getElementById('rocket-te-web-host-element')
                    if (rtewElement) {
                        rtewElement.remove()
                        // this.parentElement.removeChild(rtewElement)
                    }
                }
                this.parentElement = undefined
            }
            this.inspector = () => { }
            this.doInspectSendBack = true
            this.isLaunched = false
            window.removeEventListener('message', this.realMsgListener, false) // Removes the listener for message from iframe or new window.
        } else {
            console.log('Rocket TE Window is not open')
        }
    }

    /**
     * Creates a setInterval(), and register it.
	 * @private
     * @param {*} func 
     * @param {*} ms 
     * @returns {interval}
     */
    registerInterval_(func, ms = 500) {
        const interv = setInterval(func, ms)
        this.intervals.set(interv, interv)
        return interv
    }

    /**
     * Clear the given interval
	 * @private 
     * @param {*} interval  	 
     */
    clearInterval_(interval) {
        clearInterval(interval)
        this.intervals.delete(interval)
    }

    /**
     * Clear all the intervals that are still alive
     * @private
     */
     clearAllIntervals_() {
        if (this.intervals.size > 0) {
            this.intervals.forEach((value, key) => {
                clearInterval(value)
                this.intervals.delete(key)
            })
        }
    }

    /**
     * Avoid launching RTE Web Window multiple times
     * @private
     */
    validateLaunch_() {
        if (this.isLaunched){
            throw 'Rocket TE Web is already launched'
        }
        this.isLaunched = true
    }

    validateIsLaunched_(){
        if (!this.isLaunched){
            throw 'Rocket TE Web is not launched' 
        }
    }

    /**
     * Listen for the messages of iframe/new window
     * @private
     */
    addEventListener_() {
        window.addEventListener('message', this.realMsgListener, false);
    }

    /**
     * Handle the message received from iframe/new window
     * @private
     * @param {event} event 
     */
    receiveMessage_(event) {
        const keyValue = event.data.toString();
        if ( keyValue === 'host_SetCallback_ACK' ) { // JSTE-15841, ACK from new window after page load.
            this.isNewWindowOpen = true
            return
        } else if (keyValue === 'API_AGENT_EVENT_REDIRECT' && this.inspector !== undefined) { // Ensure key inspector after redirect
            this.setKeyInspector(this.inspector)
        }
        if (this.handleKeyStroke_(keyValue)) {
            return
        }
        if (keyValue.startsWith('[RTEW_API_ERROR]') && this.reject) {
            this.reject(keyValue)
        } else if (this.myResolve) {
            this.myResolve(event.data) // validate sender(event.origin) in production
        }
    }

    /**
     * Handle the inspected keyValue from terminal
     * @private
     * @param {string} keyValue 
     * @returns {boolean} True if it's inspected, otherwise false
     */
    handleKeyStroke_(keyValue) {
        let i = keyValue.indexOf('handleFunctionIntercept:')
        if (i !== -1) {
            let keyName = '<' + keyValue.substring(i + 24) + '>';
            if (this.doInspectSendBack) { // inspect the key and optionally pass it back to the terminal for processing
                this.sendKey(keyName);
            }
            this.inspector(keyName) // call the inspector function customized by consumper. By default, it does nothing.
            return true
        }
        return false
    }

    /**
     * Sends the api call to inside of Rocket TE Web window
     * @private
     * @param {string} request 
     * @returns {Promise} When request execution completes, it will return the outputs from the request if success, or error.
     */
    async callRocketTEWeb_(request) {
        return new Promise(async (resolve, reject) => {
            if (this.clientType === 'wc') { // it's the web component api
                try {
                    const outputs = await this.rteWebApi.handleRequest(request) // rtew api will return the object of automationObject.outputs
                    const myRetVal = outputs && outputs.myRetVal !== undefined ? outputs.myRetVal : (outputs? outputs: true)
                    if (myRetVal.then !== undefined && typeof (myRetVal.then) === 'function'
                        && myRetVal.catch !== undefined && typeof (myRetVal.catch) === 'function') { // In case return value is a promise
                        myRetVal.then((value) => {
                            resolve(value)
                        }).catch((err) => {
                            reject(err)
                        })
                    } else { // In case return value is not promise
                        resolve(myRetVal)
                    }
                } catch (err) {
                    reject(err)
                }
            } else {
                this.myResolve = resolve
                this.reject = reject
                this.cSessWin.postMessage(request, '*');		// use targetOrigin in production
            }
        });
    }

    /**
     * Plays the given scriptSource in terminal. Use this function in case your action is not supported by any formal API functions
     * @param {string} scriptSource String containing script source code. For details about script, refer to the script document: http://localhost:8543/ZLUX/plugins/com.rs.bzw/web/lib/js/scriptsDoc/index.html
     * @returns {object} Will return an outputs object in case automationObj.outputs is assigned a value inside of the script source
     * @throws Will throw error in case Rocket TE Web is not launched
     * @example
     * const scriptStr = "automationObject.connect(); \n myObj = automationObject.getRowColumn(); \n automationObject.outputs.myRetVal = myObj.row;";
     * const row = await rtewApi.playScript(scriptStr);
     */
    async playScript(scriptSource) {
        this.validateIsLaunched_()
        return await this.callRocketTEWeb_(scriptSource);
    }

    /**
     * Same as playScript(). Backward compatible to old version function name.
     */
    async host_PlayScript(scriptSource) {
        return await this.playScript(scriptSource)
    }

    /**
     * Initiate a connection to the host system.
     * @param {string} wsUrl the URL to the Rocket TE Web proxy server.
     * @param {string} host the host address of the host system.
     * @param {number} port the port number of the host system.
     * @param {number} security 0 for non-secure; or non-zero for secure connection.
     * @returns {boolean} True if succeed
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async connect(wsUrl, host, port, security) {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.outputs.myRetVal = virtualScreen.connect\n" + wsUrl + "\n" + host + "\n" + port + "\n" + security;
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as connect(). Backward compatible to old version function name.
     */
    async host_Connect(wsUrl, host, port, security) {
        return await this.connect(wsUrl, host, port, security)
    }

    /**
     * Disconnect from the host system.
     * @returns {boolean} True if succeed
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async disconnect() {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.outputs.myRetVal = virtualScreen.disconnect";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as disconnect(). Backward compatible to old version function name.
     */
    async host_Disconnect() {
        return await this.disconnect()
    }

    /**
     * Set keyboard focus to the session.
     * @returns {boolean} True if succeed
     * @throws Will throw error in case Rocket TE Web is not isLaunched
     */
    async focus() {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.outputs.myRetVal = virtualScreen.focus";
        if (this.cSessWin) this.cSessWin.focus();
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as focus(). Backward compatible to old version function name.
     */
    async host_Focus() {
        return await this.focus()
    }

    /**
     * Retrieve the cursor Row position.
     * @returns {number} Cursor Row position
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async getCursorRow() {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "myObj = automationObject.getRowColumn();\n" +
            "automationObject.outputs.myRetVal = myObj.row;";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as getCursorRow(). Backward compatible to old version function name.
     */
    async host_GetCursorRow() {
        return await this.getCursorRow()
    }

    /**
     * Retrieve the cursor column position.
     * @returns {number} Cursor column position
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async getCursorColumn() {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "myObj = automationObject.getRowColumn();\n" +
            "automationObject.outputs.myRetVal = myObj.column;";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as getCursorColumn(). Backward compatible to old version function name.
     */
    async host_GetCursorColumn() {
        return await this.getCursorColumn()
    }

    /**
     * Read text from the host screen.
     * @param {number} row the row position of the text.
     * @param {number} col the column position of the text.
     * @param {number} len the length of the text to retrieve.
     * @returns {string} Text on screen
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async getText(row, col, len) {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "automationObject.outputs.myRetVal = automationObject.getText(" + row + ", " + col + ", " + len + ");\n";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as getText(). Backward compatible to old version function name.
     */
    async host_GetText(row, col, len) {
        return await this.getText(row, col, len)
    }

    /**
     * Returns false if the session is disconnected or connecting 
     * to the host system; or returns true if the session is connected to the host
     * system.
     * @returns {boolean} True if connected
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async isConnected() {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.outputs.myRetVal = virtualScreen.isConnected"
        return await this.callRocketTEWeb_(mySource)
    }

    /**
     * Same as isConnected(). Backward compatible to old version function name.
     */
    async host_IsConnected() {
        return await this.isConnected()
    }

    /**
     * Read text from the host screen.
     * @param {number} startRow The start row position of the text to retrieve.
     * @param {number} startCol The start column position of the text to retrieve.
     * @param {number} endRow The end row position of the text to retrieve.
     * @param {number} endCol The end column position of the text to retrieve.
     * @returns {string} Text on screen
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async readScreen(startRow, startCol, endRow, endCol) {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.outputs.myRetVal = virtualScreen.getScreenContents\n" + startCol + "\n" + endCol + "\n" + startRow + "\n" + endRow;
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as readScreen(). Backward compatible to old version function name.
     */
    async host_ReadScreen(startRow, startCol, endRow, endCol) {
        return await this.readScreen(startRow, startCol, endRow, endCol)
    }

    /**
     * Type text and/or function keys in the session at the current cursor position.
     * @param {string} keyStr The string of text and/or function keys enclosed in <> brackets.
     * @returns {boolean} True if successfully typed
     * @throws Will throw error in case Rocket TE Web is not launched
     * @example 
     * rtewApi.sendKey("userid<Tab>password<Enter>");
     * 
     */
    async sendKey(keyStr) {
        this.validateIsLaunched_()
        let i, j, tempStr;
        let mySource = "automationObject.connect();\n";
        while (1) {
            i = keyStr.indexOf("<"); j = keyStr.indexOf(">");
            if ((i == -1) || (j == -1)) {
                if (keyStr != "") {
                    mySource = mySource + "automationObject.autoTypeJS('" + keyStr + "');\n";
                }
                break;
            }
            else if (j < i) {
                tempStr = keyStr.substring(0, i);
                mySource = mySource + "automationObject.autoTypeJS('" + tempStr + "');\n";
                keyStr = keyStr.substring(i);
            }
            else {
                tempStr = keyStr.substring(0, i);
                if (tempStr != "") {
                    mySource = mySource + "automationObject.autoTypeJS('" + tempStr + "');\n";
                }
                tempStr = keyStr.substring(i + 1, j);
                if (tempStr != "") {
                    if ((tempStr.indexOf("Att") != -1) || (tempStr.indexOf("Clear") != -1) ||
                        (tempStr.indexOf("Enter") != -1) || (tempStr.indexOf("PA") != -1) ||
                        (tempStr.indexOf("PF") != -1) || (tempStr.indexOf("Print") != -1) ||
                        (tempStr.indexOf("Sys") != -1) || (tempStr.indexOf("Test") != -1)) {
                        mySource = mySource + "yield *automationObject.sendFunctionYield('" + tempStr + "');\n";
                    }
                    else {
                        mySource = mySource + "automationObject.sendFunction('" + tempStr + "');\n";
                    }
                }
                keyStr = keyStr.substring(j + 1);
            }
        }
        mySource = mySource + "automationObject.outputs.myRetVal = true";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as sendKey(). Backward compatible to old version function name.
     */
    async host_SendKey(keyStr) {
        return await this.sendKey(keyStr)
    }


    /**
     * Move the cursor to a new position in the host screen.
     * @param {number} row the row position.
     * @param {number} col the column position.
     * @returns {boolean} True if succeed, otherwise false.
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async setCursor(row, col) {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "automationObject.outputs.myRetVal = automationObject.setRowColumn(" + row + ", " + col + ");";
        return await this.callRocketTEWeb_(mySource);
    }

     /**
     * Verify if the designated location allows input.
     * @param {number} row the row position.
     * @param {number} col the column position.
     * @returns {boolean} true | false: If it is true, the current position can be entered, otherwise it cannot be entered.
     * @throws Will throw error in case Rocket TE Web is not launched
     */
     async isEditable(row, col) {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "automationObject.outputs.myRetVal = automationObject.isEditable(" + row + ',' + col + ");";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as setCursor(). Backward compatible to old version function name.
     */
    async host_SetCursor(row, col) {
        return await this.setCursor(row, col)
    }

    /**
     * Prompt the user for masked input and type the response 
     * in the session at the current cursor position.
     * @returns {boolean} True if succeed, otherwise false.
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async typePassword() {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "automationObject.outputs.myRetVal = yield *automationObject.typePassword();";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as typePassword(). Backward compatible to old version function name.
     */
    async host_TypePassword() {
        return await this.typePassword()
    }

    /**
     * Type text in the session at the current cursor position.
     * @param {string} str String to be typed on screen. 
     * @returns {boolean} True if succeed, otherwise false.
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async typeString(str) {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "automationObject.outputs.myRetVal = automationObject.autoTypeJS('" + str + "');";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as typeString(). Backward compatible to old version function name.
     */
    async host_TypeString(str) {
        return await this.typeString(str)
    }

    /**
     * Pause the specified number of milliseconds.
     * @param {number} ms 
     * @returns {boolean} True if succeed, otherwise false.
     * @throws Will throw error in case Rocket TE Web is not launched
     */
    async wait(ms) {
        this.validateIsLaunched_()
        const mySource =
            "automationObject.connect();\n" +
            "automationObject.outputs.myRetVal = yield *automationObject.waitJS(" + ms + ");";
        return await this.callRocketTEWeb_(mySource);
    }

    /**
     * Same as wait(). Backward compatible to old version function name.
     */
    async host_Wait(ms) {
        return await this.wait(ms)
    }

    /**
     * Enable the terminal to post messages back to API object
     * @private
     */
    async setMsgCallback_() {
        const mySource = "host_SetCallback";
        this.callRocketTEWeb_(mySource);
    }

    /**
     * Recursively sends host_SetCallback until the new window replies or timeout.
     * This is designed for new window only. Web component and iframe has event we can trust. The load event of new window is blocked when cross origin, that why we need this.
     * @private
     */
    async setMsgCallbackOnLoad_() {
        if (this.cSessWin) {
            return new Promise((resolve, reject) => {
                this.isNewWindowOpen = false // make sure the flag is false
                const mySource = 'host_SetCallback'
                let timesCount = 120 // maximum wait time is 1 minute. 2 times per second x 60 seconds.
                const msgInterval = this.registerInterval_(() => {
                    if (this.isNewWindowOpen === true) { // New window is awake
                        this.clearInterval_(msgInterval) // Break the loop
                        this.isNewWindowOpen = false // resets status to default
                        resolve('succeed')
                        return true // The return value actually means nothing
                    }
                    if (timesCount <= 0) {
                        this.clearInterval_(msgInterval) // Break the loop
                        reject('No reply from new window')
                        return false // The return value actually means nothing
                    }
                    this.cSessWin.postMessage(mySource, '*')
                    timesCount --
                }) // send the msg each 500 miliseconds
            })
        } else {
            throw new Error('No session window found')
        }

    }

    /**
     * Enable the key interceptor in terminal.js
     * It will recersively check the session is connected until timeout.
     * Reason why it need to wait for session connect?
     *  - In case of SSO without iframe, the new window will be redirected for several times before the session can connect.\
     *    If the msg is sent before the final redirection, the msg won't be handled.
     * Better solution would be trigger 
     * @private
     */
    async enableIntercepting_() {
        const mySource = "ENALBE_KEY_INTERCEPTING";
        let timesCount = 1500 // maximum wait time is 5 minutes. 5 times per second x 60 seconds x 5 minutes
        const msgInterval = this.registerInterval_(async () => {
            const isConnected = await this.isConnected()
            if ( isConnected === true) { // New window is awake
                this.callRocketTEWeb_(mySource);
                this.clearInterval_(msgInterval) // Break the loop
                return true // The return value actually means nothing
            }
            if (timesCount <= 0) {
                this.clearInterval_(msgInterval) // Break the loop
                throw new Error('No reply from new window')
            }
            timesCount --
        }, 200)
    }

    /**
     * @deprecated No need to call it anymore
     */
    async host_SetCallback() {
        // do nothing
    }

    /**
     * Set inspector callback function and sendBackTheKey
     * @param {Function} [callback = (keyName) => {}] Function invoked when AID pressed in terminal. It takes the keyName as parameter. Like (keyName) => {console.log(keyName)} 
     * @param {boolean} [sendBackTheKey = true] True to send the AID back to terminal for execution.
     */
    setKeyInspector(callback, sendBackTheKey = true) {
        if (callback !== undefined && typeof (callback) === 'function') {
            this.inspector = callback
        } else {
            throw 'inspector callback must be a function'
        }
        this.doInspectSendBack = sendBackTheKey
        this.enableIntercepting_()
    }

}
