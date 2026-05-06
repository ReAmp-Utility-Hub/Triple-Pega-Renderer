import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET;
const API_BASE = import.meta.env.VITE_API_BASE;
const TOKEN_URL = import.meta.env.VITE_TOKEN_URL;
const INSPECTION_CASE_TYPE_ID = import.meta.env.VITE_INSPECTION_CASE_TYPE_ID;

const cleanLabel = (text = "") =>
  text
    .replace(/^@FL\s+/, "")
    .replace(/^@L\s+/, "")
    .replace(/^.*\./, "")
    .trim();

const renderNestedForm = (
  view,
  formData,
  setFormData,
  handleChange,
  availableFacilities = [],
  uiResources = {},
) => {
  if (!view?.children) return null;

  const processedFields = new Set();

  const renderChildren = (children, depth = 0) => {
    return children.map((child, index) => {
      const key = `${depth}-${index}`;

      if (child.children) {
        if (child.type === "Region" || child.type === "Group") {
          const isGroup = child.type === "Group";
          const heading = child.config?.heading || child.name;

          return (
            <div
              key={key}
              className={isGroup ? "form-group-section" : "form-region"}
            >
              {heading && isGroup && (
                <h4 className="group-heading">{heading}</h4>
              )}

              <div className={isGroup ? "group-content" : "region-content"}>
                {renderChildren(child.children, depth + 1)}
              </div>
            </div>
          );
        }

        return <div key={key}>{renderChildren(child.children, depth + 1)}</div>;
      }

      if (child.type === "AutoComplete") {
        const valueField = child.config?.value?.replace("@P .", "");
        const parentFieldName = valueField.includes(".")
          ? valueField.split(".")[0]
          : null;
        const fieldName = valueField.includes(".")
          ? valueField.split(".").pop()
          : valueField;

        const parentFieldMetadata = parentFieldName
          ? uiResources?.fields?.[parentFieldName]?.[0]
          : null;
        const fieldMetadata = uiResources?.fields?.[fieldName]?.[0] || {};

        const label =
          parentFieldMetadata?.label ||
          child.config.label?.replace("@FL .", "").replace("@L ", "") ||
          parentFieldName ||
          fieldMetadata.label ||
          fieldName;

        if (processedFields.has(valueField)) return null;

        const parentField = valueField.includes(".")
          ? valueField.split(".")[0]
          : null;
        if (parentField && processedFields.has(parentField)) return null;

        processedFields.add(valueField);
        if (parentField) processedFields.add(parentField);

        const value = formData[valueField] ?? "";

        return (
          <div key={key} className="form-group">
            <label>
              {label}
              {child.config.required && (
                <span className="required-star">*</span>
              )}
            </label>
            <select
              name={valueField}
              value={value}
              onChange={(e) => {
                handleChange({
                  target: {
                    name: valueField,
                    value: e.target.value,
                    type: "text",
                  },
                });
              }}
            >
              <option value="">
                {availableFacilities.length > 0
                  ? `Select ${label}...`
                  : "Loading facilities..."}
              </option>
              {availableFacilities.map((facility) => (
                <option key={facility.pyGUID} value={facility.pyGUID}>
                  {facility.FacilityName || facility.pyGUID}
                </option>
              ))}
            </select>
            {availableFacilities.length === 0 && (
              <small
                style={{
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  display: "block",
                  marginTop: "4px",
                }}
              >
                Please wait while facilities load from API...
              </small>
            )}
          </div>
        );
      }

      if (child.config?.value && child.type !== "reference") {
        const fieldRef = child.config.value;
        const fieldName = fieldRef
          .replace("@FILTERED_LIST ", "")
          .replace("@P .", "")
          .replace(/\[\]/g, "");

        if (fieldName === "pyID") return null;
        if (processedFields.has(fieldName)) return null;

        const parentField = fieldName.includes(".")
          ? fieldName.split(".")[0]
          : null;
        if (parentField && processedFields.has(parentField)) return null;

        processedFields.add(fieldName);

        const simpleFieldName = fieldName.includes(".")
          ? fieldName.split(".").pop()
          : fieldName;
        const fieldMetadata = uiResources?.fields?.[simpleFieldName]?.[0] || {};
        const label =
          fieldMetadata.label ||
          child.config.label?.replace("@FL .", "").replace("@L ", "") ||
          simpleFieldName;

        const value = formData[fieldName] ?? "";

        return (
          <div key={key} className="form-group">
            <label>
              {label}
              {child.config.required && (
                <span className="required-star">*</span>
              )}
            </label>
            <input
              type="text"
              name={fieldName}
              value={value}
              onChange={handleChange}
              readOnly={child.config.readOnly}
              className={child.config.readOnly ? "read-only-input" : ""}
              placeholder={label}
            />
          </div>
        );
      }

      return null;
    });
  };

  return (
    <div className="dynamic-form-grid">{renderChildren(view.children)}</div>
  );
};

