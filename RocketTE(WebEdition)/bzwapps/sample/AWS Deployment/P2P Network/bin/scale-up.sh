#!/bin/sh
#

kubectl scale statefulset ss-rtew-blue -n rtew --replicas=$(($(kubectl get statefulset ss-rtew-blue -n rtew -o=jsonpath='{.spec.replicas}') + 1))
