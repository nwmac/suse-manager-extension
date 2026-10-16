package main

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// Registration status values reported to the UI.
const (
	regStatusPending       = "pending"
	regStatusBootstrapping = "bootstrapping"
	regStatusJoiningGroup  = "joining-group"
	regStatusDone          = "done"
	regStatusFailed        = "failed"
)

// How long completed / failed items are retained so the UI can display
// terminal state after polling; older items are pruned.
const registrationRetention = 30 * time.Minute

// RegistrationItem is one node's slot in the queue. Exported json fields are
// what the UI sees; lowercased fields are worker-only inputs (in particular
// SSH credentials, which we never echo back).
type RegistrationItem struct {
	NodeID       string   `json:"nodeId"`
	NodeName     string   `json:"nodeName"`
	Host         string   `json:"host"`
	IPs          []string `json:"ips"`
	Status       string   `json:"status"`
	Message      string   `json:"message,omitempty"`
	SumaSystemID int64    `json:"sumaSystemId,omitempty"`
	QueuedAt     int64    `json:"queuedAt"`
	StartedAt    int64    `json:"startedAt,omitempty"`
	FinishedAt   int64    `json:"finishedAt,omitempty"`

	sshPort        int
	sshUser        string
	sshPrivKey     string
	sshPrivKeyPass string
	saltSSH        bool
}

// registrationSlot tracks one item inside the shared store. The mutex on
// registrationStore serialises access to the Item field.
type registrationSlot struct {
	Key             string // suseManagerId + "/" + systemGroupName
	SuseManagerID   string
	SystemGroupName string
	ActivationKey   string
	BatchID         string
	Item            *RegistrationItem
}

var registrationStore = struct {
	sync.Mutex
	slots []*registrationSlot
}{}

func groupKey(suseManagerID, systemGroupName string) string {
	return suseManagerID + "/" + systemGroupName
}

func newBatchID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("batch-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func nowUnix() int64 {
	return time.Now().Unix()
}

// pruneRegistrationsLocked drops terminal (done/failed) items older than the
// retention window. Caller must hold registrationStore.Mutex.
func pruneRegistrationsLocked() {
	cutoff := time.Now().Add(-registrationRetention).Unix()
	kept := registrationStore.slots[:0]

	for _, s := range registrationStore.slots {
		item := s.Item
		terminal := item.Status == regStatusDone || item.Status == regStatusFailed
		if terminal && item.FinishedAt > 0 && item.FinishedAt < cutoff {
			continue
		}
		kept = append(kept, s)
	}

	registrationStore.slots = kept
}

// ---- HTTP handlers ---------------------------------------------------------

// handleExtensionRequest routes /extension/* calls to registration handlers.
func handleExtensionRequest(k8sApi, token string, w http.ResponseWriter, req *http.Request) {
	switch {
	case req.URL.Path == "/extension/registrations" && req.Method == http.MethodPost:
		handleRegisterNodes(k8sApi, token, w, req)
	case req.URL.Path == "/extension/registrations" && req.Method == http.MethodGet:
		handleListRegistrations(w, req)
	default:
		http.NotFound(w, req)
	}
}

type registerNodesRequest struct {
	SystemGroupName string          `json:"systemGroupName"`
	ActivationKey   string          `json:"activationKey"`
	Nodes           []registerInput `json:"nodes"`
}

type registerInput struct {
	NodeID         string   `json:"nodeId"`
	NodeName       string   `json:"nodeName"`
	Host           string   `json:"host"`
	IPs            []string `json:"ips"`
	SSHPort        int      `json:"sshPort"`
	SSHUser        string   `json:"sshUser"`
	SSHPrivKey     string   `json:"sshPrivKey"`
	SSHPrivKeyPass string   `json:"sshPrivKeyPass"`
	SaltSSH        bool     `json:"saltSSH"`
}

type registerNodesResponse struct {
	BatchID  string `json:"batchId"`
	Accepted int    `json:"accepted"`
}

