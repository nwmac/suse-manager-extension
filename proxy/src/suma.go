package main

import (
	"crypto/md5"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

type AuthData struct {
	Cookies []string
	Expires int64
}

var authCache map[string]AuthData
var authCacheLock sync.Mutex

var maxAgeRegexp *regexp.Regexp

func setCachedAuth(key string, data AuthData) {
	authCacheLock.Lock()
	authCache[key] = data
	authCacheLock.Unlock()
}

func clearCachedAuth(key string) {
	authCacheLock.Lock()
	delete(authCache, key)
	authCacheLock.Unlock()
}

func getCachedAuth(key string) (AuthData, bool) {
	authCacheLock.Lock()
	defer authCacheLock.Unlock()

	value, found := authCache[key]

	return value, found
}

func sumaLogin(url, username, password string) (string, error) {
	cacheKeyPlain := fmt.Sprintf("%s::%s::%s", url, username, password)
	cacheKey := fmt.Sprintf("%x", md5.Sum([]byte(cacheKeyPlain)))

	now := time.Now()
	unix := now.Unix()

	debugLog("sumaLogin: url=%s username=%s cacheKey=%s", url, username, cacheKey)

	if auth, found := getCachedAuth(cacheKey); found {
		// Check expiry time
		if unix < auth.Expires {
			debugLog("sumaLogin: using cached auth (expires in %d seconds, %d cookies)", auth.Expires-unix, len(auth.Cookies))
			for i, c := range auth.Cookies {
				debugLog("  cached cookie[%d]: %s", i, c)
			}
			return cacheKey, nil
		}

		debugLog("sumaLogin: cached auth expired (expired %d seconds ago) - clearing", unix-auth.Expires)
		clearCachedAuth(cacheKey)
	} else {
		debugLog("sumaLogin: no cached auth, performing fresh login")
	}

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	client := http.Client{
		Timeout:   time.Second * 10,
		Transport: tr,
	}

	loginUrl := fmt.Sprintf("%s/rhn/manager/api/auth/login", url)
	body := fmt.Sprintf("{\"login\": \"%s\", \"password\": \"%s\", \"duration\": 7200}", username, password)

	debugLog("sumaLogin: POST %s", loginUrl)

	req, err := http.NewRequest(http.MethodPost, loginUrl, strings.NewReader(body))
	if err != nil {
		log.Println("sumaLogin: error building request:", err)
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")

	res, getErr := client.Do(req)
	if getErr != nil {
		log.Println("sumaLogin: error performing login request:", getErr)
		return "", nil
	}

	if res.Body != nil {
		defer res.Body.Close()
	}

	debugLog("sumaLogin: response status %d %s", res.StatusCode, res.Status)
	if debugMode {
		debugLog("sumaLogin: response headers:")
		for k, v := range res.Header {
			debugLog("  %s: %s", k, strings.Join(v, ", "))
		}
	}

	responseBody, readErr := ioutil.ReadAll(res.Body)
	if readErr != nil {
		log.Println("sumaLogin: error reading login response body:", readErr)
		return "", nil
	}

	debugLog("sumaLogin: response body: %s", string(responseBody))

	response := LoginStatus{}
	jsonErr := json.Unmarshal(responseBody, &response)
	if jsonErr != nil {
		log.Println("sumaLogin: error parsing login response:", jsonErr)
		return "", jsonErr
	}

	if !response.Success {
		log.Println("sumaLogin: login was not successful (response.success=false)")
		return "", jsonErr
	}

	// Get the cookies
	allCookies := res.Header.Values("Set-Cookie")
	debugLog("sumaLogin: received %d Set-Cookie headers from MLM", len(allCookies))
	for i, c := range allCookies {
		debugLog("  Set-Cookie[%d]: %s", i, c)
	}

	cookies, maxAge := pickAuthCookies(allCookies)

	if len(cookies) == 0 {
		log.Println("sumaLogin: no valid pxt-session-cookie found in login response")
		return "", fmt.Errorf("no valid pxt-session-cookie in MLM login response")
	}

	debugLog("sumaLogin: selected pxt-session-cookie (effective maxAge=%d): %s", maxAge, cookies[0])

	// Store the auth data for later
	auth := AuthData{
		Cookies: cookies,
		Expires: unix + maxAge,
	}

	setCachedAuth(cacheKey, auth)

	return cacheKey, nil
}

func sumaProxy(url string, req *http.Request, w http.ResponseWriter, cacheKey string) error {
	authData := authCache[cacheKey]

	// Now proxy to the endpoint
	proxyUrl := fmt.Sprintf("%s%s", url, req.URL.Path)

	if len(req.URL.RawQuery) > 0 {
		proxyUrl = fmt.Sprintf("%s?%s", proxyUrl, req.URL.RawQuery)
	}

	debugLog("sumaProxy: %s %s (cacheKey=%s, %d cached cookies)", req.Method, proxyUrl, cacheKey, len(authData.Cookies))

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	// system.bootstrap can take 30s+ to complete - login uses its own 10s client below.
	client := http.Client{
		Timeout:   time.Second * 120,
		Transport: tr,
	}

	request, err := http.NewRequest(req.Method, proxyUrl, req.Body)
	if err != nil {
		log.Println("sumaProxy: error building proxy request:", err)
		return err
	}

	// Copy headers from the incoming request to the out-going proxied request: Copy the headers over that are needed
	for k, v := range req.Header {
		if k != "Set-Cookie" && k != "Cookie" && !strings.HasPrefix(k, "X-") {
			for _, hv := range v {
				request.Header.Set(k, hv)
			}
		}
	}

	// Set auth cookies for the proxied request. Each entry in authData.Cookies
	// is a full Set-Cookie header value (e.g. "JSESSIONID=abc; Path=/; HttpOnly"),
	// so extract just the name=value portion and combine them all into a single
	// Cookie header separated by "; ".
	cookiePairs := make([]string, 0, len(authData.Cookies))
	for _, sc := range authData.Cookies {
		if pair := strings.TrimSpace(strings.SplitN(sc, ";", 2)[0]); pair != "" {
			cookiePairs = append(cookiePairs, pair)
		}
	}
	if len(cookiePairs) > 0 {
		request.Header.Set("Cookie", strings.Join(cookiePairs, "; "))
	}

	if debugMode {
		debugLog("sumaProxy: outbound request headers to MLM:")
		for k, v := range request.Header {
			debugLog("  %s: %s", k, strings.Join(v, ", "))
		}
		debugLog("sumaProxy: auth cookies attached (%d pair(s)): %s", len(cookiePairs), strings.Join(cookiePairs, "; "))
		if len(cookiePairs) == 0 {
			debugLog("sumaProxy: WARNING - no auth cookies attached to outbound request")
		}
	}

	res, getErr := client.Do(request)
	if getErr != nil {
		log.Println("sumaProxy: error performing proxy request:", getErr)
		return getErr
	}

	if res.Body != nil {
		defer res.Body.Close()
	}

	debugLog("sumaProxy: response status %d %s from %s", res.StatusCode, res.Status, proxyUrl)
	if debugMode {
		debugLog("sumaProxy: response headers from MLM:")
		for k, v := range res.Header {
			debugLog("  %s: %s", k, strings.Join(v, ", "))
		}
	}

	// Copy headers other than 'Set-Cookie'
	for k, v := range res.Header {
		if k != "Set-Cookie" && k != "Cookie" && !strings.HasPrefix(k, "X-") {
			for _, hv := range v {
				w.Header().Set(k, hv)
			}
		}
	}

	w.WriteHeader(res.StatusCode)

	// Copy the body, optionally tee'ing into the log in debug mode
	if debugMode {
		bodyBytes, readErr := ioutil.ReadAll(res.Body)
		if readErr != nil {
			log.Println("sumaProxy: error reading response body for debug:", readErr)
			return readErr
		}

		preview := string(bodyBytes)
		if len(preview) > 2048 {
			debugLog("sumaProxy: response body (truncated to 2048 of %d bytes): %s", len(bodyBytes), preview[:2048])
		} else {
			debugLog("sumaProxy: response body (%d bytes): %s", len(bodyBytes), preview)
		}

		if _, err := w.Write(bodyBytes); err != nil {
			log.Println("sumaProxy: error writing response body:", err)
			return err
		}
	} else {
		io.Copy(w, res.Body)
	}

	return nil
}
