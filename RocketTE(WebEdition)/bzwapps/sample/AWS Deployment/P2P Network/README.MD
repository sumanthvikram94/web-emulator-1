# Sample code to deploy Rocket TE Web into AWS
Please refer to Administration Guide for details.
## Prerequsites
- The image of Rocket TE Web exists in ECR
- 2 persistentVolumeClaim with names "pvc-efs-persistent-1" and "pvc-efs-persistent-2" already created based on AWS EFS
- AWS Application Load Balancer and Istio ingress already configured to expose services in EKS to end users
## Deployment Steps
- Edit the config/statefuleset.yaml, and change the link for the docker image
- Run the bin/deploy.sh
