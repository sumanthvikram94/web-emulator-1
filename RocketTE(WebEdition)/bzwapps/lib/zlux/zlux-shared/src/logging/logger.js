"use strict";
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
Object.defineProperty(exports, "__esModule", { value: true });
// https://console.spec.whatwg.org/#logger
// consider formatting ideas
// consider grouping ideas 
// time/data/functionname/linenumber
// maybe polyfill from https://www.stacktracejs.com/#!/docs/stacktrace-js 
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["SEVERE"] = 0] = "SEVERE";
    LogLevel[LogLevel["WARNING"] = 1] = "WARNING";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["FINE"] = 3] = "FINE";
    LogLevel[LogLevel["FINER"] = 4] = "FINER";
    LogLevel[LogLevel["FINEST"] = 5] = "FINEST";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
var ComponentLogger = /** @class */ (function () {
    function ComponentLogger(parentLogger, componentName) {
        this.parentLogger = parentLogger;
        this.componentName = componentName;
        this.SEVERE = LogLevel.SEVERE;
        this.WARNING = LogLevel.WARNING;
        this.INFO = LogLevel.INFO;
        this.FINE = LogLevel.FINE;
        this.FINER = LogLevel.FINER;
        this.FINEST = LogLevel.FINEST;
    }
    ComponentLogger.prototype.makeSublogger = function (componentNameSuffix) {
        return new ComponentLogger(this.parentLogger, this.componentName + ':' + componentNameSuffix);
    };
    ComponentLogger.prototype.log = function (minimumLevel, message) {
        this.parentLogger.log(this.componentName, minimumLevel, message);
    };
    ComponentLogger.prototype.severe = function (message) {
        this.parentLogger.log(this.componentName, LogLevel.SEVERE, message);
    };
    ComponentLogger.prototype.info = function (message) {
        this.parentLogger.log(this.componentName, Logger.INFO, message);
    };
    ComponentLogger.prototype.warn = function (message) {
        this.parentLogger.log(this.componentName, Logger.WARNING, message);
    };
    ComponentLogger.prototype.debug = function (message) {
        this.parentLogger.log(this.componentName, Logger.FINE, message);
    };
    return ComponentLogger;
}());
exports.ComponentLogger = ComponentLogger;
var RegExpLevel = /** @class */ (function () {
    function RegExpLevel(regex, level) {
        this.regex = regex;
        this.level = level;
    }
    return RegExpLevel;
}());
var Logger = /** @class */ (function () {
    function Logger() {
        this.componentLoggers = new Map();
        this.knownComponentNames = [];
        this.configuration = {};
        this.destinations = new Array();
        this.previousPatterns = new Array();
    }
    Logger.prototype.addDestination = function (destinationCallback) {
        this.destinations.push(destinationCallback);
    };
    Logger.prototype.shouldLogInternal = function (componentName, level) {
        var configuredLevel = this.configuration[componentName];
        if (configuredLevel === undefined) {
            configuredLevel = Logger.INFO;
        }
        return configuredLevel >= level;
    };
    ;
    Logger.prototype.consoleLogInternal = function (componentName, minimumLevel, message, prependDate, prependName, prependLevel) {
        var formattedMessage = '[';
        if (prependDate) {
            var d = new Date();
            var msOffset = d.getTimezoneOffset() * 60000;
            d.setTime(d.getTime() - msOffset);
            var dateString = d.toISOString();
            dateString = dateString.substring(0, dateString.length - 1).replace('T', ' ');
            formattedMessage += dateString + ' ';
        }
        if (prependName) {
            formattedMessage += componentName + ' ';
        }
        if (prependLevel) {
            formattedMessage += LogLevel[minimumLevel];
        }
        formattedMessage += "] - " + message;
        console.log(formattedMessage);
    };
    ;
    Logger.prototype.makeDefaultDestination = function (prependDate, prependName, prependLevel) {
        var theLogger = this;
        return function (componentName, minimumLevel, message) {
            if (theLogger.shouldLogInternal(componentName, minimumLevel)) {
                theLogger.consoleLogInternal(componentName, minimumLevel, message, prependDate, prependName, prependLevel);
            }
        };
    };
    ;
    Logger.prototype.log = function (componentName, minimumLevel, message) {
        this.noteComponentNameInternal(componentName);
        this.destinations.forEach(function (destinationCallback) {
            destinationCallback(componentName, minimumLevel, message);
        });
    };
    ;
    Logger.prototype.setLogLevelForComponentPattern = function (componentNamePattern, level) {
        var theLogger = this;
        var componentNameArray = Object.keys(this.configuration);
        var regex = new RegExp(componentNamePattern);
        this.previousPatterns.push(new RegExpLevel(regex, level));
        componentNameArray.filter(function (componentName) {
            return regex.test(componentName);
        }).forEach(function (componentName) {
            theLogger.configuration[componentName] = level;
        });
    };
    ;
    Logger.prototype.setLogLevelForComponentName = function (componentName, level) {
        if (level >= LogLevel.SEVERE && level <= LogLevel.FINEST) {
            this.configuration[componentName] = level;
        }
    };
    Logger.prototype.getComponentLevel = function (componentName) {
        return this.configuration[componentName];
    };
    Logger.prototype.noteComponentNameInternal = function (componentName) {
        if (!this.knownComponentNames.find(function (name) { return name == componentName; })) {
            this.knownComponentNames.push(componentName);
        }
    };
    ;
    Logger.prototype.replayPatternsOnLogger = function (componentName) {
        for (var i = this.previousPatterns.length - 1; i > -1; i--) {
            var pattern = this.previousPatterns[i];
            if (pattern.regex.test(componentName)) {
                this.setLogLevelForComponentName(componentName, pattern.level);
                return true;
            }
        }
        return false;
    };
    Logger.prototype.makeComponentLogger = function (componentName) {
        var componentLogger = this.componentLoggers.get(componentName);
        if (componentLogger) {
            this.consoleLogInternal("<internal>", LogLevel.WARNING, 'Logger created with identical component name to pre-existing logger. Messages overlap may occur.', true, false, true);
        }
        else {
            componentLogger = new ComponentLogger(this, componentName);
            this.configuration[componentName] = LogLevel.INFO;
            this.componentLoggers.set(componentName, componentLogger);
            this.replayPatternsOnLogger(componentName);
        }
        return componentLogger;
    };
    Logger.SEVERE = LogLevel.SEVERE;
    Logger.WARNING = LogLevel.WARNING;
    Logger.INFO = LogLevel.INFO;
    Logger.FINE = LogLevel.FINE;
    Logger.FINER = LogLevel.FINER;
    Logger.FINEST = LogLevel.FINEST;
    return Logger;
}());
exports.Logger = Logger;
/*
  © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved.
  ROCKET SOFTWARE, INC. CONFIDENTIAL
*/
//# sourceMappingURL=logger.js.map