func handleRegisterNodes(k8sApi, token string, w http.ResponseWriter, req *http.Request) {
	suseManagerID := req.Header.Get(API_HEADER)
	if suseManagerID == "" {
		http.Error(w, "missing "+API_HEADER+" header", http.StatusBadRequest)
		return
	}

	var body registerNodesRequest
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if body.SystemGroupName == "" || body.ActivationKey == "" || len(body.Nodes) == 0 {
		http.Error(w, "systemGroupName, activationKey and nodes are required", http.StatusBadRequest)
		return
	}

	// Resolve the SUSE Manager resource + password up front so we fail fast
	// on config errors instead of only surfacing them inside the worker.
	suma, err := getSuseManagerResource(k8sApi, token, suseManagerID)
	if err != nil || suma == nil {
		log.Println("handleRegisterNodes: unable to resolve SUSE Manager resource:", suseManagerID, err)
		http.Error(w, "unable to resolve SUSE Multi-Linux Manager", http.StatusBadRequest)
		return
	}
	if suma.Spec.PasswordSecret == "" {
		http.Error(w, "SUSE Multi-Linux Manager resource has no passwordSecret", http.StatusBadRequest)
		return
	}
	password, err := getPasswordFromSecret(k8sApi, token, suma.Spec.PasswordSecret)
	if err != nil {
		log.Println("handleRegisterNodes: unable to read password secret:", err)
		http.Error(w, "unable to read SUSE Multi-Linux Manager credentials", http.StatusBadRequest)
		return
	}

	batchID := newBatchID()
	key := groupKey(suseManagerID, body.SystemGroupName)
	queuedAt := nowUnix()

	items := make([]*RegistrationItem, 0, len(body.Nodes))

	registrationStore.Lock()
	pruneRegistrationsLocked()
	for _, n := range body.Nodes {
		item := &RegistrationItem{
			NodeID:         n.NodeID,
			NodeName:       n.NodeName,
			Host:           n.Host,
			IPs:            n.IPs,
			Status:         regStatusPending,
			QueuedAt:       queuedAt,
			sshPort:        n.SSHPort,
			sshUser:        n.SSHUser,
			sshPrivKey:     n.SSHPrivKey,
			sshPrivKeyPass: n.SSHPrivKeyPass,
			saltSSH:        n.SaltSSH,
		}
		if item.sshPort == 0 {
			item.sshPort = 22
		}
		registrationStore.slots = append(registrationStore.slots, &registrationSlot{
			Key:             key,
			SuseManagerID:   suseManagerID,
			SystemGroupName: body.SystemGroupName,
			ActivationKey:   body.ActivationKey,
			BatchID:         batchID,
			Item:            item,
		})
		items = append(items, item)
	}
	registrationStore.Unlock()

	go runRegistrationBatch(suma.Spec.URL, suma.Spec.Username, password, suseManagerID, body.SystemGroupName, body.ActivationKey, batchID, items)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(registerNodesResponse{BatchID: batchID, Accepted: len(items)})
}

type listRegistrationsResponse struct {
	SuseManagerID   string              `json:"suseManagerId"`
	SystemGroupName string              `json:"systemGroupName"`
	Summary         registrationSummary `json:"summary"`
	Items           []*RegistrationItem `json:"items"`
}

type registrationSummary struct {
	Pending int `json:"pending"`
	Running int `json:"running"`
	Done    int `json:"done"`
	Failed  int `json:"failed"`
	Total   int `json:"total"`
}

