
const fse = require('fs-extra');
const fs = fse;
const path = require('path');
const Promise = require('bluebird');
const Utils = require('./utils.service');
const Queue = require('better-queue');
const request = require('request');
const zoweService = require('./zowe.service');
const LoggerFile = require(zoweService.loggerPath);
const resourceLoadService = require('./resource-load.service');

// Constants
const EDIT = 'edit';
const KEY_CONNECTOR = String.fromCharCode(0x00ff); // use a char with big code can make sure a right sort order for PK+KEY_CONNECTOR+SUBKEY

// Constraints
const CONSTRAINT_PK_LOWERCASE = 'CST_PK_LC';
const CONSTRAINT_FILE_NAME_ENCODEURI = 'CST_FILE_ENCURI';
const CONSTRAINT_FILE_NAME_PK_LOWERCASE = 'CST_FILE_NAME_PK_LC';

// Messages
const MSG_DATA_ENTITY_EXIST = 'Data entity already exist';
const MSG_DATA_ENTITY_NOT_EXIST = 'Data entity not exist';
const MSG_DATA_FILTER_NOT_STRING = 'Data filter must be a string';
const MSG_INDEX_COLUMN_NOT_STRING = 'Index column must be a string';
const MSG_INDEX_COLUMN_NOT_PROVIDED = 'Index column must be provided';
const MSG_INDEX_COLUMN_IS_NULL = 'Index column must exist in data';
const MSG_PARAMETER_IS_NULL = 'Parameters must be provided';
const MSG_INDEX_NOT_EXIST = 'Index not exist';
const MSG_PK_ALREADY_EXIST = 'Primary key already exist';
const MSG_DELETE_DATA_NOT_EXIST = 'The data to delete not exist';
const MSG_PK_NOT_PROVIDED = 'Primary key value to delete not provided';
const MSG_FILE_NOT_PROVIDED = 'File to delete not provided';
const MSG_DATA_ENTITY_HAS_NO_PK = 'The data entity do not have PK';
const MSG_DATA_ENTITY_TYPE_ERROR = 'Data entity type not correct';
const MSG_PARAM_TYPE_ARRAY = 'Expecting array as parameter';
const MSG_DATA_ENTITY_HAS_NO_JOINT_KEY = 'The data entities must have key under same folder';
const MSG_ERROR_DELETE_DATA = 'Error while delete data';


// Data type is key value pair, key is file name under a dir
// Data is stored in memory as an Object
const DT_KEY_VALUE_FILE = 'KEY_VALUE_FILE';

// Data type is key value pair, key is dir name under a dir
// Data is stored in memory as an Object
const DT_KEY_VALUE_DIR = 'KEY_VALUE_DIR';

// Data type is list, key is file name under a dir
// Data is stored in memory as an Array
const DT_LIST_FILE = 'LIST_FILE'; 

//const DT_LIST_DIR = 'LIST_DIR'; //Ignore this. there shouldn't be such kind of data.

/*
    - change string to obj???
*/

class InternalDataSteward {

    constructor(storagePath, logger){
        this.logger = logger;
        this.dataEntity = {};
        this.basePath = storagePath;
        this.createQueue();
        this.util=Utils.init(logger);
    }

    async manage(dataEntity){
        if (!dataEntity.dataType) { // Assign a default dataType
            dataEntity.dataType = DT_LIST_FILE;
        }
        let dataEntityName = dataEntity.name;
        if (this.dataEntity[dataEntityName]){ // Avoid manage same data entity multiple times
            return {status: true, message: MSG_DATA_ENTITY_EXIST};
        }
        this.dataEntity[dataEntityName] = {};
        const dataFilePath = path.join(this.basePath, dataEntity.filePath);
        this.dataEntity[dataEntityName].metadata = dataEntity;
        this.dataEntity[dataEntityName].index = [];
        this.dataEntity[dataEntityName].data = [];
        this.dataEntity[dataEntityName].values = [];
        const dataLoad = new Promise(async (resolve, reject)=>{
            this.util.getData(dataFilePath, dataEntity.fileFilter).then((data) => {
                if (!data) return;
                this.dataEntity[dataEntityName].data = data;
                
                if (dataEntity.primaryKey){
                    this.buildIndex(dataEntityName, dataEntity.primaryKey);
                }
                // this.buildValues(dataEntityName);
                this.dataEntity[dataEntityName].values = this.dataEntity[dataEntityName].data;
                resolve(dataEntity);
            });
        });
        resourceLoadService.registerResourceLoad(dataLoad);
    }
    
