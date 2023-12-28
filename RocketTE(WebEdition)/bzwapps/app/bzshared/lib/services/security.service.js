/**
 * Provides the functions to defend attacks.
 */
// Required packages
const path = require('path')
const xss = require('xss')

// Constants
const PATH_PARENT = '..'
const PATH_SAFE_SCOPE = path.join(process.cwd(), '../deploy')
const MSG_ILLEGAL_PATH = 'SECURITY: Illegal path'

class Security{

    /**
     * Filesystem path, filename, or URI manipulation
     * Throws exception when the input path is not in safe scope
     * @param {*} inputPath 
     * @returns 
     */
    static sanitizePath(inputPath){
        let normlizedPath = path.normalize(inputPath)
        if (!path.isAbsolute(inputPath)){ // Convert relative path to absolute path
            normlizedPath = path.join(process.cwd(), inputPath)
        }
        const relp = path.relative(PATH_SAFE_SCOPE, normlizedPath)
        if (relp.includes(PATH_PARENT)){ // The inputPath is out of safe scope
            throw new Error(MSG_ILLEGAL_PATH)
        }
        return inputPath
    }

    /**
     * Cross-site scripting
     * Sanitize the value of response to defend XSS
     * @param {*} str 
     * @returns 
     */
    static defendXSS(str){
        return xss(str)
    }
}

module.exports = Security