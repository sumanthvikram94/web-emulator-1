"use strict";
/**
 * API Service will process the all the business logics for each restful API.
 * Service function should be invokable for each business function.
 * @author Jian Gao
 *
 * Change Logs:
 *  DATE  AUTHOR  PURPOSE
 *  2019-08-20  jgao  Initialization
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiServiceAbs = void 0;
const exception_msg_const_1 = require("../../constant/exception-msg-const");
class ApiServiceAbs {
    constructor(context) {
        this.context = context;
        this.logger = context.logger;
    }
    /**
     * Gets the error message
     * @param e Error
     * @returns String of error message
     */
    getErrMsg(e) {
        return e.stack ? e.stack : (e.message ? e.message : exception_msg_const_1.ExceptionMsgConst.UNKNOWN_ERROR);
    }
}
exports.ApiServiceAbs = ApiServiceAbs;
//# sourceMappingURL=api-service-abs.js.map