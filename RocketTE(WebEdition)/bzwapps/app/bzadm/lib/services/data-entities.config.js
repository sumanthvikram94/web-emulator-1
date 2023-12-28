const FILE_EXT_JSON = '.json'
const CONSTRAINT_PK_LOWERCASE = 'CST_PK_LC';
const CONSTRAINT_FILE_NAME_ENCODEURI = 'CST_FILE_ENCURI';
const CONSTRAINT_FILE_NAME_PK_LOWERCASE = 'CST_FILE_NAME_PK_LC';

const CLUSTER_PATH = '/configurations';
const CLUSTER_FILTER = 'cluster_';
const CLUSTER_NAME = 'cluster';
const CLUSTER_PK = "name";

const KEYBOARD_PATH = '/sessionSettings/keyboardmapping';
const KEYBOARD_FILTER = 'K_BZA';
const KEYBOARD_NAME = 'keyboard';
const KEYBOARD_PK = "id";

const HOTSPOTS_PATH = '/sessionSettings/hotspots';
const HOTSPOTS_FILTER = 'H_BZA';
const HOTSPOTS_NAME = 'hotspots';
const HOTSPOTS_PK = "id";

const LAUNCHPAD_PATH = '/sessionSettings/launchpad';
const LAUNCHPAD_FILTER = 'L_BZA';
const LAUNCHPAD_NAME = 'launchpad';
const LAUNCHPAD_PK = "id";

const PREFERENCE_PATH = '/sessionSettings/preference';
const PREFERENCE_FILTER = 'P_BZA';
const PREFERENCE_NAME = 'preference';
const PREFERENCE_PK = "id";

const DT_LIST_FILE = 'LIST_FILE'; 
const DT_KEY_VALUE_FILE = 'KEY_VALUE_FILE'; //Data type is key value pair, key is file name under a dir
const DT_KEY_VALUE_DIR = 'KEY_VALUE_DIR'; //Data type is key value pair, key is dir name under a dir
const SUB_KEY_FORMAT_FF = 'FILE_FILTER'; // Sub-key equal to fileFilter
const SUB_KEY_FORMAT_FF_PK_EXT = 'FILE_FILTER_PK_EXT'; // Sub-key equal to filetFilter+PK+fileExtention


module.exports = {
	cluster: {
		name: CLUSTER_NAME,
		filePath: CLUSTER_PATH,
		fileFilter: CLUSTER_FILTER,
		primaryKey: CLUSTER_PK
	},
	keyboard: {
		name: KEYBOARD_NAME,
		filePath: KEYBOARD_PATH,
		fileFilter: KEYBOARD_FILTER,
		primaryKey: KEYBOARD_PK
	},
	hotspots: {
		name: HOTSPOTS_NAME,
		filePath: HOTSPOTS_PATH,
		fileFilter: HOTSPOTS_FILTER,
		primaryKey: HOTSPOTS_PK
	},
	launchpad: {
		name: LAUNCHPAD_NAME,
		filePath: LAUNCHPAD_PATH,
		fileFilter: LAUNCHPAD_FILTER,
		primaryKey: LAUNCHPAD_PK
	},
	preference: {
		name: PREFERENCE_NAME,
		filePath: PREFERENCE_PATH,
		fileFilter: PREFERENCE_FILTER,
		primaryKey: PREFERENCE_PK
	}
};