/**
 * Worker thread pool for ssh
 */

const { EventEmitter } = require('events');
const path = require('path');
const { Worker } = require('worker_threads');
const os = require('os');

const TASK_DISTRIBUTION_METHOD = 'ROUND-ROBIN'; // 'ROUND-ROBIN', 'QUEUE-DEPTH'

const logger = global.COM_RS_COMMON_LOGGER.makeComponentLogger('com.rs.terminalproxy.sshworkerpool');
const loglevel = global.COM_RS_COMMON_LOGGER.getComponentLevel('com.rs.terminalproxy.sshworkerpool');

const ssh = require('../lib/ssh');


/**
 * Tracks the event loop utilization
 */
let eluInterval;
try {
    // Control with ENV VAR for now. Consider add option to admin console.
    // let eluInterval = 60000;
    eluInterval = process.env.EVENT_LOOP_UTL_INTERVAL === undefined ? undefined : Number(process.env.EVENT_LOOP_UTL_INTERVAL);
    if (eluInterval > 0) {
        const { performance } = require('perf_hooks');
        let elu = performance.eventLoopUtilization();
        setInterval(() => {
            const elu1 = performance.eventLoopUtilization(elu);
            if (elu1.utilization < 0.1) {
                // don't output
            } else if (elu1.utilization < 0.7) {
                logger.info(`Event loop utilization - main thread: ` + (elu1.utilization * 100).toFixed(2) + '%');
            } else {
                logger.warn(`High event loop utilization - main thread: ` + (elu1.utilization * 100).toFixed(2) + '%');
            }
            elu = elu1;
        }, eluInterval);
    }
} catch (e) {
    logger.warn('Failed to start event loop utilization tracking')
    console.error(e);
}


/**
 * The pool of worker threads.
 */
class SSHPool extends EventEmitter {

    /**
     * @param {*} numThreads - number of worker threads to start
     */
    constructor(numThreads) {
        super();
        this.numThreads = numThreads;
        this.workers = [];
        this.rbWorker = 0; // worker number recorder for round robin
    }

    /**
     * Starts 1 worker thread only.
     */
    startOne() {
        if (this.workers.length < this.numThreads) {
            this.addNewWorker();
        }
    }

    /**
     * Creates all workers into pool
     */
    fill() {
        process.nextTick(() => {
            for (let i = this.workers.length; i < this.numThreads; i++) {
                this.addNewWorker();
            }
            // Worker filling is one-time action. 
            // Replace it to empty function to improve performance.
            this.fill = () => {};
        })
    }

    /**
     * Add one new worker. Assign the worker with the given workerId. If workerId not provided, it will calculate one.
     * @param {*} workerId 
     */
    addNewWorker(workerId) {
        const wid = workerId === undefined ? this.workers.length : workerId; // In case a worker is crash, and it's replacing the crashed worker, workId will be provided.
        logger.info('Add worker: ' + wid);
        const worker = new Worker(path.join(__dirname, '/worker-ssh.js'), { workerData: { workerId: wid, perfTraceInterval: eluInterval, loglevel } });
        worker['id'] = wid;
        worker.on('message', (response) => {
            const { workerStatus, output, connId } = response;
            if ( workerStatus !== undefined) { // It's the response for healthCheck
                const workId = workerStatus.workerId;
                if ( workId !== undefined ) {
                    if ( workerStatus.isBusy === true ) {
                        this.workers[workId].isBusy = true;
                    } else {
                        this.workers[workId].isBusy = false;
                    }
                }
                return;
            }
            // TBD, might be error happened inside the worker. There should be a callback clearing mechenism like setTimeout. But consider the performance impact.
            if (connId === undefined) {
                return;
            }
            const callbackArray = worker['callbacks'].get(connId); // Find the callback for given connId
            // Here we are using array to maintain callbacks, so the callbacks are invoked in order.
            // TBD, consider using map to maintain the callbacks? Not sure it's better or not.
            if (callbackArray && callbackArray.length > 0) {
                const callback = callbackArray.shift();
                callback(null, output, worker['id']);
                if (callbackArray.length === 0) { // Clears the executed callback.
                    worker['callbacks'].delete(connId);
                }
            } else {
                logger.warn('SSH worker pool - no callback found for connId: ' + connId) // This should not happen in normal case.
            }
        });
        worker.on('error', (err) => {
            console.error(err);
            // worker.callback(err, null, worker['id']);
            if (worker['healthCheck']) {
                clearInterval(worker['healthCheck']); // Cancels the worker health check
            }
            const workerId = worker['id'];
            this.addNewWorker(workerId);
        });
        worker['callbacks'] = new Map(); // Store the callback for each connection
        if (workerId !== undefined) {
            const oldWorker = this.workers[workerId];
            if (oldWorker['healthCheck']) {
                clearInterval(oldWorker['healthCheck']); // Cancels the worker health check
            }
            this.workers.splice(workerId, 0, worker); // It's replacing the working, instead of adding one.
        } else {
            this.workers.push(worker);
        }
        if (!worker['healthCheck']) {
            worker.isBusy = false;
            worker['healthCheck'] = setInterval( () => { // Starts worker health check
                worker.postMessage('healthCheck');
            }, 10000) 
        }
    }

