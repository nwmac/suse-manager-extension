package main

import (
	"crypto/tls"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"time"
)

func genericError() error {
	return errors.New("Unable to fetch SUSE Manager information")
}

func sendGenericError(w http.ResponseWriter) {
	http.Error(w, "401 - Unauthorized", http.StatusForbidden)
}

func makeApIRequest(url, token string) ([]byte, error) {
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	client := http.Client{
		Timeout:   time.Second * 10,
		Transport: tr,
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	res, getErr := client.Do(req)
	if getErr != nil {
		return nil, err
	}

	if res.Body != nil {
		defer res.Body.Close()
	}

	body, readErr := ioutil.ReadAll(res.Body)
	if readErr != nil {
		return nil, err
	}

	return body, nil
}

func getMaxAge(cookies []string) int64 {
	var maxAge int64

	maxAge = 1

	for _, cookie := range cookies {
		m := maxAgeRegexp.FindAllStringSubmatch(cookie, -1)

		if len(m) == 1 {
			if len(m[0]) == 2 {
				age := m[0][1]
				i, err := strconv.Atoi(age)
				mi := int64(i)

				if err == nil {
					if mi > maxAge {
						maxAge = mi
					}
				}
			}
		}
	}

	// Take a bit off of maxAge, to account for processing time
	if maxAge > 10 {
		maxAge -= 10
	}

	return maxAge
}
