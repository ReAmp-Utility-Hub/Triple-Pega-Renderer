import { useState, useCallback, useEffect } from "react";

const TOKEN_URL = import.meta.env.VITE_TOKEN_URL;
const API_BASE = import.meta.env.VITE_API_BASE;
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET;
const CASE_TYPE_ID = import.meta.env.VITE_PURCHASE_CASE_TYPE_ID;

const cleanLabel = (s = "") => {
  let cleaned = s
    .replace(/^@(FL|L)\s*\.?/, "")
    .replace(/AvailableVehicles\./g, "")
    .replace(/SeletedVehicle\./g, "")
    .replace(/Engine\./g, "");

  if (cleaned.includes(".") && !cleaned.includes(" ")) {
    cleaned = cleaned.split(".").pop();
  }
  return cleaned;
};

function extractUIElements(resources, viewName) {
  const view = resources?.views?.[viewName]?.[0];
  if (!view) return [];

  const elements = [];

  const walk = (nodes) => {
    nodes.forEach((n) => {
      if (n.type === "View" || n.type === "Region") {
        walk(n.children || []);
      } else if (n.type === "Group") {
        elements.push({
          type: "Group",
          heading: cleanLabel(n.config?.heading || ""),
          children: walkGroups(n.children || []),
        });
      } else if (n.config?.value || n.type === "Pega_Extensions_BannerInput") {
        const name = n.config?.value?.replace("@P .", "") || "";
        const meta = resources?.fields?.[name]?.[0] || {};
        const label = cleanLabel(n.config?.label || meta.label || name);

        elements.push({
          name,
          label,
          type: n.type,
          config: n.config,
          isNumeric: ["Decimal", "Integer", "Currency"].includes(n.type),
          isDropdown: n.type === "Dropdown" || n.type === "AutoComplete",
          isTextArea: n.type === "TextArea",
          isBanner: n.type === "Pega_Extensions_BannerInput",
          isDate: n.type === "Date",
          isEmail:
            n.type === "Email" || meta.validateAs === "ValidEmailAddress",
          options: meta.datasource?.records || [],
          readOnly: n.config?.readOnly || false,
        });
      } else if (n.type === "reference" && n.config?.type === "view") {
        const nestedElements = extractUIElements(resources, n.config.name);
        elements.push(...nestedElements);
      }
    });
  };

  const walkGroups = (nodes) => {
    const groupItems = [];
    nodes.forEach((n) => {
      if (n.config?.value) {
        const name = n.config.value.replace("@P .", "");
        const meta = resources?.fields?.[name]?.[0] || {};
        const label = cleanLabel(n.config.label || meta.label || name);
        groupItems.push({
          name,
          label,
          type: n.type,
          config: n.config,
          isNumeric: ["Decimal", "Integer", "Currency"].includes(n.type),
          readOnly: n.config?.readOnly || false,
        });
      }
    });
    return groupItems;
  };

  walk(view.children || []);
  return elements;
}

function extractCompareRows(resources) {
  const region = resources?.views?.["CompareVehicles"]?.[0]?.children?.[0];
  if (!region) return [];
  const rows = [];
  const seen = new Set();
  const walk = (nodes, group = null) => {
    nodes.forEach((n) => {
      if (n.type === "Group") {
        const heading = cleanLabel(n.config?.heading || "");
        rows.push({ isHeader: true, label: heading });
        walk(n.children || [], heading);
      } else if (n.type === "ScalarList" && n.config?.value) {
        const path = n.config.value
          .replace("@FILTERED_LIST .AvailableVehicles[].", "")
          .replace("@FILTERED_LIST ", "");
        if (seen.has(path)) return;
        seen.add(path);
        const label = cleanLabel(
          (n.config.label || path).replace(/^AvailableVehicles\./, ""),
        );
        rows.push({ isHeader: false, label, path, group });
      }
    });
  };
  walk(region.children || []);
  return rows;
}

function getNestedVal(obj, path) {
  if (!path) return "";
  return path.split(".").reduce((a, k) => a?.[k], obj) ?? "";
}