    async manageKeyValue(dataEntity){
        let dataEntityName = dataEntity.name;
        if (this.dataEntity[dataEntityName]){ // Avoid manage same data entity multiple times
            return {status: true, message: MSG_DATA_ENTITY_EXIST};
        }
        this.logger.log(this.logger.FINE, 'Registering data entity: ' + dataEntity.name);
        this.dataEntity[dataEntityName] = {};
        this.dataEntity[dataEntityName].metadata = dataEntity;
        this.dataEntity[dataEntityName].index = {};
        this.dataEntity[dataEntityName].data = {};
        this.dataEntity[dataEntityName].values = [];
        if (dataEntity.primaryKey){
            this.dataEntity[dataEntityName].index[dataEntity.primaryKey] = [];
        }
        if ( dataEntity.dataType && dataEntity.dataType == DT_KEY_VALUE_DIR){
            const dataKeyPath = path.join(this.basePath, dataEntity.filePath);
            const keys = this.util.getFiles(dataKeyPath);
            if (dataEntity.excludeKeys){
                dataEntity.excludeKeys.forEach((eKey) => {
                    keys.splice(keys.indexOf(eKey),1);
                })
            }
            const keysLength = keys.length;
            this.logger.info(`Loading ${keysLength} records for: ${dataEntity.name}. `);
            let loadedCount = 0;
            if (keys) {
                const dataLoad = new Promise(async (resolve, reject)=>{
                    for (let key of keys) {
                        const dataValuePath = path.join(dataKeyPath, key, dataEntity.fileInnerPath);
                        let data;
                        if (dataEntity.fileName){
                            data = await this.util.getDataObjSimple(dataValuePath, dataEntity.fileName);
                        }else {
                            data = await this.util.getDataObj(dataValuePath, dataEntity.fileFilter);
                        }
                        loadedCount ++;
                        if (loadedCount % 500 === 0){
                            this.logger.info(`Loaded ${loadedCount} records for: ${dataEntity.name}. `);
                        }
                        if (!data) return;
                        this.logger.log(this.logger.FINE, 'Caching data for: ' + dataEntity.name + '[' + key + ']');
                        for (let obj of data){
                            if (!obj.file){
                                continue;
                            }
                            if (!this.dataEntity[dataEntityName].data[key]){ // create the obj for a key only when it has data.
                                this.dataEntity[dataEntityName].data[key] = {};
                            }
                            this.dataEntity[dataEntityName].data[key][obj.file] = obj;
                            // builds the index with key and sub key
                            const indStr = this.getCombinedIndex(key, obj.file);
                            this.dataEntity[dataEntityName].index[dataEntity.primaryKey].push(indStr);
                            this.dataEntity[dataEntityName].values.push(obj.data);
                        }
                        this.logger.log(this.logger.FINEST, 'this.dataEntity['+dataEntityName+']: ' + JSON.stringify(this.dataEntity[dataEntityName]));
                        
                        if (loadedCount === keysLength){
                            this.logger.info(`Loaded ${loadedCount} records for: ${dataEntity.name}. `);
                            this.logger.info(`Loading for: ${dataEntity.name} complete!`);
                            resolve(dataEntity);
                        }
                    }
                });
                resourceLoadService.registerResourceLoad(dataLoad);
                return {status: true};
            }
        }else if (dataEntity.dataType && dataEntity.dataType == DT_KEY_VALUE_FILE){
            const dataFilePath = path.join(this.basePath, dataEntity.filePath);
            const dataLoad = new Promise(async (resolve, reject)=>{
                await this.util.getDataObj(dataFilePath, dataEntity.fileFilter).then((data) => {
                    if (!data) return;
                    this.logger.log(this.logger.FINE, 'Caching data for: ' + dataEntity.name);
                    for (let obj of data){
                        let key = obj.file;
                        this.logger.log(this.logger.FINE, 'Caching data for: ' + dataEntity.name + '[' + key + ']');
                        this.dataEntity[dataEntityName].data[key] = obj;
                        this.dataEntity[dataEntityName].index[dataEntity.primaryKey].push(key);
                    }
                    this.logger.log(this.logger.FINEST, 'this.dataEntity['+dataEntityName+']: ' + JSON.stringify(this.dataEntity[dataEntityName]));
                    resolve(dataEntity);
                });
            });
            resourceLoadService.registerResourceLoad(dataLoad);
            return {status: true};
        }else {
            this.logger.warn('Unknown data type of data entity: ' + dataEntity.name);
            return {status: false, message: 'Unknown data type of data entity: ' + dataEntity.name};
        }
    }

    buildIndex(dataEntityName, column){
        if (!this.dataEntity[dataEntityName]) {
            return MSG_DATA_ENTITY_NOT_EXIST;
        }
        if (column && typeof(column) !== 'string'){
            return MSG_INDEX_COLUMN_NOT_STRING;
        }
        if (!column){
            return MSG_INDEX_COLUMN_NOT_PROVIDED;
        }

        let index = [];
        let rowObj = {};
        try{
            this.dataEntity[dataEntityName].data.forEach((element)=>{
                // rowObj = JSON.parse(element);
                let val = element[column];
                if (!val){
                    return MSG_INDEX_COLUMN_IS_NULL;
                }
                //Should here check duplicated value for index? Maybe no for now. this can be controled by insertion. This check will have performance issue.
                index.push(val);
            });
        }catch (e) {
            this.logger.warn('ERROR in build index');
            return e
        }
        this.dataEntity[dataEntityName].index[column] = index;
        return true;
    }

    retrieveIndex(dataEntityName, indexName){
        if (!dataEntityName || !indexName){
            return MSG_DATA_ENTITY_NOT_EXIST;
        }
        if (! this.dataEntity[dataEntityName]) {
            return MSG_PARAMETER_IS_NULL;
        }

        let index = this.dataEntity[dataEntityName].index[indexName];
        if (index && Array.isArray(index)){
            return index.slice(0);
        }else{
            return MSG_INDEX_NOT_EXIST;
        }
    }

    retrievePKIndex(dataEntityName){
        const pk = this.dataEntity[dataEntityName].metadata.primaryKey;
        return this.retrieveIndex(dataEntityName, pk);
    }

    async retrieveDataAsync(dataEntityName){
        this.logger.log(this.logger.FINE, 'Retrieving data for: ' + dataEntityName);

        if (! this.dataEntity[dataEntityName]) {
            this.logger.log(this.logger.FINE, 'The data entity to retrieve does not exist : ' + dataEntityName);
            return MSG_DATA_ENTITY_NOT_EXIST;
        }

        let result = {};
        if (Array.isArray(this.dataEntity[dataEntityName].data)){
            const dataSet = this.dataEntity[dataEntityName].data.slice(0);
            result = {
                rowCount:dataSet? dataSet.length : 0,
                data:dataSet
            };
        }else if (typeof(this.dataEntity[dataEntityName].data) == 'object'){
            let dataSet = {};
            Object.assign(dataSet, this.dataEntity[dataEntityName].data);
            result = {
                rowCount: Object.entries(dataSet).length ? Object.entries(dataSet).length : 0,
                data:dataSet
            };
        }else {
            result = {
                rowCount: 0,
                data: null
            };
        }
        return result;
    }

    
    retrieveKeyData(dataEntityName,key){
        this.logger.log(this.logger.FINE, 'Retrieving data for: ' + dataEntityName);
        if (! this.dataEntity[dataEntityName]) {
            this.logger.log(this.logger.FINE, 'The data entity to retrieve does not exist : ' + dataEntityName);
            return MSG_DATA_ENTITY_NOT_EXIST;
        }
        this.logger.log(this.logger.FINEST, 'data type:' + typeof(this.dataEntity[dataEntityName].data));
        this.logger.log(this.logger.FINEST, 'is array:' + Array.isArray(this.dataEntity[dataEntityName].data));
        this.logger.log(this.logger.FINEST, 'data:' + JSON.stringify(this.dataEntity[dataEntityName].data));

        let result = {};
        if (Array.isArray(this.dataEntity[dataEntityName].data)){
            //TBD What if retrieve data of Array type with this function?
            return null;
        }else if (typeof(this.dataEntity[dataEntityName].data) == 'object'){
            let data = {};
            Object.assign(data, this.dataEntity[dataEntityName].data[key]);
            result = {
                rowCount: Object.entries(data).length ? Object.entries(data).length : 0,
                data:data
            };
        }else {
            result = {
                rowCount: 0,
                data: []
            };
        }

        this.logger.log('retrieve key data result:' + JSON.stringify(result));
        return result;
    }

