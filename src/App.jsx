import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import InspectionDemo from "./InspectionDemo";
import PurchaseVehicleDemo from "./PurchaseVehicleDemo";

const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET;
const API_BASE = import.meta.env.VITE_API_BASE;
const TOKEN_URL = import.meta.env.VITE_TOKEN_URL;
const RETIREMENT_CASE_TYPE_ID = import.meta.env.VITE_RETIREMENT_CASE_TYPE_ID;
const PURCHASE_CASE_TYPE_ID = import.meta.env.VITE_PURCHASE_CASE_TYPE_ID;
const INSPECTION_CASE_TYPE_ID = import.meta.env.VITE_INSPECTION_CASE_TYPE_ID;

const cleanLabel = (text = "") =>
  text
    .replace(/^@FL\s+/, "")
    .replace(/^@L\s+/, "")
    .replace(/^.*\./, "")
    .trim();

const VehicleComparisonTable = ({
  vehicles,
  selectedId,
  onSelect,
  viewConfig,
  uiResources,
}) => {
  if (!vehicles || vehicles.length === 0) {
    return <div className="no-vehicles">No vehicles available</div>;
  }

  const extractRowsFromConfig = () => {
    const rowsToRender = [];
    const processed = new Set();

    const walk = (items = []) => {
      items.forEach((item) => {
        if (item.type === "Group") {
          const groupLabel = cleanLabel(item.config?.heading || item.name);
          rowsToRender.push({
            isGroupHeader: true,
            label: groupLabel,
          });

          walk(item.children || []);
          return;
        }

        if (item.type === "ScalarList") {
          const valuePath = item.config?.value
            ?.replace("@FILTERED_LIST ", "")
            .replace(/\[\]/g, "");

          if (!valuePath) return;

          const pathParts = valuePath.split(".").filter(Boolean);
          const lastPart = pathParts[pathParts.length - 1];

          if (lastPart === "ID") return;

          if (processed.has(valuePath)) return;
          processed.add(valuePath);

          const fieldLabel =
            uiResources?.fields?.[lastPart]?.[0]?.label ||
            cleanLabel(item.config?.label) ||
            lastPart;

          const extractPath = pathParts.slice(1).join(".");

          rowsToRender.push({
            header: false,
            label: fieldLabel,
            path: extractPath,
          });
        }

        if (item.children) walk(item.children);
      });
    };

    walk(viewConfig?.children || []);
    return rowsToRender;
  };

  const rowsToRender = extractRowsFromConfig();

  const getValue = (vehicle, path) => {
    const keys = path.split(".").filter(Boolean);
    let value = vehicle;
    for (const key of keys) {
      value = value?.[key];
    }
    return value || "—";
  };

  return (
    <div className="compare-table-wrapper">
      <table className="compare-table">
        <thead>
          <tr className="group-header-row">
            <th colSpan={vehicles.length + 1}>Name</th>
          </tr>
        </thead>
        <tbody>
          {rowsToRender.map((row, index) =>
            row.isGroupHeader ? (
              <tr key={index} className="group-header-row">
                <td colSpan={vehicles.length + 1}>{row.label}</td>
              </tr>
            ) : (
              <tr key={index}>
                <td className="row-label">{row.label}</td>
                {vehicles.map((vehicle) => (
                  <td key={`${vehicle.ID}-${index}`}>
                    {getValue(vehicle, row.path)}
                  </td>
                ))}
              </tr>
            ),
          )}
          <tr className="action-row">
            <td className="row-label">Select</td>
            {vehicles.map((vehicle) => (
              <td key={`select-${vehicle.ID}`}>
                <button
                  type="button"
                  className={`btn ${
                    selectedId === vehicle.ID ? "btn-primary" : "btn-outline"
                  }`}
                  style={{ width: "100%" }}
                  onClick={() => onSelect(vehicle.ID)}
                >
                  {selectedId === vehicle.ID ? "Selected" : "Select"}
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const renderNestedForm = (
  view,
  formData,
  setFormData,
  handleChange,
  availableVehicles,
  selectedVehicleId,
  onVehicleSelect,
  uiResources = {},
  availableFacilities = [],
) => {
  if (!view?.children) return null;

  const processedFields = new Set();

  const renderChildren = (children, depth = 0) => {
    return children.map((child, index) => {
      const key = `${depth}-${index}`;

      if (child.type === "reference" && child.config?.type === "view") {
        const nestedViewName = child.config.name;
        const nestedView = uiResources?.views?.[nestedViewName]?.[0];

        if (nestedView && nestedViewName === "CompareVehicles") {
          return (
            <div key={key} className="nested-view comparison-view">
              <VehicleComparisonTable
                vehicles={availableVehicles}
                selectedId={selectedVehicleId}
                onSelect={onVehicleSelect}
                viewConfig={nestedView}
                uiResources={uiResources}
              />
            </div>
          );
        }

        if (nestedView) {
          return (
            <div key={key} className="nested-view">
              {renderNestedForm(
                nestedView,
                formData,
                setFormData,
                handleChange,
                availableVehicles,
                selectedVehicleId,
                onVehicleSelect,
                uiResources,
                availableFacilities,
              )}
            </div>
          );
        }

        return null;
      }

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

      if (child.type === "ScalarList") return null;

      if (child.type === "SimpleTableSelect") {
        const cleanPegaStr = (s) => (s || "").replace(/^@(L|FL|P)\s+\.?/, "");
        const label = cleanPegaStr(child.config?.label);
        const columns = child.config?.detailsDisplay || [];
        const referenceList = child.config?.referenceList || "";
        const selectionListProp = (child.config?.selectionList || "").replace(
          /^\./,
          "",
        );
        const rowsData = Array.isArray(formData[selectionListProp])
          ? formData[selectionListProp]
          : [];

        return (
          <div key={key} className="simple-table-select-wrapper">
            {label && <h4 className="group-heading">{label}</h4>}
            <div className="compare-table-wrapper">
              <table className="compare-table">
                <thead>
                  <tr>
                    {columns.map((col, i) => (
                      <th key={i}>
                        {cleanPegaStr(col.config?.label || col.config?.value)}
                      </th>
                    ))}
                    {columns.length === 0 && <th>{referenceList || "Data"}</th>}
                    <th>Select</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsData.length > 0 ? (
                    rowsData.map((row, rIdx) => (
                      <tr key={rIdx} className="action-row">
                        {columns.length > 0 ? (
                          columns.map((col, cIdx) => {
                            const fieldName = cleanPegaStr(col.config?.value);
                            return <td key={cIdx}>{row[fieldName] || ""}</td>;
                          })
                        ) : (
                          <td>{JSON.stringify(row)}</td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{
                              padding: "4px 12px",
                              height: "32px",
                              fontSize: "12px",
                              width: "100%",
                            }}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={(columns.length || 1) + 1}
                        style={{
                          textAlign: "center",
                          padding: "1.5rem",
                          opacity: 0.6,
                        }}
                      >
                        No {label || "records"} available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      if (child.type === "DeferLoad") {
        const cleanPegaStr = (s) => (s || "").replace(/^@(L|FL|P)\s+\.?/, "");
        const labelProp = child.config?.inheritedProps?.find(
          (p) => p.prop === "label",
        );
        const label = cleanPegaStr(labelProp?.value || child.config?.name);
        return (
          <div key={key} className="defer-load-placeholder">
            {label && <span className="sidebar-label">{label}</span>}
            <span
              className="sidebar-value"
              style={{ opacity: 0.5, fontSize: "0.8rem" }}
            ></span>
          </div>
        );
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
            <input
              type={
                child.type === "Email" ||
                fieldMetadata.validateAs === "ValidEmailAddress"
                  ? "email"
                  : "text"
              }
              name={valueField}
              value={value}
              onChange={handleChange}
              placeholder={`Enter ${label}`}
            />
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
              type={
                child.type === "Date"
                  ? "date"
                  : child.type === "Email" ||
                      fieldMetadata.validateAs === "ValidEmailAddress"
                    ? "email"
                    : "text"
              }
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

function App() {
  const [activeDemo, setActiveDemo] = useState("PURCHASE");
  const [resetKey, setResetKey] = useState(0);
  const [step, setStep] = useState("INIT");
  const [activeFlow, setActiveFlow] = useState("RETIREMENT");
  const [flowSequence, setFlowSequence] = useState([
    "RETIREMENT",
    "INSPECTION",
    "PURCHASE",
  ]);
  const [currentFlowIndex, setCurrentFlowIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [actionId, setActionId] = useState("");
  const [etag, setEtag] = useState("");
  const [formData, setFormData] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [loadingMessage, setLoadingMessage] = useState(
    "Configuring context...",
  );
  const [viewFields, setViewFields] = useState([]);
  const [viewStructure, setViewStructure] = useState(null);
  const [uiResources, setUiResources] = useState(null);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [availableFacilities, setAvailableFacilities] = useState([]);

  const [caseDetails, setCaseDetails] = useState({
    urgency: "",
    status: "",
    created: "",
    assignedTo: "",
    type: "",
    businessID: "",
  });

  const handleResetToPurchase = useCallback(() => {
    setActiveDemo("PURCHASE");
    setResetKey((prev) => prev + 1);
  }, []);

  const [layoutInfo, setLayoutInfo] = useState({
    title: "",
    instructions: "",
  });

  const [buttons, setButtons] = useState({
    main: [],
    secondary: [],
  });

  const authRef = useRef(false);

  const autoAuthenticateRef = useRef(null);

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

        const caseInfo = data.data.caseInfo;
        const resources = data.uiResources;
        const currentAssignment = caseInfo.assignments[0];

        setEtag(response.headers.get("ETag") || "");
        setActionId(currentAssignment.actions[0].ID);
        setButtons(resources.actionButtons || { main: [], secondary: [] });

        setCaseDetails({
          urgency: caseInfo.urgency || "N/A",
          status: caseInfo.status || "N/A",
          created: caseInfo.createTime
            ? new Date(caseInfo.createTime).toLocaleDateString()
            : "N/A",
          assignedTo: currentAssignment.assigneeInfo?.name || "Unassigned",
          type:
            caseInfo.caseTypeName ||
            (activeFlow === "RETIREMENT"
              ? "Retirement Calculator"
              : "Purchase Vehicle"),
          businessID: caseInfo.businessID || caseInfo.ID.split(" ").pop(),
        });

        setLayoutInfo({
          title: caseInfo.name || currentAssignment.name || "",
          instructions: currentAssignment.instructions || "",
        });

        const content = caseInfo.content;

        if (activeFlow === "RETIREMENT") {
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
                else if (typeLower.includes("qrcode")) category = "qrcode";

                extractedFields.push({
                  name: fieldName,
                  type: rawType,
                  category: category,
                  inputType: numericTypes.includes(typeLower)
                    ? "number"
                    : typeLower === "checkbox"
                      ? "checkbox"
                      : typeLower === "date"
                        ? "date"
                        : typeLower === "email"
                          ? "email"
                          : "text",
                  label: fieldMetadata.label || fieldName,
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
            setAvailableVehicles(content.AvailableVehicles || []);
            setSelectedVehicleId(content.SelectedVehicleID || "");
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
              "AvailableVehicles",
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
        } else {
          const viewName =
            resources.root?.config?.name ||
            content.pyViewName ||
            currentAssignment.actions[0].ID ||
            "SelectVehicle";
          const viewConfig = resources.resources.views[viewName]?.[0];

          setUiResources(resources.resources);
          setViewStructure(viewConfig);
          setAvailableVehicles(content.AvailableVehicles || []);
          setSelectedVehicleId(content.SelectedVehicleID || "");

          if (
            activeFlow === "INSPECTION" ||
            caseInfo.caseTypeName === "Property Inspection"
          ) {
            console.log("Fetching facilities for complex form...");
            try {
              const dpResponse = await fetch(
                `${API_BASE}/data/D_FacilityList`,
                { headers: { Authorization: `Bearer ${activeToken}` } },
              );
              console.log("Facility fetch response status:", dpResponse.status);
              if (dpResponse.ok) {
                const dpData = await dpResponse.json();
                console.log(
                  "Facilities loaded:",
                  dpData.data?.length || 0,
                  "items",
                );
                setAvailableFacilities(dpData.data || []);
              } else {
                console.error("Facility fetch failed:", dpResponse.status);
              }
            } catch (e) {
              console.error("Failed to fetch facilities", e);
            }
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
            "AvailableVehicles",
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
    [activeFlow, token],
  );

  const createCase = useCallback(
    async (caseTypeId, passedToken) => {
      const activeToken = passedToken || token;
      if (!activeToken) return;

      setLoading(true);
      setStep("LOADING");
      setLoadingMessage("Initializing case...");

      try {
        const response = await fetch(`${API_BASE}/cases?viewType=none`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${activeToken}`,
          },
          body: JSON.stringify({
            content: { pyLabel: "Case Creation" },
            caseTypeID: caseTypeId,
          }),
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
    setLoadingMessage("Authenticating with Pega...");
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

      setCurrentFlowIndex(0);
      setFlowSequence(["RETIREMENT", "INSPECTION", "PURCHASE"]);
      setActiveFlow("RETIREMENT");
      createCase(RETIREMENT_CASE_TYPE_ID, data.access_token);
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
    if (authRef.current || activeDemo !== "RETIREMENT_PURCHASE") return;
    authRef.current = true;
    autoAuthenticate();
  }, [autoAuthenticate, activeDemo]);

  const submitAction = async (e) => {
    if (e) e.preventDefault();

    if (
      activeFlow === "PURCHASE" &&
      actionId === "SelectVehicle" &&
      !selectedVehicleId
    ) {
      alert("Please select a vehicle");
      return;
    }

    if (activeFlow === "INSPECTION") {
      const facilityGuid = formData["FacilityInformation.pyGUID"];
      if (!facilityGuid || facilityGuid === "") {
        alert("Please select a facility from the dropdown");
        return;
      }
    }

    if (activeFlow === "RETIREMENT") {
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
    }

    setLoading(true);
    setValidationErrors([]);

    try {
      const rawPayload =
        activeFlow === "PURCHASE" && actionId === "SelectVehicle"
          ? { ...formData, SelectedVehicleID: selectedVehicleId }
          : formData;

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
      Object.keys(rawPayload).forEach((key) => {
        if (
          !systemFields.has(key) &&
          !key.startsWith("px") &&
          !key.startsWith("py")
        ) {
          if (key.includes(".")) {
            setNestedValue(payload, key, rawPayload[key]);
          } else {
            payload[key] = rawPayload[key];
          }
        }
      });

      const method = "PATCH";

      const response = await fetch(
        `${API_BASE}/assignments/${assignmentId}/actions/${actionId}?viewType=none`,
        {
          method: method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(etag ? { "If-Match": etag } : {}),
          },
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

      if (!response.ok) {
        if (resData && (resData.errorDetails || resData.validationMessages)) {
          setValidationErrors(
            resData.errorDetails || resData.validationMessages,
          );
        }
        setLoading(false);
        return;
      }

      const nextIndex = currentFlowIndex + 1;
      if (nextIndex < flowSequence.length) {
        setCurrentFlowIndex(nextIndex);
        const nextFlow = flowSequence[nextIndex];
        setActiveFlow(nextFlow);

        let nextCaseTypeId;
        if (nextFlow === "RETIREMENT") nextCaseTypeId = RETIREMENT_CASE_TYPE_ID;
        else if (nextFlow === "INSPECTION")
          nextCaseTypeId = INSPECTION_CASE_TYPE_ID;
        else if (nextFlow === "PURCHASE")
          nextCaseTypeId = PURCHASE_CASE_TYPE_ID;

        createCase(nextCaseTypeId, token);
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

  const handleVehicleSelect = (vehicleId) => {
    setSelectedVehicleId(vehicleId);
    setFormData((prev) => ({ ...prev, SelectedVehicleID: vehicleId }));
  };

  const handleRefresh = async (fieldName) => {
    if (activeFlow !== "RETIREMENT") return;
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
      if (response.status === 204) return;
      const text = await response.text();
      if (!text) return;
      try {
        const data = JSON.parse(text);
        if (data.validationMessages || data.errorDetails) {
          const rawErrors = data.validationMessages || data.errorDetails || [];
          setValidationErrors((prev) => {
            const fieldPath = `.${fieldName}`;
            const filtered = prev.filter(
              (e) => e.erroneousInputOutputIdentifier !== fieldPath,
            );
            const newErrors = rawErrors.map((m) => ({
              erroneousInputOutputIdentifier:
                m.path || m.erroneousInputOutputIdentifier || fieldPath,
              localizedValue: m.localizedValue || m.message,
              source: "refresh",
            }));
            return [...filtered, ...newErrors];
          });
        }
      } catch (e) {
        console.error("Failed to parse refresh JSON", e);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const renderDemoMenu = () => (
    <div className="loading-container fade-in">
      <h1>Triple Renderer Hub</h1>
      <p className="subtitle">Pega DX API Demonstrations</p>
      <div className="btn-group-vertical">
        <button
          className="btn btn-primary"
          onClick={() => setActiveDemo("PURCHASE")}
        >
          Purchase Vehicle Flow
        </button>
        <button
          className="btn btn-outline"
          onClick={() => setActiveDemo("INSPECTION")}
        >
          Smart Property Inspection
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setActiveDemo("RETIREMENT_PURCHASE")}
        >
          Legacy Multi-Flow (Retirement + Purchase)
        </button>
      </div>
    </div>
  );

  if (activeDemo === "INSPECTION") {
    return <InspectionDemo onBack={handleResetToPurchase} />;
  }

  if (activeDemo === "PURCHASE") {
    return (
      <PurchaseVehicleDemo key={resetKey} onBack={handleResetToPurchase} />
    );
  }

  return (
    <div className="dashboard-wrapper">
      {/* {activeDemo === "MENU" && renderDemoMenu()} */}

      {activeDemo === "RETIREMENT_PURCHASE" && step === "INIT" && (
        <div className="loading-container fade-in">
          <h1>Triple Renderer Hub</h1>
          <div className="btn-group-vertical">
            <button
              className="btn btn-primary"
              onClick={() => autoAuthenticate()}
              disabled={loading}
            >
              {loading ? (
                <div className="loading-spinner"></div>
              ) : (
                "START FULL FLOW (3 Steps)"
              )}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleResetToPurchase}
              style={{ marginTop: "1rem" }}
            >
              Back to Start
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

      {activeDemo === "RETIREMENT_PURCHASE" &&
        (step === "ASSIGNMENT_READY" || step === "FORM") && (
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
                    {activeFlow === "RETIREMENT" && viewFields.length > 0 ? (
                      <div className="dynamic-form-grid">
                        {viewFields.map((field) => {
                          const isError = validationErrors.find(
                            (e) =>
                              e.erroneousInputOutputIdentifier ===
                              `.${field.name}`,
                          );

                          if (field.category === "qrcode") {
                            const qrValue =
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
                                    alt="QR"
                                    className="qr-code-image"
                                  />
                                  <span className="qr-value-text">
                                    {qrValue}
                                  </span>
                                </div>
                              </div>
                            );
                          }

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
                                    onBlur={
                                      field.name.includes("RetirementAge")
                                        ? () => handleRefresh(field.name)
                                        : undefined
                                    }
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
                        availableVehicles,
                        selectedVehicleId,
                        handleVehicleSelect,
                        uiResources,
                        availableFacilities,
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

                <div className="details-container fade-in">
                  <div className="details-tabs">
                    <div className="tab-item active">Flow Info</div>
                  </div>
                  <div className="details-grid">
                    <div className="sidebar-group">
                      <span className="sidebar-label">Flow Progress</span>
                      <span className="sidebar-value">
                        {currentFlowIndex + 1} of {flowSequence.length} -{" "}
                        {activeFlow}
                      </span>
                    </div>
                    <div className="sidebar-group">
                      <span className="sidebar-label">Case Status</span>
                      <span className="sidebar-value">
                        {caseDetails.status}
                      </span>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </>
        )}

      {activeDemo === "RETIREMENT_PURCHASE" && step === "SUCCESS" && (
        <div className="loading-container fade-in">
          <h1>All Flows Completed</h1>
          <p className="subtitle">
            Retirement → Inspection → Purchase flows have been processed
            successfully.
          </p>
          <button className="btn btn-secondary" onClick={handleResetToPurchase}>
            Back to Start
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
