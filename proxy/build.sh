NAME=suse-manager-rancher-proxy
BUILD_ARGS="--rm=true"

docker build ${BUILD_ARGS} -f Dockerfile . -t $NAME
