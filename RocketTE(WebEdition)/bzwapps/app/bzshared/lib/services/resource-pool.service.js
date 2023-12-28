// !!! Deprecated


/**
 * Creates seperate process for user resources, purpose is to improve performance.
 * @author Jian Gao
 */

// const ProcessPool = require('process-pool').default;
// const pool = new ProcessPool({ processLimit: 1 });
// // const DataEntities = require('../model/data-entities.config');
// // const resourceLoadService = require('./resource-load.service');

// class ResourcePool{

//     constructor(context){
//         this.logger = context.logger;
//         // this.sessionsProcess = this.initResourcePool('session', [DataEntities.sessionsShared, DataEntities.sessionsPrivate]);
//         // this.keyboardProcess = this.initResourcePool('keyboard', [DataEntities.keyboardMappingShared, DataEntities.keyboardMappingPrivate]);
//         // this.hotspotProcess = this.initResourcePool('hotsport', [DataEntities.hotspotsShared, DataEntities.hotspotsPrivate]);
//         // this.launchpadProcess = this.initResourcePool('launchpad', [DataEntities.launchpadShared, DataEntities.launchpadPrivate]);
//         // this.preferenceProcess = this.initResourcePool('preference', [DataEntities.preferenceShared, DataEntities.preferencePrivate]);
//         // this.initResources(context);
//     }

//     /**
//      * Creates a new node process and returns function that will invoke the new process
//      * @param {*} name Name of user resource
//      * @param {*} entities Data entities metadata of user resource
//      * @returns function for user resource management
//      */
//     initResourcePool(name, entities) {
//         this.logger.log(this.logger.FINEST, 'ResourcePool initResourcePool');
//         this.logger.log(this.logger.FINEST, 'Resource Name: ' + name);
//         this.logger.log(this.logger.FINEST, 'Resource Entity: ' + JSON.stringify(entities));
//         const resPool = pool.prepare(function (context){
//             const bzwLogger = require('../../../../lib/server/bzwLogging');
//             bzwLogger.setLogger();
//             const InternalDataSteward = require('../../../bzshared/lib/services/internal-data-steward.service');
//             const LoggerFile = require('../../../../lib/zlux/zlux-shared/src/logging/logger');
//             const DSPoolService = require('./data-steward-pool.service');
//             var ds = null;
//             var logger = null;
//             var dsPoolService = null;
        
//             return async function(action, resource, key, file, data) {
//                 if (action == 'INIT' && !ds){
//                     if (!resource.logger || !resource.logger.__proto__.log){
//                         let parentLogger = new LoggerFile.Logger();
//                         parentLogger.addDestination(parentLogger.makeDefaultDestination(true,true,true));
//                         logger = parentLogger.makeComponentLogger(resource.logger.componentName);
//                     }else{
//                         logger = resource.logger;
//                     }
//                     logger.log(logger.INFO, 'Init data steward for ' + context.name);
//                     resource['logger'] = logger;
//                     ds = InternalDataSteward.initWithContext(resource);
//                     for (let entity of context.entities){
//                         await ds.manageKeyValue(entity);
//                     }
//                     dsPoolService = new DSPoolService(ds, logger);
//                     return context.entities;
//                 } else {
//                     return await dsPoolService.handleAction(action, resource, key, file, data);
//                 }
//             }
//         }, {name: name, entities: entities});
//         return resPool;
//     }

//     /**
//      * setup data environment in each process
//      * @param {*} context 
//      */
//     initResources(context) {
//         try{
//             // const promSes = this.sessionsProcess('INIT', context, null);
//             // resourceLoadService.registerResourceLoad(promSes);
//             // const promKb = this.keyboardProcess('INIT', context, null);
//             // resourceLoadService.registerResourceLoad(promKb);
//             // const promHots = this.hotspotProcess('INIT', context, null);
//             // resourceLoadService.registerResourceLoad(promHots);
//             // const promLp = this.launchpadProcess('INIT', context, null);
//             // resourceLoadService.registerResourceLoad(promLp);
//             // const promPref = this.preferenceProcess('INIT', context, null);
//             // resourceLoadService.registerResourceLoad(promPref);
//         }catch(err){
//             this.logger.severe('Error while creating process pool: ' + err.message);
//         }
//     }

// }

// module.exports = ResourcePool;