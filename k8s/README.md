# Deploying kryspin-redirect to k8s

Build the image and import it into the cluster's container runtime, then apply manifests in this order.

```sh
# 1. build image (from repo root)
buildah bud -t kryspin-redirect:1 -f Dockerfile .
podman save localhost/kryspin-redirect:1 -o /tmp/kryspin-redirect.tar
sudo k3s ctr images import /tmp/kryspin-redirect.tar

# 2. namespace
kubectl apply -f k8s/namespace.yaml

# 3. secrets (not stored in this repo — create them directly)
kubectl create secret generic postgres-secret -n kryspin-redirect \
  --from-literal=POSTGRES_USER=kryspin \
  --from-literal=POSTGRES_PASSWORD='<password>' \
  --from-literal=POSTGRES_DB=kryspin_redirect

kubectl create secret generic kryspin-redirect-secret -n kryspin-redirect \
  --from-literal=CONNECTION_STRING='postgresql://kryspin:<password>@postgres:5432/kryspin_redirect'

kubectl create secret generic cloudflared-secret -n kryspin-redirect \
  --from-literal=token='<cloudflare-tunnel-token>'

# 4. everything else
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/app.yaml
kubectl apply -f k8s/cloudflared.yaml
```

The Postgres `redirects` table is created automatically on first boot via the
`postgres-initdb` ConfigMap.

The Cloudflare tunnel token is a "remotely managed" tunnel — its public
hostname routing (e.g. which hostname maps to
`http://kryspin-redirect.kryspin-redirect.svc.cluster.local:80`) is
configured in the Cloudflare Zero Trust dashboard, not in this repo.

To rebuild after a code change, bump the image tag in `k8s/app.yaml` (or set
`imagePullPolicy: Always` and re-import under the same tag), rebuild/import,
then `kubectl rollout restart deployment/kryspin-redirect -n kryspin-redirect`.
