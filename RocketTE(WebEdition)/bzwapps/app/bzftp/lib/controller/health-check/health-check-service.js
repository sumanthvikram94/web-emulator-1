"use strict";
/**
 * API service for groups
 * @author Jian Gao
 *
 * Change Logs:
 *  DATE  AUTHOR  PURPOSE
 *  2019-08-20  jgao  Initialization
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckService = void 0;
const api_service_abs_1 = require("../common/api-service-abs");
class HealthCheckService extends api_service_abs_1.ApiServiceAbs {
    constructor(context) {
        super(context);
        this.healthCheckRes = 'BZSERVICE: health check api works';
    }
    /**
     * @override
     */
    determineDao() {
        // No need a dao for this API
    }
    /**
     * @override
     */
    init() {
        this.logger.log(this.logger.FINEST, 'Init Health Check Service');
    }
    getHeathCheckMsg() {
        this.logger.info('Health Check Invoked');
        return this.healthCheckRes;
    }
}
exports.HealthCheckService = HealthCheckService;
;
//# sourceMappingURL=health-check-service.js.map