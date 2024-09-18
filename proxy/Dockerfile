# Build the application using the Go 1.22 development Container Image
FROM registry.suse.com/bci/golang:1.22 AS build

WORKDIR /app

# pre-copy/cache go.mod for pre-downloading dependencies and only
# redownloading them in subsequent builds if they change
# COPY go.mod go.sum ./
# RUN go mod download && go mod verify

COPY . ./

RUN cd src; go build -o /suse-manager-rancher-proxy

# Bundle the application into a scratch image
FROM registry.suse.com/bci/bci-micro:15.4

COPY --from=build /suse-manager-rancher-proxy /usr/local/bin/suse-manager-rancher-proxy

CMD ["/usr/local/bin/suse-manager-rancher-proxy"]