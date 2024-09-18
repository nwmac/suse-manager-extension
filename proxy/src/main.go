package main

import (
	"crypto/tls"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
)

var (
	CertFilePath = "../certs/server-cert.pem"
	KeyFilePath  = "../certs/server-key.pem"
)

const NAMESPACE = "suse-manager"
const API_HEADER = "X-Api-Suse-Manager-Target"

type LoginStatus struct {
	Success bool `json:"success"`
}

func handleProxyRequest(k8sApi, token string) func(w http.ResponseWriter, req *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		// Get the header with the target system
		resourceName := req.Header.Get(API_HEADER)

		log.Printf("%-8s %s (%s)", req.Method, req.URL, resourceName)

		if len(resourceName) > 0 {
			// Got the name of a resource to look up
			suma, err := getSuseManagerResource(k8sApi, token, resourceName)

			if err != nil {
				log.Println("Error getting SUSE Manager Resource", err)
			}

			if err == nil && suma != nil {
				// Get the associated secret
				if len(suma.Spec.PasswordSecret) > 0 {
					log.Println(suma.Spec.PasswordSecret)
					password, err := getPasswordFromSecret(k8sApi, token, suma.Spec.PasswordSecret)

					if err != nil {
						log.Println("Error getting Password from secret: ", err)
					}

					if err == nil {
						cacheKey, err := sumaLogin(suma.Spec.URL, suma.Spec.Username, password)

						if err != nil {
							log.Println("Error logging into SUSE Manager: ", err)
						}

						if err == nil {
							err = sumaProxy(suma.Spec.URL, req, w, cacheKey)

							// If no error, then sumaProxy will have sent a response
							if err == nil {
								return
							}
						}
					}
				}
			}
		}

		// Error
		sendGenericError(w)
	}
}

func main() {
	log.Println("Rancher SUSE Manager UI Extension Proxy")

	// Init auth data cache
	authCache = make(map[string]AuthData)

	maxAgeRegexp, _ = regexp.Compile("Max-Age=([0-9]+)")

	dat, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")

	if err != nil {
		log.Fatal("Could not read service account token")
	}

	token := string(dat)
	k8sTcpAddr := os.Getenv("KUBERNETES_PORT_443_TCP")
	k8sApi := strings.Replace(k8sTcpAddr, "tcp://", "https://", 1)

	// load tls certificates
	serverTLSCert, err := tls.LoadX509KeyPair(CertFilePath, KeyFilePath)
	if err != nil {
		log.Fatalf("Error loading certificate and key file: %v", err)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{serverTLSCert},
	}

	server := http.Server{
		Addr:      ":5443",
		Handler:   http.HandlerFunc(handleProxyRequest(k8sApi, token)),
		TLSConfig: tlsConfig,
	}

	defer server.Close()

	log.Println("Starting HTTPS server ...")

	server.ListenAndServeTLS("", "")
}