    /**
     * Returns the data of entire data entity. It keeps the data format as storage.
     * @param {*} dataEntityName 
     */
    retrieveData(dataEntityName){
        this.logger.log(this.logger.FINE, 'Retrieving data for: ' + dataEntityName);

        if (! this.dataEntity[dataEntityName]) {
            this.logger.log(this.logger.FINE, 'The data entity to retrieve does not exist : ' + dataEntityName);
            return MSG_DATA_ENTITY_NOT_EXIST;
        }

        this.logger.log(this.logger.FINEST, 'data type:' + typeof(this.dataEntity[dataEntityName].data));
        this.logger.log(this.logger.FINEST, 'is array:' + Array.isArray(this.dataEntity[dataEntityName].data));
        this.logger.log(this.logger.FINEST, 'data:' + JSON.stringify(this.dataEntity[dataEntityName].data));

        let result = {};
        // if (Array.isArray(this.dataEntity[dataEntityName].data)) {
        if (this.dataEntity[dataEntityName].metadata.dataType === DT_LIST_FILE) {
            const dataSet = this.dataEntity[dataEntityName].data.slice(0);
            result = {
                rowCount:dataSet? dataSet.length : 0,
                data:dataSet
            };
        }else if (this.dataEntity[dataEntityName].data){
            let dataSet = {};
            Object.assign(dataSet, this.dataEntity[dataEntityName].data);
            result = {
                rowCount: Object.entries(dataSet).length ? Object.entries(dataSet).length : 0,
                data:dataSet
            };
        }else {
            result = {
                rowCount: 0,
                data: null
            };
        }

        this.logger.log(this.logger.FINEST, 'retrieve key data result:' + JSON.stringify(result));
        return result;
    }

    /**
     * Builds the array of file contents
     * @param {*} dataEntityName 
     */
    buildValues(dataEntityName){
        if (this.dataEntity[dataEntityName].metadata.dataType === DT_LIST_FILE) {
            this.dataEntity[dataEntityName].values = this.dataEntity[dataEntityName].data;
        } else if (this.dataEntity[dataEntityName].metadata.dataType === DT_KEY_VALUE_DIR){
            const dataSet = [];
            Object.values(this.dataEntity[dataEntityName].data).forEach((val) => {
                if (typeof(val) === 'object'){
                    Object.values(val).forEach((subVal) => {
                        if (typeof(subVal) === 'object'){

                            dataSet.push(subVal['data']);
                        }
                    });
                }
            });
            this.dataEntity[dataEntityName].values = dataSet;
        }else if (this.dataEntity[dataEntityName].metadata.dataType === DT_KEY_VALUE_FILE){
            // TBD
            this.dataEntity[dataEntityName].values = [];
        }
    }
    
    /**
     * Returns the data content as Array. It will abondon the storage format for key-value data
     * @param {*} dataEntityName 
     */
    retrieveValues(dataEntityName){
        this.logger.log(this.logger.FINE, 'Retrieving data for: ' + dataEntityName);

        if (! this.dataEntity[dataEntityName]) {
            this.logger.log(this.logger.FINE, 'The data entity to retrieve does not exist : ' + dataEntityName);
            return MSG_DATA_ENTITY_NOT_EXIST;
        }

        if (!this.dataEntity[dataEntityName].values || this.dataEntity[dataEntityName].values.length === 0){
            this.buildValues(dataEntityName); // this should NOT happen. Otherwise there is performance issue for big data.
        }

        const dataSet = this.dataEntity[dataEntityName].values.slice(0);
        const result = {
            rowCount:dataSet? dataSet.length : 0,
            data:dataSet
        };

        this.logger.log(this.logger.FINEST, 'retrieve values result:' + JSON.stringify(result));
        return result;
    }

    /**
     * Returns the index number of given key, DT_LIST_FILE only
     * @param {*} dataEntityName 
     * @param {*} key 
     */
    findPK(dataEntityName, key){
        const de = this.dataEntity[dataEntityName];
        if (!de) {
            return null;
        }
        const pkName = de.metadata.primaryKey;
        const pkIndex = this.dataEntity[dataEntityName].index[pkName];
        if (!pkIndex){
            return null;
        }
        return pkIndex.indexOf(key);
    }

        /**
     * Returns the index number of given keys, DT_KEY_VALUE_DIR only
     * @param {*} dataEntityName 
     * @param {*} key 
     */
    findCombinedPK(dataEntityName, key, subKey){
        const de = this.dataEntity[dataEntityName];
        if (!de) {
            return null;
        }
        const pkName = de.metadata.primaryKey;
        const pkIndex = this.dataEntity[dataEntityName].index[pkName];
        if (!pkIndex){
            return null;
        }
        return pkIndex.indexOf(this.getCombinedIndex(key, subKey));
    }

    /**
     * Returns the index number of given key, comparison is not case sensitive
     * @param {*} dataEntityName 
     * @param {*} key 
     */
    findPKNoCase(dataEntityName, key){
        const de = this.dataEntity[dataEntityName];
        if (!de) {
            return null;
        }
        const pkName = de.metadata.primaryKey;
        const pkIndex = this.dataEntity[dataEntityName].index[pkName];
        if (!pkIndex){
            return null;
        }
        return pkIndex.findIndex((element) => {
            return element.toLowerCase() === key.toLowerCase();
        })
    }

    /**
     * 
     * @param {*} dataEntityName 
     * @param {*} idx 
     */
    getPKByIndex(dataEntityName, idx){
        const de = this.dataEntity[dataEntityName];
        if (!de) {
            return null;
        }
        const pkName = de.metadata.primaryKey;
        const pkIndex = this.dataEntity[dataEntityName].index[pkName];
        return pkIndex[idx];
    }

