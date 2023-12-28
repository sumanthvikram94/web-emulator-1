export class Utiles {
    getData(dir, subName);
    readFilePromise(path, opts);
    getDataObj(dir, subName);
    getDataObjSimple(dir, fileName);
    getFiles(dir);
    getURL(req, context);
    init(logger: any):Utiles;
}

export function init(logger: any): Utiles;

export const util: Utiles;