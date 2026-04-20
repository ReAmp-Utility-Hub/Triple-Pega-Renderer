import { useState, useEffect, useRef } from "react";
import "./App.css";

const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET;
const API_BASE = import.meta.env.VITE_API_BASE;
const TOKEN_URL = import.meta.env.VITE_TOKEN_URL;

function App() {
  const [step, setStep] = useState("INIT");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [actionId, setActionId] = useState("");
  const [etag, setEtag] = useState("");
  const [formData, setFormData] = useState({});
  const [viewFields, setViewFields] = useState([]);
  const [layoutInfo, setLayoutInfo] = useState({ title: "", instructions: "" });
  const [caseDetails, setCaseDetails] = useState({
    urgency: "",
    status: "",
    created: "",
    assignedTo: "",
    type: "",
  });
  const [validationErrors, setValidationErrors] = useState([]);
  const [confirmation, setConfirmation] = useState("");
  const authRef = useRef(false);

  const [buttons, setButtons] = useState({ main: [], secondary: [] });

  useEffect(() => {
    if (authRef.current) return;
    authRef.current = true;
    autoAuthenticate();
  }, []);

  const autoAuthenticate = async () => {
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "client_credentials");
      params.append("client_id", CLIENT_ID);
      params.append("client_secret", CLIENT_SECRET);
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      if (!response.ok) throw new Error("Auth failed");
      const data = await response.json();
      setToken(data.access_token);
      // Automatically trigger case creation
      createCase(data.access_token);
    } catch (err) {
      console.error(err);
    }
  };

  const createCase = async (passedToken) => {
    const activeToken = typeof passedToken === "string" ? passedToken : token;
    if (!activeToken) return;
    setLoading(true);
    setStep("LOADING");
    try {
      const response = await fetch(`${API_BASE}/cases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          content: { pyLabel: "Case Creation" },
          caseTypeID: "OQ7AIU-Smart-Work-RetirementCalculator",
        }),
      });
      if (response.status === 401) {
        authRef.current = false;
        await autoAuthenticate();
        setStep("INIT");
        return;
      }
      const data = await response.json();
      const assId = data.nextAssignmentInfo.ID;
      setAssignmentId(assId);
      getAssignmentDetails(assId);
    } catch (err) {
      console.error(err);
      setStep("INIT");
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentDetails = async (id) => {
    try {
      const response = await fetch(
        `${API_BASE}/assignments/${id}?viewType=form`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json();
      const caseInfo = data.data.caseInfo;
      const uiResources = data.uiResources;
      const currentAssignment = caseInfo.assignments[0];
      setEtag(response.headers.get("ETag") || "");
      setActionId(currentAssignment.actions[0].ID);
      const fields = uiResources.resources.fields;
      setButtons(uiResources.actionButtons || { main: [], secondary: [] });
      setCaseDetails({
        urgency: caseInfo.urgency || "N/A",
        status: caseInfo.status || "N/A",
        created: caseInfo.createTime
          ? new Date(caseInfo.createTime).toLocaleDateString()
          : "N/A",
        assignedTo: currentAssignment.assigneeInfo?.name || "Unassigned",
        type: caseInfo.caseTypeName || "Retirement Calculator",
        businessID: caseInfo.businessID || caseInfo.ID.split(" ").pop(),
      });
      const viewName = caseInfo.content.pyViewName || "Create";
      const extractedFields = [];
      const viewConfig = uiResources.resources.views[viewName]?.[0];
      if (viewConfig && viewConfig.children?.[0]?.children) {
        const fieldsArray = viewConfig.children[0].children;
        const numericTypes = [
          "integer",
          "decimal",
          "currency",
          "percentage",
          "double",
        ];
        const selectionTypes = ["dropdown", "autocomplete", "radiobuttons"];

        fieldsArray.forEach((fieldObj) => {
          if (fieldObj.config && fieldObj.config.value) {
            const fieldName = fieldObj.config.value.replace("@P .", "");
            const fieldMetadata = fields[fieldName]?.[0] || {};
            const rawType = fieldObj.type || fieldMetadata.type || "";
            const typeLower = rawType.toLowerCase();

            // Determine the structural category of the component
            let category = "input";
            if (selectionTypes.includes(typeLower)) category = "select";
            else if (typeLower === "textarea") category = "textarea";
            else if (typeLower === "checkbox") category = "checkbox";
            else if (typeLower.includes("qrcode")) category = "qrcode";

            extractedFields.push({
              name: fieldName,
              type: rawType,
              category: category,
              inputType: numericTypes.includes(typeLower)
                ? "number"
                : typeLower === "checkbox"
                  ? "checkbox"
                  : "text",
              label: fieldMetadata.label || fieldName,
              required:
                fieldObj.config.required === true ||
                fieldMetadata.required === true,
              config: fieldObj.config,
              iconLeft: typeLower === "currency" ? "$" : null,
              iconRight: typeLower === "percentage" ? "%" : null,
              options: fieldMetadata.options || [], // Capture options for dropdowns/radios
            });
          }
        });
      }
      setViewFields(extractedFields);
      setLayoutInfo({
        title: caseInfo.name || "",
        instructions: currentAssignment.instructions || "",
      });
      const content = caseInfo.content;
      const initialData = {};
      extractedFields.forEach((field) => {
        initialData[field.name] = content[field.name] ?? "";
      });
      setFormData(initialData);
      setStep("ASSIGNMENT_READY");
    } catch (err) {
      console.error(err);
    }
  };

  const submitAction = async (e) => {
    if (e) e.preventDefault();
    const clientErrors = [];
    viewFields.forEach((field) => {
      if (
        field.required &&
        (formData[field.name] === undefined || formData[field.name] === "")
      ) {
        clientErrors.push({
          erroneousInputOutputIdentifier: `.${field.name}`,
          localizedValue: "Please fill out this field",
          source: "client",
        });
      }
    });
    if (clientErrors.length > 0) {
      setValidationErrors(clientErrors);
      return;
    }
    setLoading(true);
    setValidationErrors([]);
    try {
      const response = await fetch(
        `${API_BASE}/assignments/${assignmentId}/actions/${actionId}?viewType=none`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "If-Match": etag,
          },
          body: JSON.stringify({ content: formData }),
        },
      );

      const newEtag = response.headers.get("ETag");
      if (newEtag) setEtag(newEtag);

      const text = await response.text();
      let resData = {};
      if (text) {
        try {
          resData = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse JSON", e);
        }
      }

      if (resData.confirmationNote) {
        setConfirmation(resData.confirmationNote);
        setStep("SUCCESS");
      } else if (resData.content) {
        setFormData(resData.content);
        setStep("FORM");
      } else if (
        resData.errorClassification === "Validation fail" ||
        resData.errorClassification === "Invalid inputs"
      ) {
        setValidationErrors(resData.errorDetails);
        setStep("ASSIGNMENT_READY");
      } else if (!response.ok) {
        setValidationErrors([
          {
            localizedValue: `Submission failed with status ${response.status}`,
            source: "client",
          },
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? "" : Number(value)) : value,
    }));
  };

  const handleRefresh = async (fieldName) => {
    try {
      const response = await fetch(
        `${API_BASE}/assignments/${assignmentId}/actions/${actionId}/refresh?refreshFor=.${fieldName}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "If-Match": etag,
          },
          body: JSON.stringify({ content: formData, pageInstructions: [] }),
        },
      );

      const newEtag = response.headers.get("ETag");
      if (newEtag) setEtag(newEtag);

      if (response.status === 204) {
        setValidationErrors((prev) =>
          prev.filter(
            (e) => e.erroneousInputOutputIdentifier !== `.${fieldName}`,
          ),
        );
        return;
      }

      const text = await response.text();
      if (!text) {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        setValidationErrors((prev) =>
          prev.filter(
            (e) => e.erroneousInputOutputIdentifier !== `.${fieldName}`,
          ),
        );
        return;
      }

      let data = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse refresh JSON", e);
      }

      const rawErrors = data.validationMessages || data.errorDetails || [];
      const errors = rawErrors
        .filter((m) => m.message || m.localizedValue)
        .map((m) => ({
          erroneousInputOutputIdentifier:
            m.path || m.erroneousInputOutputIdentifier || `.${fieldName}`,
          localizedValue: m.localizedValue || m.message,
          source: "refresh",
        }));

      setValidationErrors((prev) => {
        const withoutField = prev.filter(
          (e) => e.erroneousInputOutputIdentifier !== `.${fieldName}`,
        );
        return [...withoutField, ...errors];
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="dashboard-wrapper">
      {step === "INIT" && (
        <div className="loading-container fade-in">
          <h1>Retirement Calculator</h1>
          <button
            className="btn btn-primary"
            onClick={createCase}
            disabled={loading || !token}
          >
            {loading ? (
              <div className="loading-spinner"></div>
            ) : (
              "INITIALIZE ASSESSMENT"
            )}
          </button>
        </div>
      )}

      {step === "LOADING" && (
        <div className="loading-container fade-in">
          <div className="loading-spinner"></div>
          <p className="subtitle">Configuring context...</p>
        </div>
      )}

      {(step === "ASSIGNMENT_READY" || step === "FORM") && (
        <>
          <nav className="top-nav">
            <div className="nav-left">
              <span className="nav-title">{caseDetails.type}</span>
              <div className="nav-meta">
                <span>
                  Urgency <span className="badge">{caseDetails.urgency}</span>
                </span>
                <span>
                  Work Status{" "}
                  <span className="badge">{caseDetails.status}</span>
                </span>
                <span>
                  Created By <strong>{caseDetails.assignedTo}</strong>
                </span>
              </div>
            </div>
          </nav>
          <div className="app-body">
            <main className="main-content">
              <div className="form-container fade-in">
                {validationErrors.filter((e) => e.source === "refresh").length >
                  0 && (
                  <div className="global-error-box">
                    {validationErrors
                      .filter((e) => e.source === "refresh")
                      .map((e, idx, arr) => (
                        <div
                          key={idx}
                          style={{
                            marginBottom: idx === arr.length - 1 ? 0 : "4px",
                          }}
                        >
                          {e.localizedValue || e.message}
                        </div>
                      ))}
                  </div>
                )}
                <h1>
                  {layoutInfo.title}{" "}
                  <span className="case-id-tag">{caseDetails.businessID}</span>
                </h1>
                <p className="subtitle">{layoutInfo.instructions}</p>
                <form onSubmit={submitAction} noValidate>
                  <div className="dynamic-form-grid">
                    {viewFields.map((field) => {
                      const isError = validationErrors.find(
                        (e) =>
                          e.erroneousInputOutputIdentifier === `.${field.name}`,
                      );

                      // Handle custom QR Code component
                      if (field.category === "qrcode") {
                        const qrValueProperty =
                          field.config?.inputProperty?.replace("@P .", "") ||
                          field.name;
                        const qrValue =
                          formData[qrValueProperty] ||
                          formData[field.name] ||
                          caseDetails.businessID ||
                          "";

                        return (
                          <div
                            className="form-group"
                            key={field.name}
                            style={{
                              gridColumn: "span 2",
                              alignItems: "center",
                            }}
                          >
                            <label>{field.label}</label>
                            <div className="qr-code-wrapper">
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrValue)}`}
                                alt="QR Code"
                                className="qr-code-image"
                              />
                              <span className="qr-value-text">
                                {qrValue || "Waiting for data..."}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      // Render based on component category
                      return (
                        <div
                          className={`form-group ${field.category === "checkbox" ? "checkbox-group" : ""}`}
                          key={field.name}
                        >
                          {field.category !== "checkbox" && (
                            <label>
                              {field.label}
                              {field.required && (
                                <span className="required-star">*</span>
                              )}
                            </label>
                          )}

                          <div className="input-wrapper">
                            {field.iconLeft && (
                              <span className="input-icon-left">
                                {field.iconLeft}
                              </span>
                            )}

                            {field.category === "select" ? (
                              <select
                                name={field.name}
                                value={formData[field.name] ?? ""}
                                onChange={handleChange}
                                className={`${isError ? "input-error" : ""}`}
                              >
                                <option value="">
                                  Select {field.label}...
                                </option>
                                {field.options.map((opt) => (
                                  <option
                                    key={opt.key || opt.value}
                                    value={opt.key || opt.value}
                                  >
                                    {opt.value}
                                  </option>
                                ))}
                              </select>
                            ) : field.category === "textarea" ? (
                              <textarea
                                name={field.name}
                                value={formData[field.name] ?? ""}
                                placeholder={field.label}
                                onChange={handleChange}
                                className={`${isError ? "input-error" : ""}`}
                                rows="3"
                              />
                            ) : field.category === "checkbox" ? (
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  name={field.name}
                                  checked={
                                    formData[field.name] === true ||
                                    formData[field.name] === "true"
                                  }
                                  onChange={(e) =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      [field.name]: e.target.checked,
                                    }))
                                  }
                                />
                                {field.label}
                                {field.required && (
                                  <span className="required-star">*</span>
                                )}
                              </label>
                            ) : (
                              <input
                                type={field.inputType}
                                name={field.name}
                                value={formData[field.name] ?? ""}
                                placeholder={field.label}
                                onChange={handleChange}
                                onFocus={() =>
                                  setValidationErrors((prev) =>
                                    prev.filter(
                                      (e) =>
                                        e.erroneousInputOutputIdentifier !==
                                        `.${field.name}`,
                                    ),
                                  )
                                }
                                onBlur={
                                  field.name.includes("RetirementAge")
                                    ? () => handleRefresh(field.name)
                                    : undefined
                                }
                                autoComplete="off"
                                className={`${isError ? "input-error" : ""} ${field.iconLeft ? "has-icon-left" : ""} ${field.iconRight ? "has-icon-right" : ""}`}
                              />
                            )}

                            {field.iconRight && (
                              <span className="input-icon-right">
                                {field.iconRight}
                              </span>
                            )}
                          </div>
                          {isError && isError.source !== "refresh" && (
                            <div className="error-message">
                              {isError.localizedValue || isError.message}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="btn-group">
                    {buttons.secondary?.map((btn, i) => (
                      <button
                        key={i}
                        type="button"
                        className="btn btn-secondary"
                      >
                        {btn.name}
                      </button>
                    ))}
                    {buttons.main?.map((btn, i) => (
                      <button
                        key={i}
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                      >
                        {loading ? (
                          <div
                            className="loading-spinner"
                            style={{
                              width: "16px",
                              height: "16px",
                              borderWidth: "2px",
                            }}
                          ></div>
                        ) : (
                          btn.name
                        )}
                      </button>
                    ))}
                  </div>
                </form>
              </div>

              <div className="details-container fade-in">
                <div className="details-tabs">
                  <div className="tab-item">Summary</div>
                  <div className="tab-item active">Details</div>
                  <div className="tab-item">Policy Details</div>
                  <div className="tab-item">Pulse</div>
                  <div className="tab-item">History</div>
                </div>
                <div className="details-grid">
                  <div className="sidebar-group">
                    <span className="sidebar-label">Case ID</span>
                    <span className="sidebar-value">
                      {caseDetails.businessID}
                    </span>
                  </div>
                  <div className="sidebar-group">
                    <span className="sidebar-label">Label</span>
                    <span className="sidebar-value">{caseDetails.type}</span>
                  </div>
                  <div className="sidebar-group">
                    <span className="sidebar-label">Urgency</span>
                    <span className="sidebar-value">{caseDetails.urgency}</span>
                  </div>
                  <div className="sidebar-group">
                    <span className="sidebar-label">Work Status</span>
                    <span className="sidebar-value">{caseDetails.status}</span>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </>
      )}

      {step === "SUCCESS" && (
        <div className="loading-container fade-in">
          <h1>Processed</h1>
          <p className="subtitle">{confirmation}</p>
          <button className="btn btn-secondary" onClick={() => setStep("INIT")}>
            RESET
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