    /**
     * 
     * @param {*} dataEntityName  //DataEntities.session.name 
     * @param {*} filter          // 'xxxx'
     */
    searchData(dataEntityName, filter){
        if (!this.dataEntity[dataEntityName]) {
            return MSG_DATA_ENTITY_NOT_EXIST;
        }
        if (filter && typeof(filter) !== 'string'){
            return MSG_DATA_FILTER_NOT_STRING;
        }
        if (!filter){
            return this.dataEntity[dataEntityName].data.slice(0);
        }

        let dataSet = [];
        this.dataEntity[dataEntityName].data.forEach(element => {
            if (this.extractValue(element).toUpperCase().includes(filter.toUpperCase())) {
                dataSet.push(element); 
            }
        });

        let result = {
            dataEntity:dataEntityName,
            filter:filter,
            rowCount:dataSet? dataSet.length : 0,
            data:dataSet
        };

        return result;
    }

    searchDataByPK(dataEntityName, pkVal, subKey){
        if (!this.dataEntity[dataEntityName]) {
            throw Error(MSG_DATA_ENTITY_NOT_EXIST);
        }

        const dataEntity = this.dataEntity[dataEntityName];
        if (dataEntity.metadata.dataType === DT_LIST_FILE){
            const idx = this.findPK(dataEntityName, pkVal);
            if (idx === -1){
                return null;
            }
            return {...dataEntity.data[idx]};
        } else if (dataEntity.metadata.dataType === DT_KEY_VALUE_DIR) {
            if (!subKey){
                return {...dataEntity.data[pkVal]};
            }else{
                const idx = this.findCombinedPK(pkVal, subKey);
                return {...dataEntity.values[idx]};
            }
        } else {
            // TBD
            return null;
        }
    }

    /**
     * 
     * @param {*} dataEntityName  //DataEntities.session.name 
     * @param {*} filter          // 'keyboard':'xxxx'
     */
    searchDataByKeyValue(dataEntityName, filter){
        if (!this.dataEntity[dataEntityName]) {
            return MSG_DATA_ENTITY_NOT_EXIST;
        }
        if (filter && typeof(filter) !== 'string'){
            return MSG_DATA_FILTER_NOT_STRING;
        }
        if (!filter){
            return this.dataEntity[dataEntityName].data.slice(0);
        }

        let dataSet = [];
        this.dataEntity[dataEntityName].data.forEach(element => {
            if (this.extractKeyValue(element).toUpperCase().includes(filter.toUpperCase())) {
                dataSet.push(element); 
            }
        });

        let result = {
            dataEntity:dataEntityName,
            filter:filter,
            rowCount:dataSet? dataSet.length : 0,
            data:dataSet
        };

        return result;
    }
    searchFormatData(dataEntityName, filter, orderBy, reverseOrder, rowsPerPage, pageNum){
        if (!this.dataEntity[dataEntityName]) {
            return MSG_DATA_ENTITY_NOT_EXIST;
        }
        if (filter && typeof(filter) !== 'string'){
            return MSG_DATA_FILTER_NOT_STRING;
        }

        let searchResult = []; 
        if (!filter || filter === ''){
            searchResult = this.dataEntity[dataEntityName].data.slice(0);
        }else{
            this.dataEntity[dataEntityName].data.forEach(element => {
                if (this.extractValue(element).toUpperCase().includes(filter.toUpperCase())) {
                    searchResult.push(element);
                }
            });
        }

        searchResult = this.orderData(searchResult, orderBy, reverseOrder);
        
        let resultLength = searchResult.length;
        let pageNumber = pageNum? pageNum: 1;
        let rowsPerPg = rowsPerPage? rowsPerPage : resultLength;
        let startPos = rowsPerPg * (pageNumber - 1);  //pageNum starts from 1
        let endPos = startPos + rowsPerPg;
        if (!endPos) endPos = 1;
        if (endPos > resultLength ) endPos = resultLength;
        if (startPos > resultLength ) startPos = resultLength-1;
        if (startPos < 0) startPos = 0;

        searchResult = searchResult.slice(startPos, endPos);

        let result = {
            startPos:startPos + (resultLength == 0? 0 : 1),
            endPos:endPos,
            pageNum: pageNumber,
            rowsPerPage: rowsPerPage,
            rowCount:resultLength,
            data: searchResult
        }

        return result;
    }

    extractValue(dataObj){
        if (!dataObj) return null;
        // let obj = JSON.parse(strObj);
        let cpData = {};
        cpData = Object.assign(cpData, dataObj);
        if (cpData.timeStamp) cpData.timeStamp = null;
        return Object.values(cpData).toString();
    }
    extractKeyValue(dataObj){
        if (!dataObj) return null;
        // let obj = JSON.parse(strObj);
        let cpData = {};
        cpData = Object.assign(cpData, dataObj);
        if (cpData.timeStamp) cpData.timeStamp = null;
        return JSON.stringify(cpData);
    }

    orderData(data, orderBy, reverseOrder){
        let result = data;
        if (orderBy && typeof(orderBy) === 'string'){
            if (reverseOrder){
                result = result.sort((a,b) => {
                    // let oa = JSON.parse(a);
                    // let ob = JSON.parse(b);
                    if (a[orderBy] > b[orderBy]) return -1;
                    if (a[orderBy] < b[orderBy]) return 1;
                    return 0;
                });
            }else{
                result = result.sort((a,b) => {
                    // let oa = JSON.parse(a);
                    // let ob = JSON.parse(b);
                    if (a[orderBy] < b[orderBy]) return -1;
                    if (a[orderBy] > b[orderBy]) return 1;
                    return 0;
                });
            }
        }
        return result;
    }

    getFileNameFromMeta(dataEntity, pk){
        if (dataEntity.metadata.fileNamePrefix && dataEntity.metadata.fileNameSurfix){
            let fileName = dataEntity.metadata.fileNamePrefix + pk + dataEntity.metadata.fileNameSurfix;
            const fnConstraints = dataEntity.metadata.constraintFileName;
            if (fnConstraints && Array.isArray(fnConstraints)){
                if (fnConstraints.includes(CONSTRAINT_FILE_NAME_PK_LOWERCASE)){
                    fileName = dataEntity.metadata.fileNamePrefix + pk.toLowerCase() + dataEntity.metadata.fileNameSurfix;
                }
                if (fnConstraints.includes(CONSTRAINT_FILE_NAME_ENCODEURI)){
                    fileName = encodeURIComponent(fileName);
                }
            }
            return fileName;
        }else{
            return null;
        }
    }

