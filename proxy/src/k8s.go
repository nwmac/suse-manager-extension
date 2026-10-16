package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
)

type APIResponse struct {
	Kind    string `json:"kind"`
	Code    int    `json:"code"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type SuseManagerGetResponse struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Spec struct {
		InSecure       bool   `json:"insecure"`
		PasswordSecret string `json:"passwordSecret"`
		URL            string `json:"url"`
		Username       string `json:"username"`
	} `json:"spec"`
	Code    int    `json:"code"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type SecretResponse struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Data struct {
		Password string `json:"password"`
	} `json:"data"`
	Code    int    `json:"code"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

func getSuseManagerResource(k8sApi, token, name string) (*SuseManagerGetResponse, error) {
	endpoint := fmt.Sprintf("%s/apis/susemanager.cattle.io/v1/namespaces/%s/managers/%s", k8sApi, NAMESPACE, name)

	debugLog("getSuseManagerResource: fetching %s", endpoint)

	body, err := makeApIRequest(endpoint, token)

	if err != nil {
		return nil, err
	}

	response := SuseManagerGetResponse{}
	jsonErr := json.Unmarshal(body, &response)
	if jsonErr != nil {
		log.Println("getSuseManagerResource: error parsing JSON response:", jsonErr)
		return nil, genericError()
	}

	if response.Kind != "Manager" {
		log.Printf("getSuseManagerResource: unexpected kind %q (code=%d status=%q message=%q)", response.Kind, response.Code, response.Status, response.Message)
		return nil, genericError()
	}

	return &response, nil
}

func getPasswordFromSecret(k8sApi, token, name string) (string, error) {
	endpoint := fmt.Sprintf("%s/api/v1/namespaces/%s/secrets/%s", k8sApi, NAMESPACE, name)

	debugLog("getPasswordFromSecret: fetching %s", endpoint)

	body, err := makeApIRequest(endpoint, token)

	if err != nil {
		log.Println("getPasswordFromSecret: error fetching secret:", err)
		return "", err
	}

	response := SecretResponse{}
	jsonErr := json.Unmarshal(body, &response)
	if jsonErr != nil {
		log.Println("getPasswordFromSecret: error parsing JSON response:", jsonErr)
		return "", genericError()
	}

	if response.Kind != "Secret" {
		log.Printf("getPasswordFromSecret: unexpected kind %q (code=%d status=%q message=%q)", response.Kind, response.Code, response.Status, response.Message)
		return "", genericError()
	}

	if len(response.Data.Password) > 0 {
		data, err := base64.StdEncoding.DecodeString(response.Data.Password)

		if err == nil && len(data) > 0 {
			debugLog("getPasswordFromSecret: decoded password from secret %q (length=%d)", name, len(data))
			return string(data), nil
		}

		if err != nil {
			log.Println("getPasswordFromSecret: error base64-decoding password:", err)
		}
	} else {
		log.Printf("getPasswordFromSecret: secret %q has no 'password' field", name)
	}

	return "", genericError()
}
