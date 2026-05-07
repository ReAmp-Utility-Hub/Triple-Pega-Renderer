import { useState, useCallback } from "react";

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
          isEmail: n.type === "Email" || meta.validateAs === "ValidEmailAddress",
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

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((p) => ({
      ...p,
      [name]: type === "number" ? (value === "" ? "" : Number(value)) : value,
    }));
  };

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
    setActionButtons(uiRes.actionButtons || { main: [], secondary: [] });

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

  const start = useCallback(async () => {
    setPhase("LOADING");
    setError("");
    try {
      setLoadingMsg("Authenticating...");
      const authRes = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
      });
      if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
      const { access_token: tok } = await authRes.json();
      setToken(tok);

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
      // Re-construct nested payload from flat formData
      // Only send fields that are NOT read-only
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
          // Skip if field is read-only or not in uiElements
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
      const isAligned = contentData.BudgetAlligned;
      const variant = el.config?.variant || "info";
      if (variant === "warn" && isAligned === true) return null;
      if (variant === "info" && isAligned === false) return null;

      return (
        <div
          className={`banner banner-${variant}`}
          key={el.name || Math.random()}
        >
          <span className="banner-icon">ℹ️</span>
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
              el.isNumeric ? "number" : el.isDate ? "date" : el.isEmail ? "email" : "text"
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
          <h1>Purchase Vehicle</h1>
          <p className="subtitle">Pega DX API — Purchase Vehicle Workflow</p>
          <div className="btn-group-vertical">
            <button className="btn btn-primary" onClick={start}>
              Start Purchase Flow
            </button>
            {onBack && (
              <button className="btn btn-secondary" onClick={onBack}>
                ← Back to Menu
              </button>
            )}
          </div>
        </div>
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
          <h1>Something went wrong</h1>
          <p className="subtitle" style={{ color: "#dc2626" }}>
            {error}
          </p>
          <div className="btn-group-vertical">
            <button className="btn btn-primary" onClick={start}>
              Retry
            </button>
            {onBack && (
              <button className="btn btn-secondary" onClick={onBack}>
                ← Back
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

    return (
      <div className="dashboard-wrapper">
        <div className="loading-container fade-in">
          <div style={{ fontSize: "3rem" }}>✅</div>
          <h1>{confirmationNote}</h1>
          <p className="subtitle">
            Case <b>{caseInfo.businessID || caseDetails.businessID}</b> has been
            updated.
          </p>
          <div
            className="pv-case-badge"
            style={{ justifyContent: "center", border: "none" }}
          >
            <span className="badge" style={{ fontSize: "1rem" }}>
              Status: {finalStatus}
            </span>
          </div>
          <div className="btn-group-vertical" style={{ marginTop: "2rem" }}>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Start New Workflow
            </button>
            {onBack && (
              <button className="btn btn-secondary" onClick={onBack}>
                ← Back to Menu
              </button>
            )}
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
              ) : (
                <div className="dynamic-form-sections">
                  {uiElements.map(renderUIElement)}
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
                    onClick={() => alert(`Action: ${btn.name}`)}
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

      <style>{`
        .pv-stepper { display: flex; align-items: center; width: 100%; max-width: 1000px; margin-bottom: 1.5rem; }
        .pv-step { display: flex; align-items: center; gap: 8px; position: relative; flex: 1; }
        .pv-step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--border-color); color: var(--text-muted); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .pv-step.active .pv-step-num { background: var(--accent-blue); color: white; }
        .pv-step.done .pv-step-num { background: #16a34a; color: white; }
        .pv-step-label { font-size: 13px; font-weight: 500; color: var(--text-muted); white-space: nowrap; }
        .pv-step-line { flex: 1; height: 2px; background: var(--border-color); margin: 0 8px; }
        .pv-case-badge { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 1000px; padding: 10px 16px; background: white; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; margin-bottom: 1rem; }
        
        .form-group-container { margin-bottom: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
        .group-heading { font-size: 1.1rem; color: var(--text-main); margin-bottom: 1rem; border-bottom: 2px solid var(--accent-blue); display: inline-block; padding-bottom: 4px; }
        
        .banner { display: flex; align-items: flex-start; gap: 12px; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid; }
        .banner-info { background: #eff6ff; border-color: #3b82f6; color: #1e40af; }
        .banner-warn { background: #fffbeb; border-color: #f59e0b; color: #92400e; }
        .banner-icon { font-size: 1.2rem; }
        
        .read-only-input { background-color: #f1f5f9; cursor: not-allowed; border-color: #cbd5e1; }
        textarea { width: 100%; min-height: 80px; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; font-family: inherit; }
        
        .btn-group-vertical { display: flex; flex-direction: column; gap: 12px; width: 280px; }
      `}</style>
    </div>
  );
}