    getPathFromData(dataEntity, data){
        const pkVal = data[dataEntity.metadata.primaryKey];
        return this.getPathFromPK(dataEntity, pkVal);
    }
    
    getPathFromPK(dataEntity, pk){
        return path.join(this.basePath, dataEntity.metadata.filePath, this.getFileNameFromMeta(dataEntity, pk));
    }

    async addData(dataEntityName, dataObj){
        const dataEntity = this.dataEntity[dataEntityName];
        // Validations
        if (!dataEntity) {
            return Promise.resolve({status: MSG_DATA_ENTITY_NOT_EXIST});    
        }

        const data = dataObj.data;
        const pkCol = dataEntity.metadata.primaryKey;

        // Constraints
        if (dataEntity.metadata.constraintPK === CONSTRAINT_PK_LOWERCASE){
            data[pkCol] = data[pkCol].toLowerCase();
        }
        if (!dataObj['path'] || dataObj['path'] === undefined){
            dataObj['path'] = this.getPathFromData(dataEntity, data);
        }
        
        // Insert Data
        const index = this.indexOfPK(dataEntity, data);
        if (index > -1) {
            dataEntity.data[index] = data;
            return Promise.resolve(this.addQueue({option: dataObj, type: 'add'}));
        }
        dataEntity.data.push(data);

        // Insert Index
        if (pkCol){
            if (dataEntity.index[pkCol] === undefined) dataEntity.index[pkCol] = [];
            dataEntity.index[pkCol].push(data[pkCol]);
            return Promise.resolve(this.addQueue({option: dataObj, type: 'add'}));
        }
        return Promise.resolve({status: true});
    }

    async syncData(data, option){
        return Promise.resolve(this.addQueue({option, type: 'sync'}));
    }

    isExistingPK(dataEntity, dataObj){
        const pkCol = dataEntity.metadata.primaryKey;
        if (pkCol){
            const pkIndex = dataEntity.index[pkCol];
            const pkVal = dataObj[pkCol];
            if (pkIndex !== undefined && pkVal !== undefined && pkIndex.includes(pkVal)){
                return true;
            }else{
                return false;
            }
        }else{
            return false;
        }
    }

    indexOfPK(dataEntity, dataObj){
        const pkCol = dataEntity.metadata.primaryKey;
        if (pkCol){
            const pkIndex = dataEntity.index[pkCol];
            const pkVal = dataObj[pkCol];
            if (pkIndex !== undefined && pkVal !== undefined ){
                return pkIndex.indexOf(pkVal);
            }else{
                return null;
            }
        }else{
            return null;
        }
    }

    isDuplicatedData(){
        //TBD, exactly same data.
    }

    /**
     * 
     * @param {*} dataEntityName 
     * @param {*} delPk 
     * @param {*} file 
     */
    deleteWithPK(dataEntityName, delPk, file){
        return new Promise((resolve, reject) => {
            const dataEntity = this.dataEntity[dataEntityName];
            const path = file? file: this.getPathFromPK(dataEntity, delPk);
            if (!dataEntity) {
                resolve({status: false, message: MSG_DATA_ENTITY_NOT_EXIST});
            }
            if (!delPk) {
                resolve({status: false, message: MSG_PK_NOT_PROVIDED});
            }
            const pk = dataEntity.metadata.primaryKey;
            
            if (pk){
                if (dataEntity.index[pk] === undefined) dataEntity.index[pk] = [];
    
                const dataInd = dataEntity.index[pk].indexOf(delPk);
                if (dataInd >= 0){
                    dataEntity.data.splice(dataInd,1);
                    dataEntity.index[pk].splice(dataInd,1);
                    resolve(this.addQueue({option: path, type: 'delete'}));
                }else{
                    resolve({status: false, message: MSG_DELETE_DATA_NOT_EXIST});
                }
            }else {
                return resolve({status: false, message: MSG_DATA_ENTITY_HAS_NO_PK});
            }
        });
    }

    /**
     * Add a data for given data entity. The data entity's fileFilter must be the data file name.
     * @param {*} dataEntityName 
     * @param {*} data 
     * @param {*} superFile - This will override the data entity configuration. Not recommanded for use.
     */
    addDataKVD(dataEntityName, data, superFile){
        const dataEntity = this.dataEntity[dataEntityName];
        const pkValue = data[dataEntity.metadata.primaryKey];
        const fileName = dataEntity.metadata.fileFilter;
        return this.addDataKeyValueDir(dataEntityName, pkValue, fileName, data, superFile);
    }
    
    /**
     * Add a data for given data entity. 
     * @param {*} dataEntityName 
     * @param {*} key 
     * @param {*} fileName 
     * @param {*} data 
     * @param {*} superFile - This will override the data entity configuration. Not recommanded for use.
     */
    addDataKeyValueDir(dataEntityName, key, fileName, data, superFile){
        return new Promise((resolve, reject) => {
            const dataEntity = this.dataEntity[dataEntityName];
            if (!dataEntity) {
                return reject({status: false, message: MSG_DATA_ENTITY_NOT_EXIST});    
            }

            if (!dataEntity.metadata || !dataEntity.metadata.dataType || dataEntity.metadata.dataType != DT_KEY_VALUE_DIR) {
                return reject({status: false, message: MSG_DATA_ENTITY_TYPE_ERROR});
            }

            const filePathPK = dataEntity.metadata.filePath;
            const filePathInner = dataEntity.metadata.fileInnerPath;
            const filePath = path.join(this.basePath, filePathPK, key, filePathInner);

            this.logger.log(this.logger.INFO, 'Add data for Data Entity: ' + dataEntityName + ', key: ' + key + ', file: ' + fileName);
            this.logger.log(this.logger.INFO, 'File path: ' + filePath);
            
            const option = {
                path: superFile? superFile: path.join(filePath, fileName),
                data: data
            }
            this.addQueue({option: option, type: 'add'}).then((result) =>{
                if (result && result.status){
                    if (!dataEntity.data[key]){
                        dataEntity.data[key] = {};
                    }
                    const dataObj = {
                        path: filePath,
                        file: fileName,
                        data: data
                    }
                    dataEntity.data[key][fileName] = dataObj;
                    const indStr = this.getCombinedIndex(key, fileName);
                    const idx = dataEntity.index[dataEntity.metadata.primaryKey].indexOf(indStr);
                    if (idx < 0){
                        dataEntity.index[dataEntity.metadata.primaryKey].push(indStr);
                        dataEntity.values.push(data);
                    }else{
                        dataEntity.values[idx] = data;
                    }
                    return resolve(result);
                }else{
                    return reject(result);
                }
            }, (err) => {
                return reject(err);
            })
        });
    }

