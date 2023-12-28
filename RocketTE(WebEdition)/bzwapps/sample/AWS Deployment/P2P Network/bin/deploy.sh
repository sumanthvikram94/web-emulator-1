#!/bin/bash
#

kubectl apply -f ../config/ingress.yaml
kubectl apply -f ../config/istio-auth.yaml
kubectl apply -f ../config/statefulset.yaml
kubectl apply -f ../config/service-entry.yaml
kubectl apply -f ../config/gateway-admin-console.yaml
kubectl apply -f ../config/gateway-client.yaml

echo ">> Starting pods and launching Rocket TE Web application ..."

kubectl wait --for=condition=Ready --timeout=120s pod/ss-rtew-blue-0 -n rtew
kubectl wait --for=condition=Ready --timeout=120s pod/ss-rtew-green-0 -n rtew

echo ---------------------------------------
HOSTNAME_ADMIN=`kubectl get service/svc-rtew-ingressgateway -ojsonpath='{.status.loadBalancer.ingress[0].hostname}' -n rtew`
echo 'Deployment complete!!!'
echo Try access the administration console of pod "ss-rtew-blue-0" with URL: 
echo http://${HOSTNAME_ADMIN}:8543/bzadmin
