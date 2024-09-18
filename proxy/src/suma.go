package main

import (
	"crypto/md5"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
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

	if auth, found := getCachedAuth(cacheKey); found {
		// Check expiry time
		if unix < auth.Expires {
			return cacheKey, nil
		}

		clearCachedAuth(cacheKey)
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

	req, err := http.NewRequest(http.MethodPost, loginUrl, strings.NewReader(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")

	res, getErr := client.Do(req)
	if getErr != nil {
		return "", nil
	}

	if res.Body != nil {
		defer res.Body.Close()
	}

	responseBody, readErr := ioutil.ReadAll(res.Body)
	if readErr != nil {
		return "", nil
	}

	response := LoginStatus{}
	jsonErr := json.Unmarshal(responseBody, &response)
	if jsonErr != nil {
		return "", jsonErr
	}

	if !response.Success {
		return "", jsonErr
	}

	// Get the cookies
	cookies := res.Header.Values("Set-Cookie")
	maxAge := getMaxAge(cookies)

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

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	client := http.Client{
		Timeout:   time.Second * 10,
		Transport: tr,
	}

	request, err := http.NewRequest(req.Method, proxyUrl, req.Body)
	if err != nil {
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

	// Set auth cookies for the proxied request
	for _, cookie := range authData.Cookies {
		request.Header.Set("Cookie", cookie)
	}

	res, getErr := client.Do(request)
	if getErr != nil {
		return getErr
	}

	if res.Body != nil {
		defer res.Body.Close()
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

	// Copy the body
	io.Copy(w, res.Body)

	return nil
}
