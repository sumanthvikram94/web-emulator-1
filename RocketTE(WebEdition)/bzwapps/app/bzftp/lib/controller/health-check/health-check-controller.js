"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheckRouter = void 0;
const api_controller_abs_1 = require("../common/api-controller-abs");
const health_check_service_1 = require("./health-check-service");
class HealthCheckController extends api_controller_abs_1.ApiControllerAbs {
    constructor(context) {
        super(context);
    }
    /**
     * @override
     */
    init() {
        this.logger.log(this.logger.FINEST, 'Init HealthCheck Controller');
    }
    /**
     * @override
     */
    determineApiService() {
        return new health_check_service_1.HealthCheckService(this.context);
    }
    /**
     * @override
     */
    makeRouter() {
        this.router.get('/', (request, response) => {
            const resMsg = this.service.getHeathCheckMsg();
            response.status(200).send(resMsg);
        });
    }
}
;
function healthCheckRouter(context) {
    return new Promise(function (resolve, reject) {
        let controller = new HealthCheckController(context);
        resolve(controller.getRouter());
    });
}
exports.healthCheckRouter = healthCheckRouter;
;
//# sourceMappingURL=health-check-controller.js.map