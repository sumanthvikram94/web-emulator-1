
const DEFAULT_AGE = 60000;

class InMemCache {

    constructor(){
        this.cacheMap = new Map();
    }

    add(category, subject, content, age){
        const self = this;
        let cateObj = this.cacheMap.get(category);
        if (!cateObj){
            cateObj = new Map();
            this.cacheMap.set(category, cateObj);
        }

        if (!cateObj.has(subject)){
            cateObj.set(subject, content);
            setTimeout(() => {
                self.destroySubject(category, subject);
            }, age? age: DEFAULT_AGE);
        }

    }

    readSubject(category, subject) {
        const cateObj = this.cacheMap.get(category);
        if (cateObj){
            // console.log('result '+cateObj.get(subject));
            return cateObj.get(subject);
        } else {
            return false;
        }
    }

    destroySubject(category, subject){
        // console.log('destroying '+category+'.'+subject);
        let cateObj = this.cacheMap.get(category);
        if (cateObj) {
            cateObj.delete(subject);
        }
    }

}

const cache = new InMemCache();

module.exports = cache;