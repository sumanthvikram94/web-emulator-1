
class ErrorHandling {

    /**
     * Constructor
     * @param {Object} context - The plugin context of which invoking this class
     */
    constructor(){

    }
    handleInternalError(err, res, logger, code) {
        logger.severe(err.stack ? err.stack : err.message);
        res.status(code ? code : 500).send({ status: false, message: err.stack ? err.stack : err.message });
    }
 
}

const errorHandler = new ErrorHandling();
module.exports = errorHandler;
