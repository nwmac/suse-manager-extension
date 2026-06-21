package main

import (
	"crypto/tls"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func genericError() error {
	return errors.New("Unable to fetch SUSE Manager information")
}

func sendGenericError(w http.ResponseWriter) {
	http.Error(w, "401 - Unauthorized", http.StatusForbidden)
}

func makeApIRequest(url, token string) ([]byte, error) {
	debugLog("makeApIRequest: GET %s", url)

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	client := http.Client{
		Timeout:   time.Second * 10,
		Transport: tr,
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		log.Println("makeApIRequest: error building request:", err)
		return nil, err
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	res, getErr := client.Do(req)
	if getErr != nil {
		log.Println("makeApIRequest: error performing request:", getErr)
		return nil, getErr
	}

	if res.Body != nil {
		defer res.Body.Close()
	}

	debugLog("makeApIRequest: response status %d %s from %s", res.StatusCode, res.Status, url)

	body, readErr := ioutil.ReadAll(res.Body)
	if readErr != nil {
		log.Println("makeApIRequest: error reading response body:", readErr)
		return nil, readErr
	}

	if debugMode {
		preview := string(body)
		if len(preview) > 1024 {
			debugLog("makeApIRequest: response body (truncated to 1024 of %d bytes): %s", len(body), preview[:1024])
		} else {
			debugLog("makeApIRequest: response body (%d bytes): %s", len(body), preview)
		}
	}

	return body, nil
}

// pickAuthCookies filters the Set-Cookie headers from an MLM login response
// down to the single pxt-session-cookie we care about. MLM may return more
// than one - including a Max-Age=0 deletion cookie clearing a prior session -
// so we keep only entries with a positive Max-Age and pick the one with the
// longest remaining lifetime. Returns the chosen Set-Cookie string (or "") and
// the Max-Age to use for caching, already adjusted for processing slack.
func pickAuthCookies(setCookies []string) ([]string, int64) {
	var bestCookie string
	var bestMaxAge int64 = -1

	for _, sc := range setCookies {
		nv := strings.TrimSpace(strings.SplitN(sc, ";", 2)[0])
		if !strings.HasPrefix(nv, "pxt-session-cookie=") {
			continue
		}

		// A pxt-session-cookie with an empty value is a deletion - skip it.
		if nv == "pxt-session-cookie=" {
			continue
		}

		maxAge := int64(-1)
		if m := maxAgeRegexp.FindStringSubmatch(sc); len(m) == 2 {
			if i, err := strconv.Atoi(m[1]); err == nil {
				maxAge = int64(i)
			}
		}

		// Max-Age=0 means the server is asking us to delete the cookie.
		if maxAge == 0 {
			continue
		}

		if maxAge > bestMaxAge {
			bestMaxAge = maxAge
			bestCookie = sc
		}
	}

	if bestCookie == "" {
		return nil, 0
	}

	// Take a bit off Max-Age to account for processing time.
	if bestMaxAge > 10 {
		bestMaxAge -= 10
	} else if bestMaxAge < 0 {
		bestMaxAge = 1
	}

	return []string{bestCookie}, bestMaxAge
}