    /**
     * Pick a worker for a new SSH connection
     * @returns A worker
     */
    pickWorker() {
        this.fill(); // Create all the workers

        for (let i = 0; i < this.workers.length; i ++) { // Finds a worker
            const worker = this.workers[this.rbWorker];
            if (!worker.isBusy) { // Free worker found
                this.rbWorker++;
                if (this.rbWorker >= this.workers.length) {
                    this.rbWorker = 0;
                }
                return worker['id'];
            } else {
                continue; // The worker is busy, move to next one
            }
        }

        // All workers are busy...
        return -1;
    }

    /**
     * Run the given task on given worker. Pick a worker in case worker Id not provided.
     * @param {*} task Task passed to worker
     * @param {*} callback callback function after the task is done
     * @param {*} workerId ID of the worker to take the work.
     * @param {*} connId SSH connection ID
     * @param {*} tryTimes nunber of retry times
     */
    runTask(task, callback, workerId, connId, tryTimes = 0) {
        if (task.type === 'ssh_close' && workerId === undefined) {
            callback(undefined, {sshMessages: []});
            return;
        }
        if (workerId !== undefined) { // Run task with the given worker.
            this.runTaskInWorker(task, callback, workerId, connId);
        } else {
            const freeWorkerId = this.pickWorker(); // Pick a worker for a new connection
            if (freeWorkerId === -1) {
                if (tryTimes > 5) { // tried 3 times and all failed. Reject the task
                    callback(undefined, {sshMessages: [{type: ssh.MESSAGE.ERROR, msg: 'SSH worker is busy'}]});
                } else {
                    // All workers busy, retry later
                    setTimeout(() => {
                        this.runTask(task, callback, workerId, connId, ++ tryTimes);
                    }, 2000);
                }
            } else {
                this.runTaskInWorker(task, callback, freeWorkerId, connId);
            }
        }
    }

    /**
     * Run task in given worker.
     * @param {*} task 
     * @param {*} callback 
     * @param {*} workerId 
     * @param {*} connId 
     */
    runTaskInWorker(task, callback, workerId, connId) {
        const worker = this.workers[workerId];
        /**
         * For one connection, multiple messages could be processed in parallel, so there could be multiple callbacks at the same time.
         */
        let callbackArray = worker['callbacks'].get(connId);
        if (!callbackArray) {
            callbackArray = [];
            worker['callbacks'].set(connId, callbackArray);
        }
        callbackArray.push(callback);
        worker.postMessage(task);
    }

    /**
     * Runs task as promise
     * @param {*} task 
     * @returns 
     */
    async runTaskAsync(task, theWorkerId, connId) {
        return new Promise((resolve, reject) => {
            this.runTask(task, (err, result, workerId) => {  // Runs the task in worker and set the callback when message back from worker.
                if (err) {
                    reject(err)
                } else {
                    resolve({
                        workerId,
                        result
                    })
                }
            }, theWorkerId, connId)
        })
    }

    /**
     * Terminate all the works. Not in use for now.
     */
    close() {
        for (const worker of this.workers) worker.terminate();
    }
}

// Pool size is calculated with cpu count, but with limitation as 1 - 8.
const MAX_POOL_SIZE = 8
const MIN_POOL_SIZE = 2
const poolSize = Math.max(Math.min(os.cpus().length - 2, MAX_POOL_SIZE), MIN_POOL_SIZE);

// Instantiates the pool service
const sshPool = new SSHPool(poolSize);
// const workerPool = new WorkerPool(1);

module.exports = {
    sshPool
}