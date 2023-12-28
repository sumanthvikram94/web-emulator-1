#! /bin/sh
# 

# © 2014-2023 Rocket Software, Inc. or its affiliates. All Rights Reserved.
# ROCKET SOFTWARE, INC. CONFIDENTIAL

# If no corresponding value exists, null is displayed
# message: the summarized message of date conflict
# detail : the detail of date conflict
# type: the type of data conflict. The options are PEER BLOCKCHAIN BLOCKINVALID LASTHASH STATISTICS
# remotePeerId: remote peer id
# localPeerId: local peer id
# localIP: local ip
# serverName: server name
# dataEntity: The table where the data conflict occurred 
# localLastBlockTime: last timestamp of chain statistics from local
# peerLastBlockTime: last timestamp of chain statistics from peer
# localLastBlockDateTime: last datatime of chain statistics from local
# peerLastBlockDateTime: last datatime of chain statistics from peer

export CURRENT_PATH=`pwd`
export DATA_CONFLICT_LOG_PATH=${CURRENT_PATH}/../../../../log
echo "message: $1\ndetail: $2\ntype: $3\nremotePeerId: $4\nlocalPeerId: $5\nlocalIP: $6\nserverName: $7\ndataEntity: $8\nlocalLastBlockTime: $9\npeerLastBlockTime: ${10}\nlocalLastBlockDateTime: ${11}\npeerLastBlockDateTime: ${12}\nCurrentTime: $(date)">> ${DATA_CONFLICT_LOG_PATH}/dataConflictHook.out
