"use strict";
/**
 * Constants for Encription
 * @author Jian Gao
 *
 * Change Logs:
 *  DATE  AUTHOR  PURPOSE
 *  2019-08-20  jgao  Initialization
 *
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncriptionConst = void 0;
class EncriptionConst {
}
EncriptionConst.rString = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
EncriptionConst.rKey = Buffer.from([45, 116, 154, 81, 215, 123, 211, 238, 143, 184, 191, 134, 142, 53, 69, 143, 192, 179, 40, 219, 10, 83, 145, 72, 199, 67, 146, 248, 2, 245, 190, 113]);
EncriptionConst.rIV = Buffer.from([0, 33, 80, 130, 76, 138, 194, 49, 111, 167, 21, 126, 242, 99, 37, 21]);
exports.EncriptionConst = EncriptionConst;
//# sourceMappingURL=encription-const.js.map