func handleListRegistrations(w http.ResponseWriter, req *http.Request) {
	suseManagerID := req.Header.Get(API_HEADER)
	if suseManagerID == "" {
		http.Error(w, "missing "+API_HEADER+" header", http.StatusBadRequest)
		return
	}
	systemGroupName := req.URL.Query().Get("systemGroup")
	if systemGroupName == "" {
		http.Error(w, "systemGroup query parameter is required", http.StatusBadRequest)
		return
	}

	key := groupKey(suseManagerID, systemGroupName)
	resp := listRegistrationsResponse{
		SuseManagerID:   suseManagerID,
		SystemGroupName: systemGroupName,
		Items:           []*RegistrationItem{},
	}

	registrationStore.Lock()
	pruneRegistrationsLocked()
	for _, s := range registrationStore.slots {
		if s.Key != key {
			continue
		}
		// Copy to a value so we can safely serialise without holding the lock
		// on the mutation path.
		itemCopy := *s.Item
		resp.Items = append(resp.Items, &itemCopy)
		switch itemCopy.Status {
		case regStatusPending:
			resp.Summary.Pending++
		case regStatusBootstrapping, regStatusJoiningGroup:
			resp.Summary.Running++
		case regStatusDone:
			resp.Summary.Done++
		case regStatusFailed:
			resp.Summary.Failed++
		}
		resp.Summary.Total++
	}
	registrationStore.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ---- Worker ----------------------------------------------------------------

func runRegistrationBatch(sumaURL, username, password, suseManagerID, systemGroupName, activationKey, batchID string, items []*RegistrationItem) {
	log.Printf("registrations: batch=%s target=%s group=%s items=%d starting", batchID, suseManagerID, systemGroupName, len(items))

	successIDs := make([]int64, 0, len(items))

	for _, item := range items {
		setStatus(item, regStatusBootstrapping, "")
		item.StartedAt = nowUnix()

		cacheKey, err := sumaLogin(sumaURL, username, password)
		if err != nil {
			finishItem(item, regStatusFailed, "SUSE Multi-Linux Manager login failed: "+err.Error())
			continue
		}

		if err := bootstrapItem(sumaURL, cacheKey, activationKey, item); err != nil {
			finishItem(item, regStatusFailed, err.Error())
			continue
		}

		// Bootstrap succeeded — the node is now handing off to MLM but doesn't
		// appear in inventory instantly. Poll until we see it (or hit the
		// timeout) before attempting the group join.
		setStatus(item, regStatusJoiningGroup, "Waiting for system to appear in SUSE Multi-Linux Manager…")

		sid, waitErr := waitForSystemToAppear(sumaURL, cacheKey, item)
		if waitErr != nil {
			finishItem(item, regStatusFailed, waitErr.Error())
			continue
		}

		setStatus(item, regStatusJoiningGroup, "Adding to system group…")

		if addErr := addSystemToGroup(sumaURL, cacheKey, systemGroupName, sid); addErr != nil {
			finishItem(item, regStatusFailed, fmt.Sprintf("bootstrapped, but could not add to system group: %s", addErr.Error()))
			continue
		}

		item.SumaSystemID = sid
		successIDs = append(successIDs, sid)
		finishItem(item, regStatusDone, "")
	}

	log.Printf("registrations: batch=%s finished (%d succeeded)", batchID, len(successIDs))
}

func setStatus(item *RegistrationItem, status, message string) {
	registrationStore.Lock()
	item.Status = status
	item.Message = message
	registrationStore.Unlock()
}

func finishItem(item *RegistrationItem, status, message string) {
	registrationStore.Lock()
	item.Status = status
	item.Message = message
	item.FinishedAt = nowUnix()
	registrationStore.Unlock()
}

// ---- SUMA client (internal, for use inside worker goroutines) -------------

// sumaCall performs a JSON API call against MLM using cached auth cookies.
// respOut is optional; if non-nil the response body is decoded into it.
func sumaCall(sumaURL, cacheKey, method, apiPath string, reqBody interface{}, respOut interface{}) error {
	auth, ok := getCachedAuth(cacheKey)
	if !ok {
		return fmt.Errorf("no cached SUSE Multi-Linux Manager auth for key %s", cacheKey)
	}

	var bodyReader *bytes.Reader
	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(b)
	}

	url := fmt.Sprintf("%s/rhn/manager/api%s", sumaURL, apiPath)

	var req *http.Request
	var err error
	if bodyReader != nil {
		req, err = http.NewRequest(method, url, bodyReader)
	} else {
		req, err = http.NewRequest(method, url, nil)
	}
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	cookiePairs := make([]string, 0, len(auth.Cookies))
	for _, sc := range auth.Cookies {
		if pair := strings.TrimSpace(strings.SplitN(sc, ";", 2)[0]); pair != "" {
			cookiePairs = append(cookiePairs, pair)
		}
	}
	if len(cookiePairs) > 0 {
		req.Header.Set("Cookie", strings.Join(cookiePairs, "; "))
	}

	client := http.Client{
		Timeout: time.Second * 180,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	respBody, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return err
	}

	debugLog("sumaCall: %s %s -> %d (%d bytes)", method, url, res.StatusCode, len(respBody))

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("SUSE Multi-Linux Manager returned HTTP %d: %s", res.StatusCode, truncate(string(respBody), 512))
	}

	// SUMA wraps everything in { success: bool, result: ..., message: ... }.
	// Peel off success/message first so callers get a useful error string.
	var envelope struct {
		Success bool            `json:"success"`
		Message string          `json:"message"`
		Result  json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(respBody, &envelope); err != nil {
		return fmt.Errorf("invalid JSON from SUSE Multi-Linux Manager: %v (body=%s)", err, truncate(string(respBody), 512))
	}
	if !envelope.Success {
		msg := envelope.Message
		if msg == "" {
			msg = "SUSE Multi-Linux Manager reported failure"
		}
		return fmt.Errorf("%s", msg)
	}

	if respOut != nil && len(envelope.Result) > 0 {
		if err := json.Unmarshal(envelope.Result, respOut); err != nil {
			return fmt.Errorf("could not decode SUSE Multi-Linux Manager result: %v", err)
		}
	}

	return nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// ---- SUMA operations used by the worker ----------------------------------

func bootstrapItem(sumaURL, cacheKey, activationKey string, item *RegistrationItem) error {
	usePrivateKey := item.sshPrivKey != ""

	endpoint := "/system/bootstrap"
	if usePrivateKey {
		endpoint = "/system/bootstrapWithPrivateSshKey"
	}

	payload := map[string]interface{}{
		"host":            item.Host,
		"sshPort":         item.sshPort,
		"sshUser":         item.sshUser,
		"activationKey":   activationKey,
		"reactivationKey": "",
		"saltSSH":         item.saltSSH,
	}
	if usePrivateKey {
		payload["sshPrivKey"] = item.sshPrivKey
		payload["sshPrivKeyPass"] = item.sshPrivKeyPass
	}

	// system.bootstrap returns 1 on success; the envelope's Success flag is
	// what actually tells us whether it worked, so we don't need the result.
	if err := sumaCall(sumaURL, cacheKey, http.MethodPost, endpoint, payload, nil); err != nil {
		return fmt.Errorf("bootstrap failed: %s", err.Error())
	}
	return nil
}

type sumaListedSystem struct {
	ID int64 `json:"id"`
}

type sumaNetworkInfo struct {
	IP       string `json:"ip"`
	IP6      string `json:"ip6"`
	Hostname string `json:"hostname"`
}

// Cap on how many systems we probe per lookup. A freshly-bootstrapped system
// has the highest system id, so scanning from the top is very fast in practice.
const findSystemMaxProbes = 100

func findSystemIDByIPs(sumaURL, cacheKey string, ips []string) (int64, error) {
	if len(ips) == 0 {
		return 0, nil
	}

	wanted := make(map[string]bool, len(ips))
	for _, ip := range ips {
		if ip != "" {
			wanted[ip] = true
		}
	}

	var systems []sumaListedSystem
	if err := sumaCall(sumaURL, cacheKey, http.MethodGet, "/system/listSystems", nil, &systems); err != nil {
		return 0, err
	}
	if len(systems) == 0 {
		return 0, nil
	}

	// Sort by id descending: newest systems (which is what we just bootstrapped)
	// have the highest ids, so we usually find a match in the first probe.
	sort.Slice(systems, func(i, j int) bool { return systems[i].ID > systems[j].ID })

	limit := len(systems)
	if limit > findSystemMaxProbes {
		limit = findSystemMaxProbes
	}

	for i := 0; i < limit; i++ {
		var net sumaNetworkInfo
		if err := sumaCall(sumaURL, cacheKey, http.MethodGet, fmt.Sprintf("/system/getNetwork?sid=%d", systems[i].ID), nil, &net); err != nil {
			// One system's network lookup failing shouldn't abort the search
			// (e.g. a stale/unreachable system) - just keep going.
			debugLog("findSystemIDByIPs: getNetwork sid=%d failed: %v", systems[i].ID, err)
			continue
		}
		if wanted[net.IP] || (net.IP6 != "" && wanted[net.IP6]) {
			return systems[i].ID, nil
		}
	}

	return 0, nil
}

// sumaSystemGroup is the shape returned by system.listGroups. `subscribed` is
// 1 when the system is a member of the group, 0 when it is merely visible.
type sumaSystemGroup struct {
	ID         int64  `json:"id"`
	Name       string `json:"system_group_name"`
	Subscribed int    `json:"subscribed"`
}

// isSystemInGroup returns true if the system is already a member of the named
// group. Activation keys can auto-assign a system to groups on bootstrap, so
// we check membership first — the API user we're logged in as may not have
// direct write access to the group even when it can create it, so we skip the
// redundant add when the system is already a member.
func isSystemInGroup(sumaURL, cacheKey, systemGroupName string, sid int64) (bool, error) {
	var groups []sumaSystemGroup
	if err := sumaCall(sumaURL, cacheKey, http.MethodGet, fmt.Sprintf("/system/listGroups?sid=%d", sid), nil, &groups); err != nil {
		return false, err
	}
	for _, g := range groups {
		if g.Name == systemGroupName && g.Subscribed == 1 {
			return true, nil
		}
	}
	return false, nil
}

func addSystemToGroup(sumaURL, cacheKey, systemGroupName string, sid int64) error {
	// Fast-path: if the activation key already added the system to this group,
	// skip the explicit addOrRemoveSystems call, which would fail if the API
	// user lacks direct write access to the group.
	if inGroup, err := isSystemInGroup(sumaURL, cacheKey, systemGroupName, sid); err == nil && inGroup {
		return nil
	}

	payload := map[string]interface{}{
		"systemGroupName": systemGroupName,
		"serverIds":       []int64{sid},
		"add":             true,
	}
	return sumaCall(sumaURL, cacheKey, http.MethodPost, "/systemgroup/addOrRemoveSystems", payload, nil)
}

// After a successful bootstrap the system doesn't appear in MLM's inventory
// instantly — salt-ssh has to finish, MLM has to accept the minion key, and
// the system row has to land. Poll listSystems until we see the new node (or
// hit the timeout) before trying to join it to the group.
const (
	appearWaitBudget   = 2 * time.Minute
	appearWaitInterval = 5 * time.Second
)

func waitForSystemToAppear(sumaURL, cacheKey string, item *RegistrationItem) (int64, error) {
	deadline := time.Now().Add(appearWaitBudget)
	var lastErr error

	for attempt := 1; ; attempt++ {
		sid, err := findSystemIDByIPs(sumaURL, cacheKey, item.IPs)
		if err == nil && sid > 0 {
			return sid, nil
		}
		if err != nil {
			lastErr = fmt.Errorf("registered, but could not locate the system in SUSE Multi-Linux Manager: %s", err.Error())
		} else {
			lastErr = fmt.Errorf("registered, but no matching system was visible in SUSE Multi-Linux Manager yet")
		}

		if time.Now().Add(appearWaitInterval).After(deadline) {
			return 0, fmt.Errorf("%s (after %d attempts over %s)", lastErr.Error(), attempt, appearWaitBudget)
		}

		debugLog("waitForSystemToAppear: attempt %d for %s failed (%v), retrying in %s", attempt, item.NodeName, lastErr, appearWaitInterval)
		time.Sleep(appearWaitInterval)
	}
}