    getCombinedIndex(key, subkey){
        return key+KEY_CONNECTOR+subkey;
    }

    
    addDataKeyValueFile(dataEntityName, fileName, data){
        return new Promise((resolve, reject) => {
            const dataEntity = this.dataEntity[dataEntityName];
            if (!dataEntity) {
                return reject({status: false, message: MSG_DATA_ENTITY_NOT_EXIST});    
            }

            if (!dataEntity.metadata || !dataEntity.metadata.dataType || dataEntity.metadata.dataType != DT_KEY_VALUE_FILE) {
                return reject({status: false, message: MSG_DATA_ENTITY_TYPE_ERROR});
            }

            const filePath = path.join(this.basePath, dataEntity.metadata.filePath);

            this.logger.log(this.logger.INFO, 'Add data for Data Entity: ' + dataEntityName + ', file: ' + fileName);
            this.logger.log(this.logger.INFO, 'File path: ' + filePath);
            
            const pkName = dataEntity.metadata.primaryKey;
            if (!dataEntity.index[pkName].includes(fileName)){
                dataEntity.index[pkName].push(fileName);
                this.logger.log(this.logger.FINEST, 'dataEntity.index: ' + JSON.stringify(dataEntity.index));
            }

            const option = {
                path: path.join(filePath, fileName),
                data: data
            }
            this.addQueue({option: option, type: 'add'}).then((result) =>{
                if (result && result.status){
                    if (!dataEntity.data[fileName]){
                        dataEntity.data[fileName] = {};
                    }
                    const dataObj = {
                        path: filePath,
                        file: fileName,
                        data: data
                    }
                    dataEntity.data[fileName] = dataObj;
                    dataEntity.values.push(data);
                    this.logger.log(this.logger.FINEST, 'dataEntity.data[fileName]: ' + JSON.stringify(dataEntity.data[fileName]));
                    return resolve(result);
                }else{
                    return reject(result);
                }
            }, (err) => {
                return reject(err);
            })
        });
    }

    /**
     * Delete a data from given data entity. The fileFilter of this data entity must be the file name.
     * @param {*} dataEntityName 
     * @param {*} delPk 
     */
    deleteKVD(dataEntityName, delPk){
        const fileName = this.dataEntity[dataEntityName].metadata.fileFilter;
        return this.deletewithKeyFile(dataEntityName, delPk, fileName);
    }

    /**
     * 
     * @param [*] dataEntities - Array of data entity names with the same key
     * @param {*} key - The key value to be deleted
     */
    delAllDataEntitiesForKey(dataEntities, key){
        return new Promise((resolve, reject) => {
            if (!Array.isArray(dataEntities)) {
                return reject({status: false, message: MSG_PARAM_TYPE_ARRAY});
            }
            let keyPath = null;
            for (let deName of dataEntities){
                const de = this.dataEntity[deName];
                if (!keyPath){
                    keyPath = de.metadata.filePath;
                } else if (keyPath !== de.metadata.filePath) {
                    return reject({status: false, message: MSG_DATA_ENTITY_HAS_NO_JOINT_KEY});
                }
            }
            const promises = [];
            for (let deName of dataEntities){
                const result = this.deleteKVD(deName, key);
                promises.push(result);
            }
            const that = this;
            keyPath = path.join(this.basePath, keyPath, key);
            Promise.all(promises).then(values => {
                if (values && Array.isArray(values)){
                    for (let val of values){
                        if (!val.status){
                            return reject({status: false, message: MSG_ERROR_DELETE_DATA});
                        }
                    }
                    that.addQueue({option: keyPath, type: 'deleteDir'}).then(result => {
                        if (result && result.status){
                            return resolve(result);
                        }else{
                            return reject(result);
                        }
                    }, err => {
                        return reject(err);
                    });
                }
            }, err => {
                return reject(err);
            });
        });
    }
    
    /**
     * This function is used by key-value-dir data only. 
     * @param {*} dataEntityName 
     * @param {*} delPk 
     * @param {*} delFile 
     */
    deletewithKeyFile(dataEntityName, delPk, delFile){
        // this function is only used together with manageKeyValue()
        return new Promise((resolve, reject) => {
            this.logger.log(this.logger.INFO, 'Deleting data: ' + dataEntityName + '.' + delPk + '.' + delFile);
            const dataEntity = this.dataEntity[dataEntityName];
            if (!dataEntity) {
                return reject({status: false, message: MSG_DATA_ENTITY_NOT_EXIST});
            }
            if (!delPk) {
                return reject({status: false, message: MSG_PK_NOT_PROVIDED});
            }
            if (!delFile) {
                return reject({status: false, message: MSG_FILE_NOT_PROVIDED});
            }
            if (dataEntity.index){
                const indStr = this.getCombinedIndex(delPk, delFile);
                const dataInd = dataEntity.index[dataEntity.metadata.primaryKey].indexOf(indStr);
                // this.logger.log(this.logger.FINEST, 'dataEntity.data[delPk][delFile]: ' + JSON.stringify(dataEntity.data[delPk][delFile]));

                if (dataInd >= 0 && dataEntity.data[delPk] && dataEntity.data[delPk][delFile] && dataEntity.data[delPk][delFile]['path']){
                    const filePath = path.join(dataEntity.data[delPk][delFile]['path'], delFile); 
                    this.addQueue({option: filePath, type: 'delete'}).then(result => {
                        if (result && result.status){
                            delete dataEntity.data[delPk][delFile];
                            if (Object.keys(dataEntity.data[delPk]).length === 0){
                                delete dataEntity.data[delPk];
                                dataEntity.index[dataEntity.metadata.primaryKey].splice(dataInd,1);
                                dataEntity.values.splice(dataInd,1);
                            }
                            return resolve(result);
                        }else{
                            return reject(result);
                        }
                    }, err => {
                        return reject(err);
                    })
                }else{
                    return resolve({status: false, message: MSG_DELETE_DATA_NOT_EXIST});
                }
            }else{
                return reject({status: false, message: MSG_DATA_ENTITY_HAS_NO_PK});
            }
        });
    }

