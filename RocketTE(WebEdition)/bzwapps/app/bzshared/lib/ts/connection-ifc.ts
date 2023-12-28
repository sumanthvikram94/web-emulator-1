interface FileEntity {
    fileName: string;
    backupFilePaths?: [];
}

interface ConnItem {
    uid: string,
    ip: string,
    grps: string[]
}

interface PoolConnInfo {
    uuid: string,
    cid: number,
    uid: string,
    sn?: string
}

interface PoolBasicItem extends PoolConnInfo {
    ip: string
}

interface PoolGroupItem extends PoolConnInfo {
    grps: string[]
}

interface PoolItem extends PoolBasicItem, PoolGroupItem {
    sn?: string
}

interface SampleData {
    sut: string,
    uc: number,   // user count
    sc: number,   // session count
    t: number,    // time
    sn?: string,
    uids?: string[],
    date: string  
}

interface TempInfo {
    cid: number,
    uid: string,
    ip: string,
    st: number,
    et: number | null,
    date: string,
    sn?: string
}

interface TempItem extends TempInfo {
    uuid: string
}

interface HistoryItem extends TempInfo {
    suuid: string
}

interface PeakUc {
    count: number,
    t: number
}

interface StatData {
    id: string,
    since: number,
    peakUc: PeakUc | null
}

interface PeakDay {
    sip: string,
    date: string,
    data: any
}

export { ConnItem, FileEntity, SampleData, PoolBasicItem, PoolGroupItem, PoolItem, TempItem, HistoryItem, StatData, PeakDay}