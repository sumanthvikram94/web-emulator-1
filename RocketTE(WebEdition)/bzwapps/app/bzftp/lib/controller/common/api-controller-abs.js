"use strict";
/**
 * Abstract class for all API controllers. A controller should NOT process any business logic, but it will invoke API Service to do it.
 * @author Jian Gao
 *
 * Change Logs:
 *  DATE  AUTHOR  PURPOSE
 *  2019-08-20  jgao  Initialization
 *  2019-08-21  jgao  Add initRouter to create this.router obj, and added handleVersion middleware.
 *
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiControllerAbs = void 0;
const express_1 = require("express");
const api_const_1 = require("../../constant/api-const");
const bodyParser = __importStar(require("body-parser"));
class ApiControllerAbs {
    constructor(context) {
        this.context = context;
        this.logger = context.logger;
        this.init();
        this.service = this.determineApiService();
        this.initRouter();
        this.makeRouter();
    }
    getRouter() {
        return this.router;
    }
    /**
     * Creates the express router, and use the common middlewares.
     */
    initRouter() {
        this.router = (0, express_1.Router)();
        const logger = this.logger;
        this.router.use(bodyParser.json({ type: 'application/json', limit: '5mb' }));
        this.router.use(this.handleVersion);
    }
    /**
     * Express middleware to handle restful API version.
     * @param req
     * @param res
     * @param next
     */
    handleVersion(req, res, next) {
        if (!req.headers.version) {
            req.headers['version'] = api_const_1.APIConst.API_VERSION_1;
        }
        next();
    }
}
exports.ApiControllerAbs = ApiControllerAbs;
;
//# sourceMappingURL=api-controller-abs.js.map