NAME=suse-manager-rancher-proxy
BUILD_ARGS="--rm=true"
ORG=$1

if [ -n "$org" ]; then
  echo "Need docker org"
  exit 1
fi

echo $ORG

docker build ${BUILD_ARGS} -f Dockerfile . -t $NAME
docker tag $NAME:latest $ORG/$NAME:latest

