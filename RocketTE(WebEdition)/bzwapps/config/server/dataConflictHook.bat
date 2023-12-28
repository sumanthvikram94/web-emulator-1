@echo off
REM © 2014-2023 Rocket Software, Inc. or its affiliates. All Rights Reserved.
REM ROCKET SOFTWARE, INC. CONFIDENTIAL

REM If no corresponding value exists, null is displayed
REM message: the summarized message of date conflict
REM detail : the detail of date conflict
REM type: the type of data conflict. The options are PEER BLOCKCHAIN BLOCKINVALID LASTHASH STATISTICS
REM remotePeerId: remote peer id
REM localPeerId: local peer id
REM localIP: local ip
REM serverName: server name
REM dataEntity: The table where the data conflict occurred 
REM localLastBlockTime: last timestamp of chain statistics from local
REM peerLastBlockTime: last timestamp of chain statistics from peer
REM localLastBlockDateTime: last datatime of chain statistics from local
REM peerLastBlockDateTime: last datatime of chain statistics from peer

set logPath=%~dp0../../../../log
set message=%1
set detail=%2
set type=%3
set remotePeerId=%4
set localPeerId=%5
set localIP=%6
set serverName=%7
set dataEntity=%8
set localLastBlockTime=%9
shift /0
set peerLastBlockTime=%9
shift /0
set localLastBlockDateTime=%9
shift /0
set peerLastBlockDateTime=%9
set d=%date:~0,10%
set t=%time:~0,8%

(
echo message: %message% 
echo detail: %detail%
echo type: %type%
echo remotePeerId: %remotePeerId%
echo localPeerId: %localPeerId%
echo localIP: %localIP%
echo serverName: %serverName%
echo dataEntity: %dataEntity%
echo localLastBlockTime: %localLastBlockTime%
echo peerLastBlockTime: %peerLastBlockTime%
echo localLastBlockDateTime: %localLastBlockDateTime%
echo peerLastBlockDateTime: %peerLastBlockDateTime%
echo currentTime: %d% %t%
) >> %logPath%/dataConflictHook.out
