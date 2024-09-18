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

	body, err := makeApIRequest(endpoint, token)

	if err != nil {
		return nil, err
	}

	response := SuseManagerGetResponse{}
	jsonErr := json.Unmarshal(body, &response)
	if jsonErr != nil {
		return nil, genericError()
	}

	if response.Kind != "Manager" {
		return nil, genericError()
	}

	return &response, nil
}

func getPasswordFromSecret(k8sApi, token, name string) (string, error) {
	endpoint := fmt.Sprintf("%s/api/v1/namespaces/%s/secrets/%s", k8sApi, NAMESPACE, name)

	body, err := makeApIRequest(endpoint, token)

	if err != nil {
		log.Println(err)
		return "", err
	}

	response := SecretResponse{}
	jsonErr := json.Unmarshal(body, &response)
	if jsonErr != nil {
		return "", genericError()
	}

	log.Println(string(body))

	if response.Kind != "Secret" {
		return "", genericError()
	}

	if len(response.Data.Password) > 0 {
		data, err := base64.StdEncoding.DecodeString(response.Data.Password)

		if err == nil && len(data) > 0 {
			return string(data), nil
		}
	}

	return "", genericError()
}
