// Deprecated


// class DataStewardPoolService {

//     constructor(ds, logger){
//         this.logger = logger;
//         this.ds = ds
//     }

//     async handleAction(action, resource, key, file, data) {
//         if (action == 'RETRIEVE_KEY'){
//             this.logger.log(this.logger.FINEST, 'Retrieving key: ' + key);
//             return this.ds.retrieveKeyData(resource, key);
//         }else if (action == 'RETRIEVE_ALL'){
//             return this.ds.retrieveData(resource);
//         }else if (action == 'DELETE_PK_FILE'){
//             this.logger.log(this.logger.INFO, 'Delete data: ' + file + 'for key: ' + key);
//             const result = await this.ds.deletewithKeyFile(resource, key, file);
//             return result;
//         }else if (action == 'DELETE_PK'){
//             this.logger.log(this.logger.INFO, 'Delete data: ' + key);
//             const result = await this.ds.deletewithKey(resource, key);
//             return result;
//         }else if (action == 'ADD_DATA_PRIVATE'){
//             this.logger.log(this.logger.INFO, 'Add data: ' + file + ' for key: ' + key);
//             this.logger.log(this.logger.FINEST, 'Data to add: ' + JSON.stringify(data));
//             try{
//                 const result = await this.ds.addDataKeyValueDir(resource, key, file, data);
//                 return result;
//             }catch (err) {
//                 return err;
//             }
//         }else if (action == 'ADD_DATA_SHARED'){
//             this.logger.log(this.logger.INFO, 'Add data: ' + file);
//             this.logger.log(this.logger.FINEST, 'Data to add: ' + JSON.stringify(data));
//             try{
//                 const result = await this.ds.addDataKeyValueFile(resource, file, data);
//                 return result;
//             }catch (err) {
//                 return err;
//             }
//         }else{
//             return 'UNKNOWN ACTION';
//         }
//     }
// }

// module.exports = DataStewardPoolService;