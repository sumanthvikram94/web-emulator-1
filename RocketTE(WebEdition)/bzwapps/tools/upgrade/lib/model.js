"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultInfoMation = void 0;
//default value for template
exports.DefaultInfoMation = {
    version: '',
    description: 'This file will be used to upgrade RTE web server in silence',
    sourcePath: '',
    password: '',
    ingoreFolder: [],
    oldVersion: {
        workSpace: '',
        folderName: '',
        rootPath: '',
        port: 8543,
        protocol: 'http'
    },
    newVersion: {
        workSpace: '',
        folderName: '',
        rootPath: '',
        port: 8543,
        protocol: 'http'
    },
    pm2: false,
    waitTime: 40,
    silent: false,
    debug: false,
    standBy: false,
    actions: [
        { stop: {
                target: 'old',
                isService: true,
                waitTime: 20
            }
        },
        { start: {
                target: 'new',
                isService: true,
                waitTime: 40
            } },
        { upgrade: {} },
        { recover: {} }
    ]
};
//# sourceMappingURL=model.js.map