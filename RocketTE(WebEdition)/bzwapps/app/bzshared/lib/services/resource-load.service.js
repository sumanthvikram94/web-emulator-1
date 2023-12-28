

class ResourceLoadService {

    constructor(){
        this.resources = [];
        const that = this;
        this.awaitChecking = new Promise((resolve, reject) => {
            that.checkStarts = resolve;
        });
    }

    registerResourceLoad(resource){
        this.resources.push(resource);
    }

    startChecking(){
        return this.checkStarts(true);
    }

    loadReady(){
        return new Promise((resolve, reject) => {
            this.awaitChecking.then((value) => {
                Promise.all(this.resources).then((results)=>{
                    // console.log('Successfully loaded data resources for: ');
                    // results.forEach((element)=>{
                    //     if (Array.isArray(element)){
                    //         element.forEach((ele)=>{
                    //             console.log(ele['name']);
                    //         })
                    //     }else{
                    //         console.log(element['name']);
                    //     }
                    // })
                    resolve(true);
                }).catch(e => {
                    throw e;
                });
            });
        });
    }
}

const resourceLoadService = new ResourceLoadService();

module.exports = resourceLoadService;