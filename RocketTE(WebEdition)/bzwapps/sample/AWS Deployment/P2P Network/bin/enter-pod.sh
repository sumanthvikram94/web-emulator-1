#!/bin/bash
#

POD_NAME=$1
if [ -z "$POD_NAME" ]
then
  POD_NAME=pod/ss-rtew-blue-0
fi

kubectl exec -it ${POD_NAME} -n rtew -- /bin/bash