    /**
     * TBD, handle values when delete
     * @param {*} dataEntityName 
     * @param {*} delPk 
     */
    deletewithKey(dataEntityName, delPk){
        // this function is only used together with manageKeyValue()
        return new Promise((resolve, reject) => {
            this.logger.log(this.logger.INFO, 'Deleting data: ' + dataEntityName + '.' + delPk);
            const dataEntity = this.dataEntity[dataEntityName];
            if (!dataEntity) {
                return {status: false, message: MSG_DATA_ENTITY_NOT_EXIST};
            }
            if (!delPk) {
                return {status: false, message: MSG_PK_NOT_PROVIDED};
            }

            const pkCol = dataEntity.metadata.primaryKey;
            if (dataEntity.index[pkCol]){
                const dataInd = dataEntity.index[pkCol].indexOf(delPk);
                this.logger.log(this.logger.FINEST, 'dataEntity.data[delPk]: ' + JSON.stringify(dataEntity.data[delPk]));

                if (dataInd >= 0 && dataEntity.data[delPk] && dataEntity.data[delPk]['path']){
                    const filePath = path.join(dataEntity.data[delPk]['path'], delPk); 
                    this.addQueue({option: filePath, type: 'delete'}).then(result => {
                        if (result && result.status){
                            delete dataEntity.data[delPk];
                            dataEntity.index[pkCol].splice(dataInd,1);
                            this.logger.log(this.logger.INFO, 'Delete data complete for: ' + delPk );
                            return resolve(result);
                        }else{
                            return reject(result);
                        }
                    }, err => {
                        return reject(err);
                    })
                }else{
                    return reject({status: false, message: MSG_DELETE_DATA_NOT_EXIST});
                }
            }else{
                return reject({status: false, message: MSG_DATA_ENTITY_HAS_NO_PK});
            }
        });
    }

    deleteSame(dataEntityName, dataObj){
        const dataEntity = this.dataEntity[dataEntityName];
        if (!dataEntity) {
            return MSG_DATA_ENTITY_NOT_EXIST;
        }

        const dataInd = dataEntity.data.findIndex((element) => {
            const eleStr = JSON.stringify(this.sortObject(element));
            const delStr = JSON.stringify(this.sortObject(dataObj));

            return eleStr === delStr;
        });

        if (dataInd >= 0){
            dataEntity.data.splice(dataInd,1);
            const pk = dataEntity.metadata.primaryKey;
            if (pk){
                dataEntity.index[pk].splice(dataInd,1);
            }
            return true;
        }else{
            return MSG_DELETE_DATA_NOT_EXIST;
        }
    }

    sortObject(o) {
        const orders = {};
        
        Object.keys(o).sort().forEach(d => {
            orders[d] = o[d];
        });

        return orders;
    }

    createQueue() {
        this.q = new Queue((options, cb)=> {
            const index = Array.isArray(options) ? Math.max(options.length - 1, 0) : 0;
            const node = Array.isArray(options) ? options[index] : options;
            this.logger.info('Queue length:'+this.q.length);

            if (node.type === 'add') {
                this.logger.info('Start addFile; URL is '+node.option.path);
                this.logger.debug('addFile detail; URL is '+node.option.path+' Data is' +JSON.stringify(node.option.data));
                this.addFile(node.option).then((data) => {
                    cb(null, node);
                    this.logger.info('Success:addFile; URL is '+node.option.path);
                }, (err) => {
                    cb(err,node);
                    this.logger.severe('Error:addFile; URL is '+node.option.path+' Data is' +JSON.stringify(node.option.data));
                });
            }

            if (node.type === 'delete') {
                this.logger.info('Start deleteFile; URL is '+node.option);
                this.deleteFile(node.option).then((data) => {
                    cb(null, node);
                    this.logger.info('Success:deleteFile; URL is '+node.option);
                }, (err) => {
                    cb(err,node);
                    this.logger.severe('Error:deleteFile; URL is '+node.option);
                });
            }

            if (node.type === 'deleteDir') {
                this.logger.info('Start deleteDir; URL is '+node.option);
                this.deleteDir(node.option).then((data) => {
                    cb(null, node);
                    this.logger.info('Success:deleteDir; URL is '+node.option);
                }, (err) => {
                    cb(err,node);
                    this.logger.severe('Error:deleteDir; URL is '+node.option);
                });
            }

            if (node.type === 'sync') {
                this.logger.info('Start syncFile; URL is '+node.option.url+'; Method is ' +node.option.method);
                this.logger.debug('syncFile detail; URL is '+node.option.url+' Data is ' +JSON.stringify(node.option.body));
                this.syncFile(node.option).then((data) => {
                    cb(null, node);
                    this.logger.info('Success:syncFile; URL is '+node.option.url+'; Method is ' +node.option.method);
                }, (err) => {
                    cb(err,node);
                    this.logger.severe('Error: syncFile; URL is '+node.option.url+'; Method is ' +node.option.method+' Body is' +JSON.stringify(node.option.body));
                });
            }
            
        }, { maxRetries: 0, retryDelay: 1000});
    }

    addQueue(option) {
        const that = this;
        return new Promise((resolve,reject) => {
            this.q.push(option, function(err, result){
                if (err){
                    that.logger.warn('add queue event: failed. err stack: ' + err.message);
                    reject({status: false, message: err.message})
                }else{
                    that.logger.log(that.logger.FINEST, 'add queue event: finish');
                    resolve({status: true});
                }
            });
        });
    }

    /**
     * Creates the dir and the parent dirs if not exist.
     * @param {string} dirpath 
     */
    async createDirs(dirpath) {
        if(dirpath.search(/.json|.zmd|.zad|.zvt|.zap|.zmp|.lic|.ini/)>0){ // for bzw2h, support .zmd,.zad,.zvt,.zap,.zmp, .lic files
            dirpath=path.dirname(dirpath); 
        }
        if (!fs.existsSync(path.dirname(dirpath))) {
            this.createDirs(path.dirname(dirpath));
        }
        if (!fs.existsSync(dirpath)) {
            this.logger.log(this.logger.INFO, 'Creating dir: ' + dirpath);
            fs.mkdirSync(dirpath);
        }
     }

