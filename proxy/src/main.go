package main

import (
	"crypto/tls"
	"flag"
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

var debugMode bool

func debugLog(format string, args ...interface{}) {
	if debugMode {
		log.Printf("[DEBUG] "+format, args...)
	}
}

type LoginStatus struct {
	Success bool `json:"success"`
}

func handleProxyRequest(k8sApi, token string) func(w http.ResponseWriter, req *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		// Get the header with the target system
		resourceName := req.Header.Get(API_HEADER)

		log.Printf("%-8s %s (%s)", req.Method, req.URL, resourceName)

		if debugMode {
			debugLog("---- Incoming request ----")
			debugLog("Method:        %s", req.Method)
			debugLog("URL:           %s", req.URL.String())
			debugLog("Path:          %s", req.URL.Path)
			debugLog("RawQuery:      %s", req.URL.RawQuery)
			debugLog("RemoteAddr:    %s", req.RemoteAddr)
			debugLog("Host:          %s", req.Host)
			debugLog("Target header (%s): %s", API_HEADER, resourceName)
			debugLog("Incoming headers:")
			for k, v := range req.Header {
				debugLog("  %s: %s", k, strings.Join(v, ", "))
			}
		}

		if len(resourceName) == 0 {
			log.Println("No target resource specified in request header", API_HEADER)
			sendGenericError(w)
			return
		}

		// Got the name of a resource to look up
		debugLog("Looking up SUSE Manager resource %q in namespace %q", resourceName, NAMESPACE)
		suma, err := getSuseManagerResource(k8sApi, token, resourceName)

		if err != nil {
			log.Println("Error getting SUSE Manager Resource", err)
			sendGenericError(w)
			return
		}

		if suma == nil {
			log.Println("SUSE Manager Resource not found:", resourceName)
			sendGenericError(w)
			return
		}

		debugLog("Resolved SUSE Manager resource: name=%s url=%s username=%s passwordSecret=%s insecure=%v",
			suma.Name, suma.Spec.URL, suma.Spec.Username, suma.Spec.PasswordSecret, suma.Spec.InSecure)

		if len(suma.Spec.PasswordSecret) == 0 {
			log.Println("SUSE Manager Resource has no passwordSecret configured:", resourceName)
			sendGenericError(w)
			return
		}

		debugLog("Fetching password secret %q", suma.Spec.PasswordSecret)
		password, err := getPasswordFromSecret(k8sApi, token, suma.Spec.PasswordSecret)

		if err != nil {
			log.Println("Error getting Password from secret: ", err)
			sendGenericError(w)
			return
		}

		debugLog("Password secret resolved (length=%d)", len(password))

		cacheKey, err := sumaLogin(suma.Spec.URL, suma.Spec.Username, password)

		if err != nil {
			log.Println("Error logging into SUSE Manager: ", err)
			sendGenericError(w)
			return
		}

		debugLog("SUSE Manager login OK (cacheKey=%s)", cacheKey)

		err = sumaProxy(suma.Spec.URL, req, w, cacheKey)

		// If no error, then sumaProxy will have sent a response
		if err == nil {
			return
		}

		log.Println("Error proxying to SUSE Manager: ", err)

		// Error
		sendGenericError(w)
	}
}

func main() {
	flag.BoolVar(&debugMode, "debug", false, "enable verbose debug logging")
	flag.Parse()

	log.Println("Rancher SUSE Manager UI Extension Proxy")

	if debugMode {
		log.Println("Debug logging enabled")
	}

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