function InspectionDemo() {
  const [step, setStep] = useState("INIT");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [actionId, setActionId] = useState("");
  const [etag, setEtag] = useState("");
  const [formData, setFormData] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");
  const [viewFields, setViewFields] = useState([]);
  const [viewStructure, setViewStructure] = useState(null);
  const [uiResources, setUiResources] = useState(null);
  const [availableFacilities, setAvailableFacilities] = useState([]);

  const [caseDetails, setCaseDetails] = useState({
    urgency: "",
    status: "",
    created: "",
    assignedTo: "",
    type: "",
    businessID: "",
  });

  const [layoutInfo, setLayoutInfo] = useState({
    title: "",
    instructions: "",
  });

  const [buttons, setButtons] = useState({
    main: [],
    secondary: [],
  });

  const [apiLog, setApiLog] = useState([]);

  const authRef = useRef(false);
  const autoAuthenticateRef = useRef(null);

  const logApiCall = (method, endpoint, request, response, headers = {}) => {
    setApiLog((prev) => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        method,
        endpoint,
        request,
        response,
        headers,
      },
    ]);
  };

  const getAssignmentDetails = useCallback(
    async (id, passedToken) => {
      const activeToken = passedToken || token;
      try {
        const response = await fetch(
          `${API_BASE}/assignments/${id}?viewType=form`,
          {
            headers: { Authorization: `Bearer ${activeToken}` },
          },
        );
        const data = await response.json();

        const responseEtag = response.headers.get("ETag") || "";
        const caseInfo = data.data.caseInfo;
        const resources = data.uiResources;
        const currentAssignment = caseInfo.assignments[0];

        setEtag(responseEtag);
        setActionId(currentAssignment.actions[0].ID);
        setButtons(resources.actionButtons || { main: [], secondary: [] });

        logApiCall("GET", `/assignments/${id}?viewType=form`, null, data, {
          etag: responseEtag,
        });

        setCaseDetails({
          urgency: caseInfo.urgency || "N/A",
          status: caseInfo.status || "N/A",
          created: caseInfo.createTime
            ? new Date(caseInfo.createTime).toLocaleDateString()
            : "N/A",
          assignedTo: currentAssignment.assigneeInfo?.name || "Unassigned",
          type: caseInfo.caseTypeName || "Property Inspection",
          businessID: caseInfo.businessID || caseInfo.ID.split(" ").pop(),
        });

        setLayoutInfo({
          title: caseInfo.name || currentAssignment.name || "",
          instructions: currentAssignment.instructions || "",
        });

        const content = caseInfo.content;
        const fields = resources.resources.fields;
        const viewName =
          resources.root?.config?.name || content.pyViewName || "Create";
        const extractedFields = [];
        const viewConfig = resources.resources.views[viewName]?.[0];

        const complexTypes = new Set([
          "reference",
          "simpletableselect",
          "deferload",
          "datatablecolumn",
          "datareference",
        ]);

        const hasComplexChildren =
          viewConfig?.children?.[0]?.children?.some(
            (c) =>
              complexTypes.has((c.type || "").toLowerCase()) ||
              (c.type === "reference" && c.config?.type === "view"),
          ) ?? false;

        if (!hasComplexChildren && viewConfig?.children?.[0]?.children) {
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

              let category = "input";
              if (selectionTypes.includes(typeLower)) category = "select";
              else if (typeLower === "textarea") category = "textarea";
              else if (typeLower === "checkbox") category = "checkbox";

              extractedFields.push({
                name: fieldName,
                type: rawType,
                category: category,
                inputType: numericTypes.includes(typeLower)
                  ? "number"
                  : typeLower === "checkbox"
                    ? "checkbox"
                    : "text",
                label: fieldMetadata.label || cleanLabel(fieldName),
                required:
                  fieldObj.config.required === true ||
                  fieldMetadata.required === true,
                config: fieldObj.config,
                iconLeft: typeLower === "currency" ? "$" : null,
                iconRight: typeLower === "percentage" ? "%" : null,
                options: fieldMetadata.options || [],
              });
            }
          });

          setViewFields(extractedFields);
          const initialData = {};
          extractedFields.forEach((field) => {
            initialData[field.name] = content[field.name] ?? "";
          });
          setFormData(initialData);
          setViewStructure(null);
          setUiResources(null);
        } else {
          setViewFields([]);
          setUiResources(resources.resources);
          setViewStructure(viewConfig);

          try {
            const dpResponse = await fetch(`${API_BASE}/data/D_FacilityList`, {
              headers: { Authorization: `Bearer ${activeToken}` },
            });
            if (dpResponse.ok) {
              const dpData = await dpResponse.json();
              setAvailableFacilities(dpData.data || []);
            }
          } catch (e) {
            console.error("Failed to fetch facilities", e);
          }

          const skipKeys = new Set([
            "classID",
            "pxObjClass",
            "pxUrgencyWork",
            "pxCreateOperator",
            "pxUpdateDateTime",
            "pxUpdateOperator",
            "pxCreateDateTime",
            "pyStatusWork",
            "pyID",
            "pyLabel",
            "pyCaseType",
          ]);
          const initialData = {};

          const extractFields = (obj, prefix = "") => {
            Object.keys(obj).forEach((key) => {
              if (skipKeys.has(key)) return;
              const fullKey = prefix ? `${prefix}.${key}` : key;
              const value = obj[key];
              if (value === null || value === undefined) {
                initialData[fullKey] = "";
              } else if (typeof value === "object" && !Array.isArray(value)) {
                extractFields(value, fullKey);
              } else if (!Array.isArray(value)) {
                initialData[fullKey] = value;
              }
            });
          };

          extractFields(content);
          setFormData(initialData);
        }

        setStep("ASSIGNMENT_READY");
        setLoading(false);
      } catch (err) {
        console.error(err);
      }
    },
    [token],
  );

  const createCase = useCallback(
    async (caseTypeId, passedToken) => {
      const activeToken = passedToken || token;
      if (!activeToken) return;

      setLoading(true);
      setStep("LOADING");
      setLoadingMessage("Creating case...");

      try {
        const requestBody = {
          content: { pyLabel: "Property Inspection Request" },
          caseTypeID: caseTypeId,
        };

        const response = await fetch(`${API_BASE}/cases?viewType=none`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${activeToken}`,
          },
          body: JSON.stringify(requestBody),
        });

        const text = await response.text();
        let resData = null;
        if (text) {
          try {
            resData = JSON.parse(text);
          } catch (e) {
            console.error("Failed to parse JSON", e);
          }
        }

        logApiCall("POST", "/cases?viewType=none", requestBody, resData);

        if (!response.ok) {
          if (response.status === 401) {
            authRef.current = false;
            if (autoAuthenticateRef.current) {
              await autoAuthenticateRef.current();
            }
            return;
          }
          if (resData && (resData.errorDetails || resData.validationMessages)) {
            setValidationErrors(
              resData.errorDetails || resData.validationMessages,
            );
          }
          setStep("ASSIGNMENT_READY");
          return;
        }

        const assId = resData.nextAssignmentInfo.ID;
        setAssignmentId(assId);
        getAssignmentDetails(assId, activeToken);
      } catch (err) {
        console.error(err);
        setStep("INIT");
      } finally {
        setLoading(false);
      }
    },
    [getAssignmentDetails, token],
  );

  const autoAuthenticate = useCallback(async () => {
    setLoading(true);
    setStep("LOADING");
    setLoadingMessage("Authenticating with Pega (Client Credentials)...");
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

      if (!response.ok)
        throw new Error(`Auth failed with status: ${response.status}`);

      const data = await response.json();
      setToken(data.access_token);

      logApiCall(
        "POST",
        "/oauth2/v1/token",
        { grant_type: "client_credentials", client_id: CLIENT_ID },
        {
          access_token: data.access_token.substring(0, 20) + "...",
          token_type: data.token_type,
        },
      );

      createCase(INSPECTION_CASE_TYPE_ID, data.access_token);
    } catch (err) {
      console.error(err);
      setLoadingMessage(`Error: ${err.message}`);
      setTimeout(() => setStep("INIT"), 3000);
    } finally {
      setLoading(false);
    }
  }, [createCase]);

  useEffect(() => {
    autoAuthenticateRef.current = autoAuthenticate;
  }, [autoAuthenticate]);

  useEffect(() => {
    if (authRef.current) return;
    authRef.current = true;
  }, []);

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

    const facilityGuid = formData["FacilityInformation.pyGUID"];
    if (!facilityGuid || facilityGuid === "") {
      alert("Please select a facility from the dropdown");
      return;
    }

    setLoading(true);
    setValidationErrors([]);

    try {
      const systemFields = new Set([
        "pyID",
        "pyLabel",
        "pyCaseType",
        "pxObjClass",
        "classID",
        "pxCreateDateTime",
        "pxCreateOperator",
        "pxUpdateDateTime",
        "pxUpdateOperator",
        "pyStatusWork",
        "pxUrgencyWork",
      ]);

      const setNestedValue = (obj, path, value) => {
        const keys = path.split(".");
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!(keys[i] in current)) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
      };

      const payload = {};
      Object.keys(formData).forEach((key) => {
        if (
          !systemFields.has(key) &&
          !key.startsWith("px") &&
          !key.startsWith("py")
        ) {
          if (key.includes(".")) {
            setNestedValue(payload, key, formData[key]);
          } else {
            payload[key] = formData[key];
          }
        }
      });

      const requestHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(etag ? { "If-Match": etag } : {}),
      };

      const response = await fetch(
        `${API_BASE}/assignments/${assignmentId}/actions/${actionId}?viewType=none`,
        {
          method: "PATCH",
          headers: requestHeaders,
          body: JSON.stringify({ content: payload }),
        },
      );

      const newEtag = response.headers.get("ETag");
      if (newEtag) setEtag(newEtag);

      const text = await response.text();
      let resData = null;
      if (text) {
        try {
          resData = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse JSON", e);
        }
      }

      logApiCall(
        "PATCH",
        `/assignments/${assignmentId}/actions/${actionId}?viewType=none`,
        { content: payload },
        resData,
        { "If-Match": etag, newEtag },
      );

      if (!response.ok) {
        if (resData && (resData.errorDetails || resData.validationMessages)) {
          setValidationErrors(
            resData.errorDetails || resData.validationMessages,
          );
        }
        setLoading(false);
        return;
      }

      if (resData?.nextAssignmentInfo?.ID) {
        const nextAssId = resData.nextAssignmentInfo.ID;
        setAssignmentId(nextAssId);
        getAssignmentDetails(nextAssId, token);
      } else {
        setLoading(false);
        setStep("SUCCESS");
      }
    } catch (err) {
      console.error(err);
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

  return (
    <div className="dashboard-wrapper">
      {step === "INIT" && (
        <div className="loading-container fade-in">
          <h1>Smart Property Inspection</h1>
          <p className="subtitle">DX API Demo - Custom Component</p>
          <div className="btn-group-vertical">
            <button
              className="btn btn-primary"
              onClick={() => autoAuthenticate()}
              disabled={loading}
            >
              {loading ? (
                <div className="loading-spinner"></div>
              ) : (
                "START INSPECTION FLOW"
              )}
            </button>
          </div>
        </div>
      )}

      {step === "LOADING" && (
        <div className="loading-container fade-in">
          <div className="loading-spinner"></div>
          <p className="subtitle">{loadingMessage}</p>
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
                  Status <span className="badge">{caseDetails.status}</span>
                </span>
                <span>
                  ID <strong>{caseDetails.businessID}</strong>
                </span>
              </div>
            </div>
          </nav>
          <div className="app-body">
            <main className="main-content">
              <div className="form-container fade-in">
                <h1>{layoutInfo.title}</h1>
                <p className="subtitle">{layoutInfo.instructions}</p>

                <form onSubmit={submitAction} noValidate>
                  {viewFields.length > 0 ? (
                    <div className="dynamic-form-grid">
                      {viewFields.map((field) => {
                        const isError = validationErrors.find(
                          (e) =>
                            e.erroneousInputOutputIdentifier ===
                            `.${field.name}`,
                        );

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
                                  onChange={handleChange}
                                  rows="3"
                                />
                              ) : field.category === "checkbox" ? (
                                <label className="checkbox-label">
                                  <input
                                    type="checkbox"
                                    name={field.name}
                                    checked={!!formData[field.name]}
                                    onChange={(e) =>
                                      setFormData((prev) => ({
                                        ...prev,
                                        [field.name]: e.target.checked,
                                      }))
                                    }
                                  />
                                  {field.label}
                                </label>
                              ) : (
                                <input
                                  type={field.inputType}
                                  name={field.name}
                                  value={formData[field.name] ?? ""}
                                  onChange={handleChange}
                                  className={`${field.iconLeft ? "has-icon-left" : ""} ${field.iconRight ? "has-icon-right" : ""}`}
                                />
                              )}
                              {field.iconRight && (
                                <span className="input-icon-right">
                                  {field.iconRight}
                                </span>
                              )}
                            </div>
                            {isError && (
                              <div className="error-message">
                                {isError.localizedValue}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    viewStructure &&
                    renderNestedForm(
                      viewStructure,
                      formData,
                      setFormData,
                      handleChange,
                      availableFacilities,
                      uiResources,
                    )
                  )}

                  <div className="btn-group">
                    {buttons.secondary?.map((btn, i) => (
                      <button
                        key={i}
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => console.log(`${btn.name} clicked`)}
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
                            style={{ width: "16px", height: "16px" }}
                          ></div>
                        ) : (
                          btn.name
                        )}
                      </button>
                    ))}
                  </div>
                </form>
              </div>

              {apiLog.length > 0 && (
                <div className="api-log-container">
                  <h3>DX API Call Log</h3>
                  <div className="api-log-entries">
                    {apiLog.map((log, index) => (
                      <div key={index} className="api-log-entry">
                        <div className="api-log-header">
                          <span className="api-method">{log.method}</span>
                          <span className="api-endpoint">{log.endpoint}</span>
                          <span className="api-timestamp">{log.timestamp}</span>
                        </div>
                        {log.request && (
                          <div className="api-section">
                            <strong>Request:</strong>
                            <pre>{JSON.stringify(log.request, null, 2)}</pre>
                          </div>
                        )}
                        {log.headers && Object.keys(log.headers).length > 0 && (
                          <div className="api-section">
                            <strong>Headers:</strong>
                            <pre>{JSON.stringify(log.headers, null, 2)}</pre>
                          </div>
                        )}
                        {log.response && (
                          <div className="api-section">
                            <strong>Response:</strong>
                            <pre>
                              {JSON.stringify(log.response, null, 2).substring(
                                0,
                                500,
                              )}
                              ...
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </main>

            <aside className="details-container fade-in">
              <div className="details-tabs">
                <div className="tab-item active">Flow Info</div>
              </div>
              <div className="details-grid">
                <div className="sidebar-group">
                  <span className="sidebar-label">Assignment ID</span>
                  <span
                    className="sidebar-value"
                    style={{ fontSize: "0.75rem" }}
                  >
                    {assignmentId}
                  </span>
                </div>
                <div className="sidebar-group">
                  <span className="sidebar-label">Action ID</span>
                  <span className="sidebar-value">{actionId}</span>
                </div>
                <div className="sidebar-group">
                  <span className="sidebar-label">ETag</span>
                  <span
                    className="sidebar-value"
                    style={{ fontSize: "0.7rem" }}
                  >
                    {etag ? etag.substring(0, 30) + "..." : "N/A"}
                  </span>
                </div>
                <div className="sidebar-group">
                  <span className="sidebar-label">Case Status</span>
                  <span className="sidebar-value">{caseDetails.status}</span>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      {step === "SUCCESS" && (
        <div className="loading-container fade-in">
          <h1>Inspection Completed</h1>
          <p className="subtitle">
            The property inspection case has been processed successfully.
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setStep("INIT");
              setApiLog([]);
              setAssignmentId("");
              setActionId("");
              setEtag("");
              setFormData({});
            }}
          >
            START NEW INSPECTION
          </button>
        </div>
      )}
    </div>
  );
}

export default InspectionDemo;