    async addFile(option, isIni) {
        const that = this;
        await this.createDirs(option.path);
        return new Promise((resolve, reject) => {
            try {
                that.logger.debug('addFile detail; URL is '+option.path+' Data is' +JSON.stringify(option.data));
                const str= isIni ? option.data : JSON.stringify(option.data); // isIni is bzw2h format file
                if(str.length>0){
                    fs.writeFile(option.path,str, (err) => {
                        if (err){
                            that.logger.log(that.logger.SEVERE, 'addFile() failed: ' + JSON.stringify(option));
                            reject({ status: false, message: err.stack });
                        }else{
                            that.logger.log(that.logger.FINEST, 'addFile() succeed for: ' + JSON.stringify(option));
                            resolve({ status: true, message: 'Create file successed.' });
                        } 
        
                    });
                }else{
                    that.logger.log(that.logger.SEVERE, 'addFile() failed: ' + JSON.stringify(option));
                    reject({ status: false, message: 'addFile() failed.'  });
                }
    
                
            } catch (error) {
                that.logger.warn('add file failed. error stack: ' + error.stack);
                reject({ status: false, message: 'addFile() failed.' });
            }
        });
    }

    async deleteDir(path){
        const that = this;
        that.logger.log(that.logger.INFO, 'Deleting dir: '+path);
        if (fs.existsSync(path)) {
			try {
				fse.remove(path, (err) => {
					if (err){
                        that.logger.log(that.logger.SEVERE, 'deleteDir() failed '+path);
                        that.logger.log(that.logger.SEVERE, 'deleteDir error: ' + err.stack);
                        return Promise.reject({ status: false, message: 'deleteDir() failed.' });
                    }else{
                        that.logger.log(that.logger.INFO, 'deleteDir() successed '+ path);
                        return Promise.resolve({ status: true, message: 'deleteDir() successed.' });
                    } 
                    
				});
			} catch (error) {
                that.logger.log(that.logger.SEVERE, 'deleteDir() failed '+path);
                that.logger.log(that.logger.SEVERE, 'deleteDir error: ' + err.stack);
                return Promise.reject({ status: false, message: 'deleteDir() failed.' });
			}
		} else {
            that.logger.warn('deleteDir(): dir not eixists, path is '+path);
			return Promise.reject({ status: false, message: 'dir not eixists.' });
		}
    }

    async deleteFile(path) {
        const that = this;
        that.logger.log(that.logger.INFO, 'Deleting file: '+path);
        if (fs.existsSync(path)) {
			try {
				fs.unlink(path, (err) => {
					if (err){
                        that.logger.log(that.logger.SEVERE, 'deleteFile() failed '+path);
                        that.logger.log(that.logger.SEVERE, 'deleteFile error: ' + err.stack);
                        return Promise.reject({ status: false, message: 'deleteFile() failed.' });
                    }else{
                        that.logger.log(that.logger.INFO, 'deleteFile() successed '+ path);
                        return Promise.resolve({ status: true, message: 'deleteFile() successed.' });
                    } 
                    
				});
			} catch (error) {
                that.logger.log(that.logger.SEVERE, 'deleteFile() failed '+path);
                that.logger.log(that.logger.SEVERE, 'deleteFile error: ' + err.stack);
                return Promise.reject({ status: false, message: 'deleteFile() failed.' });
                
			}
		} else {
            that.logger.warn('deleteFile(): file not eixists, path is '+path);
			return Promise.reject({ status: false, message: 'file not eixists.' });
		}
    }

    async syncFile(option) {
        const that = this;
        return new Promise (function (resolve, reject) {
            const isHttps=option.url.toLowerCase().indexOf("https")===0?true:false;
            let requestOption={
                url: option.url,
                method: option.method,
                headers: option.headers,
                body: JSON.stringify(option.body),
            }
            if (option.form) {
                requestOption.form = option.form;
            }
            if(isHttps){
                Object.assign(requestOption,{"agentOptions":{"rejectUnauthorized":false}});  //todo, use this to https error CERT_HAS_EXPIRED   
            }
            request(requestOption,function(error, response, body) {
                if (response && response.statusCode !== 201) {
                    that.logger.info('syncFile(); response.statusCode '+response.statusCode+'; url is ' +option.url);
                    resolve({ status: false, message: response.body, response});
                }else if (response && response.statusCode === 201 ){
                    that.logger.info('syncFile(); response.statusCode '+response.statusCode+'; url is ' +option.url);
                    resolve({ status: true, message: 'sync successed.', response });
                }else if (error) { 
                    that.logger.severe('Error: syncFile(); URL is '+option.url+', error is '+error.stack);
                    reject({ status: false, message: error.message });
                }
            });
        });
     }

    getPath(type, name) {
        if (type === 'user') return `/users/userInfo_${name}.json`;

        if (type === 'session') return `/sessions/session_${name}.json`;

        return `/groups/group_${name}.json`;
    }
}

module.exports = {

    /**
     * 
     * @param {*} context 
     * @param {*} isIsolate : isolate means, the DS is a new instance, and it's not assigned to the context
     */
    initWithContext(context, isIsolate){
        let logger;
        if (!context.logger.__proto__.log){
            let parentLogger = new LoggerFile.Logger();
            parentLogger.addDestination(parentLogger.makeDefaultDestination(true,true,true));
            logger = parentLogger.makeComponentLogger(context.logger.componentName + '.internal-data-steward');
        }else{
            logger = context.logger;
        }

        if (isIsolate){
            logger.info('creating isolate data steward');
            const storagePath = path.join(path.resolve(context.plugin.server.config.user.instanceDir),
                './ZLUX/pluginStorage/',
                './' + context.plugin.pluginDef.identifier);
            const dataSteward = new InternalDataSteward(storagePath, logger);
            return dataSteward;
        }
        
        if (!context.plugin.dataSteward){
            logger.info('Initiating internal data steward for plugin: ' + context.plugin.pluginDef.identifier);
            const storagePath = path.join(path.resolve(context.plugin.server.config.user.instanceDir),
                './ZLUX/pluginStorage/',
                './' + context.plugin.pluginDef.identifier);
            context.plugin.dataSteward = new InternalDataSteward(storagePath, logger);
        } else {
            logger.log(logger.componentName, logger.FINE, 'Internal data steward already exist for plugin: ' + context.plugin.pluginDef.identifier + '. Skipping initiation.');
        }
        return context.plugin.dataSteward;
    }
};