export default function PurchaseVehicleDemo({ onBack }) {
  const [phase, setPhase] = useState("INIT");
  const [loadingMsg, setLoadingMsg] = useState("Starting...");
  const [error, setError] = useState("");

  const [token, setToken] = useState("");
  const [etag, setEtag] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [actionId, setActionId] = useState("");

  const [caseDetails, setCaseDetails] = useState({});
  const [navSteps, setNavSteps] = useState([]);
  const [actionButtons, setActionButtons] = useState({
    main: [],
    secondary: [],
  });

  const [uiElements, setUiElements] = useState([]);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState([]);
  const [contentData, setContentData] = useState({});

  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [compareRows, setCompareRows] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [finalResponse, setFinalResponse] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [inputCaseId, setInputCaseId] = useState("");

  const ensureToken = useCallback(async () => {
    if (token) return token;
    setLoadingMsg("Authenticating...");
    const authRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
    });
    if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
    const { access_token: tok } = await authRes.json();
    setToken(tok);
    return tok;
  }, [token]);

  const getAssignment = useCallback(async (assId, tok) => {
    setLoadingMsg("Loading assignment view...");
    const res = await fetch(
      `${API_BASE}/assignments/${encodeURIComponent(assId)}?viewType=form`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    const newEtag = res.headers.get("ETag") || res.headers.get("etag") || "";
    if (newEtag) setEtag(newEtag);
    if (!res.ok) throw new Error(`Assignment fetch failed: ${res.status}`);

    const data = await res.json();
    const caseInfo = data.data?.caseInfo || {};
    const uiRes = data.uiResources || {};
    const content = caseInfo.content || {};
    setContentData(content);

    const assignment = caseInfo.assignments?.[0];
    const action = assignment?.actions?.[0];

    setAssignmentId(assignment?.ID || assId);
    setActionId(action?.ID || "");
    setCaseDetails({
      businessID: caseInfo.businessID || "",
      status: caseInfo.status || "",
      urgency: caseInfo.urgency || "",
      caseType: caseInfo.caseTypeName || "",
      stage: caseInfo.stageLabel || "",
      instructions: assignment?.name || "",
    });
    setNavSteps(uiRes.navigation?.steps || []);

    let buttons = uiRes.actionButtons || { main: [], secondary: [] };
    if (
      action?.links?.save &&
      !buttons.secondary.some((b) => b.actionID === "save")
    ) {
      buttons.secondary.push({
        actionID: "save",
        name: action.links.save.title?.trim() || "Save for Later",
      });
    }
    setActionButtons(buttons);

    const viewName = uiRes.root?.config?.name || "";
    const resources = uiRes.resources;

    if (viewName === "SelectVehicle") {
      setAvailableVehicles(content.AvailableVehicles || []);
      setCompareRows(extractCompareRows(resources));
      setSelectedVehicleId(content.SelectedVehicleID || "");
      setPhase("FORM2");
    } else {
      const elements = extractUIElements(resources, viewName);
      setUiElements(elements);

      const flat = {};
      const mapContent = (obj, prefix = "") => {
        Object.keys(obj).forEach((k) => {
          const val = obj[k];
          const path = prefix ? `${prefix}.${k}` : k;
          if (val && typeof val === "object" && !Array.isArray(val)) {
            mapContent(val, path);
          } else {
            flat[path] = val;
          }
        });
      };
      mapContent(content);
      setFormData(flat);
      setPhase("FORM1");
    }
  }, []);

  useEffect(() => {
    ensureToken().catch((e) => console.warn("Initial auth failed", e));
  }, [ensureToken]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((p) => ({
      ...p,
      [name]: type === "number" ? (value === "" ? "" : Number(value)) : value,
    }));
  };

  const handleLookup = useCallback(async () => {
    if (!inputCaseId.trim()) return;
    setPhase("LOADING");
    setError("");
    try {
      const tok = await ensureToken();

      setLoadingMsg("Looking up case...");
      const rawId = inputCaseId.trim().toUpperCase();
      let cleanedId = rawId;

      if (!cleanedId.includes(" ")) {
        cleanedId = `OQ7AIU-SMART-WORK ${cleanedId}`;
      }

      const caseRes = await fetch(
        `${API_BASE}/cases/${encodeURIComponent(cleanedId)}?viewType=page`,
        {
          headers: { Authorization: `Bearer ${tok}` },
        },
      );

      if (!caseRes.ok) {
        const errData = await caseRes.json();
        const detail =
          errData.errorDetails?.[0]?.localizedValue ||
          errData.localizedValue ||
          "Case not found";
        throw new Error(detail);
      }
      const caseData = await caseRes.json();

      const caseInfo = caseData.data?.caseInfo || {};
      const nextAssId = caseInfo.assignments?.[0]?.ID;
      if (!nextAssId) {
        throw new Error("No active assignment found for this case.");
      }

      await getAssignment(nextAssId, tok);
      setShowModal(false);
      setLoadingMsg("");
    } catch (err) {
      console.error(err);
      setError(`${err.message}`);
      setPhase("ERROR");
    }
  }, [getAssignment, inputCaseId, ensureToken]);

  const saveForLater = async () => {
    setPhase("LOADING");
    setLoadingMsg("Saving progress...");
    try {
      const url = `${API_BASE}/assignments/${encodeURIComponent(assignmentId)}/actions/${actionId}/save`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "If-Match": etag,
        },
        body: JSON.stringify({
          content: { SelectedVehicleID: selectedVehicleId },
          pageInstructions: [],
        }),
      });

      const newEtag = res.headers.get("ETag") || res.headers.get("etag") || "";
      if (newEtag) setEtag(newEtag);

      const resData = await res.json();

      if (!res.ok) {
        const msgs = resData.errorDetails || resData.validationMessages || [];
        if (msgs.length) {
          setFormErrors(msgs);
          setPhase(phase);
          return;
        }
        throw new Error(`Save failed: ${res.status}`);
      }

      const caseInfo = resData.data?.caseInfo;
      if (caseInfo) {
        const assignment = caseInfo.assignments?.[0];
        const action = assignment?.actions?.[0];
        if (assignment?.ID) setAssignmentId(assignment.ID);
        if (action?.ID) setActionId(action.ID);
      }

      alert("Progress saved successfully!");
      setPhase(phase);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setPhase("ERROR");
    }
  };

  const start = useCallback(async () => {
    setPhase("LOADING");
    setError("");
    try {
      const tok = await ensureToken();

      setLoadingMsg("Creating case...");
      const caseRes = await fetch(`${API_BASE}/cases?viewType=none`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          content: { pyLabel: "Case Creation" },
          caseTypeID: CASE_TYPE_ID,
        }),
      });
      if (!caseRes.ok)
        throw new Error(`Case creation failed: ${caseRes.status}`);
      const caseData = await caseRes.json();

      const nextAssId =
        caseData.nextAssignmentInfo?.ID ||
        caseData.data?.caseInfo?.assignments?.[0]?.ID;
      if (!nextAssId) throw new Error("No assignment ID from case creation");

      await getAssignment(nextAssId, tok);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setPhase("ERROR");
    }
  }, [getAssignment]);

  const submitForm = async (e) => {
    if (e) e.preventDefault();
    setFormErrors([]);

    let payload = {};
    if (phase === "FORM2") {
      if (!selectedVehicleId) {
        alert("Please select a vehicle.");
        return;
      }
      payload = { SelectedVehicleID: selectedVehicleId };
    } else {
      const editableFields = [];
      uiElements.forEach((el) => {
        if (el.type === "Group") {
          el.children.forEach((c) => {
            if (!c.readOnly) editableFields.push(c.name);
          });
        } else if (!el.readOnly && !el.isBanner) {
          editableFields.push(el.name);
        }
      });

      const unflatten = (data) => {
        const result = {};
        Object.keys(data).forEach((key) => {
          if (!editableFields.includes(key)) return;

          const keyParts = key.split(".");
          const isMetadata = keyParts.some(
            (part) =>
              part === "classID" ||
              part.startsWith("px") ||
              part.startsWith("py") ||
              part.startsWith("pz"),
          );
          if (isMetadata || key.includes("BannerInfoForPrice")) return;

          const parts = key.split(".");
          let current = result;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
              current[part] = data[key];
            } else {
              current[part] = current[part] || {};
              current = current[part];
            }
          }
        });
        return result;
      };
      payload = unflatten(formData);
    }

    setPhase("LOADING");
    setLoadingMsg("Submitting...");
    try {
      const url = `${API_BASE}/assignments/${encodeURIComponent(assignmentId)}/actions/${actionId}?viewType=none`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "If-Match": etag,
        },
        body: JSON.stringify({ content: payload }),
      });

      const newEtag = res.headers.get("ETag") || res.headers.get("etag") || "";
      if (newEtag) setEtag(newEtag);

      const resData = await res.json();
      if (!res.ok) {
        const msgs = resData.errorDetails || resData.validationMessages || [];
        if (msgs.length) {
          setFormErrors(msgs);
          setPhase(phase);
          return;
        }
        throw new Error(`Submit failed: ${res.status}`);
      }

      const nextAssId = resData.nextAssignmentInfo?.ID;
      if (nextAssId) {
        await getAssignment(nextAssId, token);
      } else {
        setFinalResponse(resData);
        setPhase("SUCCESS");
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
      setPhase("ERROR");
    }
  };

  const renderStepper = () =>
    navSteps.length > 0 && (
      <div className="pv-stepper">
        {navSteps.map((s, i) => (
          <div
            key={s.ID}
            className={`pv-step ${s.visited_status === "current" ? "active" : s.visited_status === "completed" ? "done" : ""}`}
          >
            <div className="pv-step-num">{i + 1}</div>
            <span className="pv-step-label">{s.name}</span>
            {i < navSteps.length - 1 && <div className="pv-step-line" />}
          </div>
        ))}
      </div>
    );

  const renderCaseBadge = () =>
    caseDetails.businessID && (
      <div className="pv-case-badge">
        <span>
          <b>{caseDetails.caseType}</b> — {caseDetails.businessID}
        </span>
        <span className="badge">{caseDetails.stage}</span>
        <span className="badge">Status: {caseDetails.status}</span>
        <span
          style={{
            marginLeft: "auto",
            fontWeight: 600,
            color: "var(--accent-blue)",
          }}
        >
          {caseDetails.instructions}
        </span>
      </div>
    );

  const renderUIElement = (el) => {
    if (el.type === "Group") {
      return (
        <div className="form-group-container" key={el.heading}>
          <h3 className="group-heading">{el.heading}</h3>
          <div className="dynamic-form-grid">
            {el.children.map(renderUIElement)}
          </div>
        </div>
      );
    }

    if (el.isBanner) {
      const isAligned = formData.BudgetAlligned ?? contentData.BudgetAlligned;
      const elVariant = el.config?.variant || "info";

      if (isAligned && elVariant !== "info") return null;
      if (!isAligned && elVariant !== "warn") return null;

      return (
        <div
          className={`banner banner-${elVariant}`}
          key={el.name || Math.random()}
        >
          <div className="banner-content">
            {formData[el.name] || el.config?.value || "Notification"}
          </div>
        </div>
      );
    }

    const err = formErrors.find(
      (e) => e.erroneousInputOutputIdentifier === `.${el.name}`,
    );
    const value = formData[el.name] ?? "";

    return (
      <div className="form-group" key={el.name}>
        {el.label && <label>{el.label}</label>}
        {el.isDropdown ? (
          <select
            name={el.name}
            value={value}
            onChange={handleChange}
            disabled={el.readOnly}
          >
            <option value="">Select {el.label}...</option>
            {el.options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.value}
              </option>
            ))}
          </select>
        ) : el.isTextArea ? (
          <textarea
            name={el.name}
            value={value}
            onChange={handleChange}
            readOnly={el.readOnly}
            placeholder={el.label}
          />
        ) : (
          <input
            type={
              el.isNumeric
                ? "number"
                : el.isDate
                  ? "date"
                  : el.isEmail
                    ? "email"
                    : "text"
            }
            name={el.name}
            value={value}
            onChange={handleChange}
            readOnly={el.readOnly}
            placeholder={el.label}
            className={el.readOnly ? "read-only-input" : ""}
          />
        )}
        {err && (
          <div className="error-message">
            {err.localizedValue || err.message}
          </div>
        )}
      </div>
    );
  };

  const renderCompareTable = () => (
    <div className="compare-table-wrapper">
      <table className="compare-table">
        <thead>
          <tr>
            <th className="row-label">Specification</th>
            {availableVehicles.map((v) => (
              <th key={v.ID}>{v.Model}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {compareRows.map((row, i) =>
            row.isHeader ? (
              <tr key={i} className="group-header-row">
                <td colSpan={availableVehicles.length + 1}>{row.label}</td>
              </tr>
            ) : (
              <tr key={i} className="action-row">
                <td className="row-label">{row.label}</td>
                {availableVehicles.map((v) => (
                  <td key={v.ID}>{getNestedVal(v, row.path)}</td>
                ))}
              </tr>
            ),
          )}
          <tr className="action-row">
            <td className="row-label">Select</td>
            {availableVehicles.map((v) => (
              <td key={v.ID} style={{ textAlign: "center" }}>
                <button
                  type="button"
                  className={`btn ${
                    selectedVehicleId === v.ID ? "btn-primary" : "btn-outline"
                  }`}
                  style={{ width: "100%" }}
                  onClick={() => setSelectedVehicleId(v.ID)}
                >
                  {selectedVehicleId === v.ID ? "Selected" : "Select"}
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );

  if (phase === "INIT") {
    return (
      <div className="dashboard-wrapper">
        <div className="loading-container fade-in">
          <h1>Purchase Vehicle Workflow</h1>
          <div className="btn-group-vertical">
            <button className="btn btn-primary" onClick={start}>
              Start Purchase Flow
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowModal(true)}
            >
              Check Purchase Flow
            </button>
          </div>
        </div>

        {showModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Check Existing Case</h3>
              <p>
                Enter the Case ID to continue your existing purchase journey.
              </p>
              <input
                type="text"
                className="modal-input"
                placeholder="e.g. P-20001"
                value={inputCaseId}
                onChange={(e) => setInputCaseId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleLookup}>
                  Lookup Case
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "LOADING") {
    return (
      <div className="dashboard-wrapper">
        <div className="loading-container fade-in">
          <div className="loading-spinner" />
          <p className="subtitle">{loadingMsg}</p>
        </div>
      </div>
    );
  }

  if (phase === "ERROR") {
    return (
      <div className="dashboard-wrapper">
        <div className="loading-container fade-in">
          <p
            className="subtitle"
            style={{ color: "#dc2626", fontWeight: "500" }}
          >
            {error}
          </p>
          <div className="btn-group-vertical">
            <button
              className="btn btn-primary"
              onClick={() => {
                setPhase("INIT");
                setShowModal(true);
              }}
            >
              Check Another Case ID
            </button>
            <button className="btn btn-secondary" onClick={start}>
              Start New Purchase
            </button>
            {onBack && (
              <button className="btn btn-outline" onClick={onBack}>
                ← Back to Menu
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "SUCCESS") {
    const confirmationNote =
      finalResponse?.confirmationNote || "Workflow Completed";
    const caseInfo = finalResponse?.data?.caseInfo || {};
    const finalStatus = caseInfo.status || "Resolved";
    const stages = caseInfo.stages || [];

    return (
      <div className="dashboard-wrapper">
        <div className="main-content fade-in" style={{ padding: "60px 24px" }}>
          <div
            className="form-container"
            style={{ textAlign: "center", maxWidth: "600px" }}
          >
            <h1 style={{ fontSize: "2rem", color: "#16a34a" }}>
              {confirmationNote}
            </h1>

            <div
              className="case-summary-table"
              style={{
                margin: "2rem 0",
                textAlign: "left",
                background: "#f8fafc",
                padding: "1.5rem",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
              }}
            >
              <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>
                Case Summary
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.5fr",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div style={{ color: "var(--text-muted)" }}>Business ID</div>
                <div style={{ fontWeight: "600" }}>
                  {caseInfo.businessID || caseDetails.businessID}
                </div>

                <div style={{ color: "var(--text-muted)" }}>Current Status</div>
                <div>
                  <span
                    className="badge"
                    style={{ background: "#dcfce7", color: "#166534" }}
                  >
                    {finalStatus}
                  </span>
                </div>

                <div style={{ color: "var(--text-muted)" }}>
                  Completion Time
                </div>
                <div>{new Date().toLocaleString()}</div>

                <div style={{ color: "var(--text-muted)" }}>Total Stages</div>
                <div>{stages.length} Stages Completed</div>
              </div>
            </div>

            <div className="stage-timeline" style={{ marginBottom: "2rem" }}>
              <h3
                style={{
                  textAlign: "left",
                  marginBottom: "1rem",
                  fontSize: "1rem",
                }}
              >
                Journey Completed
              </h3>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {stages.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "white",
                      borderRadius: "8px",
                      border: "1px solid #f1f5f9",
                    }}
                  >
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                      }}
                    >
                      ✓
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: "500" }}>
                      {s.name}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {s.visited_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="btn-group-vertical" style={{ maxWidth: "100%" }}>
              <button
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Start New Workflow
              </button>
              {onBack && (
                <button className="btn btn-secondary" onClick={onBack}>
                  Return to Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper">
      <nav className="top-nav">
        <div className="nav-left">
          <span className="nav-title">Purchase Vehicle</span>
          <div className="nav-meta">
            {caseDetails.businessID && (
              <span>
                Case <strong>{caseDetails.businessID}</strong>
              </span>
            )}
            {caseDetails.stage && (
              <span>
                Stage <span className="badge">{caseDetails.stage}</span>
              </span>
            )}
          </div>
        </div>
        {onBack && (
          <button className="btn btn-outline-white" onClick={onBack}>
            ← Back
          </button>
        )}
      </nav>

      <div className="app-body">
        <main className="main-content">
          {renderStepper()}
          {renderCaseBadge()}

          <div className="form-container fade-in">
            <h1>{caseDetails.instructions}</h1>

            <form onSubmit={submitForm} noValidate>
              {phase === "FORM2" ? (
                renderCompareTable()
              ) : uiElements.length > 0 ? (
                <div className="dynamic-form-sections">
                  {uiElements.map(renderUIElement)}
                </div>
              ) : (
                <div className="info-message">
                  <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>
                    📋
                  </div>
                  <p>
                    Please review all information above. Click{" "}
                    <strong>Submit</strong> to finalize your vehicle purchase
                    details.
                  </p>
                </div>
              )}

              {formErrors.length > 0 &&
                formErrors
                  .filter((e) => {
                    const fieldNames = uiElements.flatMap((el) =>
                      el.type === "Group"
                        ? el.children.map((c) => c.name)
                        : [el.name],
                    );
                    return !fieldNames.some(
                      (name) => e.erroneousInputOutputIdentifier === `.${name}`,
                    );
                  })
                  .map((e, i) => (
                    <div
                      key={i}
                      className="error-message global-error"
                      style={{ marginTop: "1.5rem", padding: "12px" }}
                    >
                      <strong>Server Error:</strong>{" "}
                      {e.localizedValue || e.message || "Unknown error"}
                    </div>
                  ))}

              <div className="btn-group" style={{ marginTop: "2rem" }}>
                {actionButtons.secondary.map((btn) => (
                  <button
                    key={btn.actionID}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (btn.actionID === "save") {
                        saveForLater();
                      } else {
                        alert(`Action: ${btn.name}`);
                      }
                    }}
                  >
                    {btn.name}
                  </button>
                ))}
                <button type="submit" className="btn btn-primary">
                  {actionButtons.main?.[0]?.name || "Submit"}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
